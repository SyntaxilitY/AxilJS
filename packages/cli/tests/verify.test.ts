import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  BUNDLED_ENFORCED,
  classify,
  findWiringGaps,
  loadEnforcedSet,
  maskSource,
  parseTestOutput,
  scanDecorators,
  scanSource,
  verify
} from '../src/commands/verify'
import type { TestRunner, VerifyReport } from '../src/commands/verify'

let dir: string
let logs: string[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'axil-verify-'))
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  rmSync(dir, { recursive: true, force: true })
})

function write(rel: string, content: string): void {
  const full = join(dir, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

const PAYMENTS = `import { tRetry, tTimeout, tAuth, tHttp } from '@axiljs/decorator'

// @tCache in a comment must not count
@tAuth({ roles: ['admin'] })
export class PaymentService {
  @tRetry({ attempts: 3 })
  @tTimeout({ ms: 500 })
  async charge(): Promise<void> {
    const note = '@tHedge inside a string'
  }

  @tHttp({
    method: 'GET',
    path: '/payments'
  })
  list(): string[] { return [] }
}
`

const LEDGER = `import { tRetry } from '@axiljs/decorator'
import { wire } from '@axiljs/runtime'

export class Ledger {
  @tRetry()
  async post(): Promise<void> {}
}

wire(Ledger)
`

const passingRunner: TestRunner = async () => ({
  code: 0,
  output: '[AxilJS Test] Running tests...\n  ✓ works (2ms)\n──────\n3 passed  (12ms)\n'
})

describe('static scan', () => {
  it('masks comments and strings but keeps line numbers', () => {
    const masked = maskSource("a // @tX\nb '@tY' \"x\" `@tZ\n` /* @tW */ c")
    expect(masked).not.toMatch(/@t[XYZW]/)
    expect(masked.split('\n')).toHaveLength(3)
    expect(masked).toContain('c')
  })

  it('finds decorators with line numbers and owning class, ignoring comments and strings', () => {
    const r = scanSource(PAYMENTS, 'src/payments.ts')
    expect(r.uses.map(u => `${u.name}:${u.line}:${u.owner}`)).toEqual([
      'tAuth:4:PaymentService',
      'tRetry:6:PaymentService',
      'tTimeout:7:PaymentService',
      'tHttp:12:PaymentService'
    ])
    expect(r.classes).toEqual([{ name: 'PaymentService', file: 'src/payments.ts', line: 5 }])
    expect(r.wireCalls).toBe(0)
  })

  it('classifies enforced vs metadata-only and marks behavioural metadata-only decorators', () => {
    write('src/payments.ts', PAYMENTS)
    write('src/ledger.ts', LEDGER)
    write('src/payments.test.ts', '@tCache() class T {}')        // tests are skipped
    write('src/types.d.ts', 'declare const x: number // @tLock') // declarations too

    const scan = scanDecorators(dir)
    expect(scan.files).toEqual(['src/ledger.ts', 'src/payments.ts'])

    const summary = classify(scan, [...BUNDLED_ENFORCED])
    const by = Object.fromEntries(summary.map(s => [s.name, s]))
    expect(summary[0].name).toBe('tRetry')
    expect(by.tRetry).toMatchObject({ status: 'enforced', count: 2, locations: ['src/ledger.ts:5', 'src/payments.ts:6'] })
    expect(by.tTimeout.status).toBe('enforced')
    expect(by.tAuth).toMatchObject({ status: 'metadata-only', category: 'Security', runtimeSemantics: true })
    expect(by.tHttp).toMatchObject({ status: 'metadata-only', category: 'HTTP', runtimeSemantics: false })
    expect(by.tCache).toBeUndefined()
    expect(by.tLock).toBeUndefined()
  })

  it('uses the project\'s @axiljs/runtime when installed, else the bundled list', () => {
    expect(loadEnforcedSet(dir)).toMatchObject({ source: 'bundled', names: [...BUNDLED_ENFORCED] })

    write('package.json', '{"name":"app"}')
    write('node_modules/@axiljs/runtime/package.json', '{"name":"@axiljs/runtime","version":"9.9.9","main":"index.js"}')
    write('node_modules/@axiljs/runtime/index.js',
      "exports.enforcedDecorators = () => [{ decorator: 'tAuth', order: 1 }, { decorator: 'tRetry', order: 2 }]")
    expect(loadEnforcedSet(dir)).toEqual({ source: 'runtime', version: '9.9.9', names: ['tAuth', 'tRetry'] })
  })
})

describe('wiring heuristic', () => {
  it('flags classes with enforced decorators that never reach wire()', () => {
    write('src/payments.ts', PAYMENTS)
    write('src/ledger.ts', LEDGER)
    const gaps = findWiringGaps(scanDecorators(dir), [...BUNDLED_ENFORCED])
    expect(gaps).toEqual([{
      class: 'PaymentService',
      file: 'src/payments.ts',
      line: 5,
      decorators: ['tRetry', 'tTimeout'],
      reason: 'PaymentService is never passed to wire()'
    }])
  })

  it('says so when src has no wire() call at all', () => {
    write('src/payments.ts', PAYMENTS)
    const [gap] = findWiringGaps(scanDecorators(dir), [...BUNDLED_ENFORCED])
    expect(gap.reason).toBe('no wire()/wireAll() call anywhere in src/')
  })

  it('accepts wire(new X()), wire(this) and wireAll()', () => {
    const enforced = [...BUNDLED_ENFORCED]
    const viaNew = scanSource(`${PAYMENTS}\nexport const payments = wire(new PaymentService())\n`, 'a.ts')
    expect(findWiringGaps({ files: ['a.ts'], ...viaNew }, enforced)).toEqual([])

    const viaThis = scanSource(PAYMENTS.replace('async charge', 'constructor() { wire(this) }\n  async charge'), 'b.ts')
    expect(findWiringGaps({ files: ['b.ts'], ...viaThis }, enforced)).toEqual([])

    const viaAll = scanSource(`${PAYMENTS}\nwireAll()\n`, 'c.ts')
    expect(viaAll.wireAll).toBe(true)
    expect(findWiringGaps({ files: ['c.ts'], ...viaAll }, enforced)).toEqual([])

    const commented = scanSource(`${PAYMENTS}\n// wireAll()\n// wire(PaymentService)\n`, 'd.ts')
    expect(findWiringGaps({ files: ['d.ts'], ...commented }, enforced)).toHaveLength(1)
  })
})

describe('test output parsing', () => {
  it('extracts counts and intent violations with the failing test', () => {
    const out = [
      '\x1b[36m[AxilJS Test]\x1b[0m Running tests...',
      '\x1b[1mPayments\x1b[0m',
      '  \x1b[31m✗\x1b[0m charges once \x1b[90m(3ms)\x1b[0m',
      '    \x1b[31mPaymentService.charge violates tIdempotent: different result for the same key\x1b[0m',
      '    \x1b[90mIntentViolationError: PaymentService.charge violates tIdempotent: different result for the same key\x1b[0m',
      '  \x1b[31m✗\x1b[0m plain failure \x1b[90m(1ms)\x1b[0m',
      '    \x1b[31mexpected 1 to be 2\x1b[0m',
      '──────',
      '\x1b[32m4 passed\x1b[0m, \x1b[31m2 failed\x1b[0m, \x1b[33m1 skipped\x1b[0m  \x1b[90m(9ms)\x1b[0m'
    ].join('\n')
    const parsed = parseTestOutput(out)
    expect(parsed.counts).toEqual({ passed: 4, failed: 2, skipped: 1 })
    expect(parsed.noTests).toBe(false)
    expect(parsed.violations).toEqual([{
      decorator: 'tIdempotent',
      target: 'PaymentService.charge',
      detail: 'different result for the same key',
      test: 'charges once'
    }])
  })

  it('recognises a project without tests', () => {
    expect(parseTestOutput('  ▲  No test files found.').noTests).toBe(true)
  })
})

describe('axil verify', () => {
  beforeEach(() => {
    write('src/payments.ts', PAYMENTS)
    write('src/ledger.ts', LEDGER)
  })

  const lastJson = (): VerifyReport => JSON.parse(logs.join('\n'))

  it('--json prints only a JSON report with the documented shape', async () => {
    const runner = vi.fn(passingRunner)
    await verify({ cwd: dir, json: true, runTests: runner })

    expect(logs).toHaveLength(1)
    const report = lastJson()
    expect(Object.keys(report)).toEqual(
      ['project', 'enforced', 'files', 'summary', 'decorators', 'unenforced', 'wiring', 'tests', 'strict', 'ok'])
    expect(report.enforced.source).toBe('bundled')
    expect(report.files).toBe(2)
    expect(report.summary).toEqual({ uses: 5, distinct: 4, enforced: 3, metadataOnly: 2 })
    expect(report.unenforced).toEqual(['tAuth'])
    expect(report.wiring.map(w => w.class)).toEqual(['PaymentService'])
    expect(report.tests).toEqual({ ran: true, passed: true, exitCode: 0, counts: { passed: 3, failed: 0, skipped: 0 }, violations: [] })
    expect(report.ok).toBe(true)
    expect(process.exitCode).toBeUndefined()
  })

  it('runs tests with AXIL_INTENT_MODE=enforce and the pattern', async () => {
    const runner = vi.fn(passingRunner)
    await verify({ cwd: dir, json: true, pattern: 'pay', runTests: runner })
    expect(runner).toHaveBeenCalledTimes(1)
    const [cwd, pattern, env] = runner.mock.calls[0]
    expect(cwd).toBe(dir)
    expect(pattern).toBe('pay')
    expect(env.AXIL_INTENT_MODE).toBe('enforce')
  })

  it('--static does not run the tests', async () => {
    const runner = vi.fn(passingRunner)
    const report = await verify({ cwd: dir, json: true, static: true, runTests: runner })
    expect(runner).not.toHaveBeenCalled()
    expect(report.tests).toBeNull()
    expect(lastJson().tests).toBeNull()
  })

  it('exits 1 when tests fail and reports intent violations', async () => {
    const report = await verify({
      cwd: dir,
      json: true,
      runTests: async () => ({
        code: 1,
        output: '  ✗ charges once (3ms)\n    Ledger.post violates tPure: wrote to this.total\n0 passed, 1 failed  (4ms)\n'
      })
    })
    expect(process.exitCode).toBe(1)
    expect(report.ok).toBe(false)
    expect(report.tests?.violations).toEqual([
      { decorator: 'tPure', target: 'Ledger.post', detail: 'wrote to this.total', test: 'charges once' }])
    expect(report.tests?.output).toContain('violates tPure')
  })

  it('--strict fails on unenforced behavioural decorators and unwired classes', async () => {
    await verify({ cwd: dir, json: true, static: true })
    expect(process.exitCode).toBeUndefined()

    const report = await verify({ cwd: dir, json: true, static: true, strict: true })
    expect(report.ok).toBe(false)
    expect(process.exitCode).toBe(1)
  })

  it('renders the rail with both sections in human mode', async () => {
    await verify({ cwd: dir, static: true })
    const text = logs.join('\n')
    expect(text).toContain('axil verify')
    expect(text).toContain('Enforced at runtime')
    expect(text).toContain('Metadata only')
    expect(text).toContain('PaymentService looks unwired')
    expect(text).toContain('src/payments.ts:6')
  })
})
