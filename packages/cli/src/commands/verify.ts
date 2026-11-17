/**
 * axil verify [pattern]
 * Does the code keep the promises its decorators declare?
 *
 *   1. Static scan of src/**\/*.ts: every t* decorator used, where, and
 *      whether @axiljs/runtime enforces it or it is metadata only. Classes
 *      with enforced decorators that never reach wire()/wireAll() are
 *      flagged (heuristic).
 *   2. Runs the tests like `axil test` with AXIL_INTENT_MODE=enforce, so a
 *      broken contract throws IntentViolationError and fails its test.
 *
 *   axil verify            scan + tests
 *   axil verify --static   scan only
 *   axil verify --json     machine-readable (pure JSON on stdout)
 *   axil verify --strict   also fail on unenforced behavioural decorators / missing wiring
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative } from 'node:path'

import { DECORATOR_CATALOG } from './decorator-catalog'
import * as ui from '../ui'

// ============================================================================
// ENFORCED SET
// ============================================================================

/** Decorators with a built-in interceptor in @axiljs/runtime 0.3.4+. */
export const BUNDLED_ENFORCED: readonly string[] = [
  'tDeprecated', 'tSlo', 'tPure', 'tReadOnly', 'tSideEffect', 'tTenantIsolated', 'tIdempotent',
  'tAudit', 'tRateLimit', 'tThrottle', 'tDeadline', 'tDebounce', 'tCache', 'tCachePut',
  'tCacheEvict', 'tCacheInvalidate', 'tDedupe', 'tFallback', 'tRetry', 'tCircuitBreaker',
  'tBulkhead', 'tConcurrency', 'tMutex', 'tLock', 'tHedge', 'tTimeout'
]

export interface EnforcedSet {
  names:    string[]
  source:   'runtime' | 'bundled'
  version?: string
}

/**
 * The enforced set from the project's own @axiljs/runtime (so custom or newer
 * interceptors count), else the bundled list.
 */
export function loadEnforcedSet(cwd: string): EnforcedSet {
  try {
    const req = createRequire(join(cwd, 'package.json'))
    const entry = req.resolve('@axiljs/runtime')
    const mod = req(entry)
    const list = typeof mod.enforcedDecorators === 'function'
      ? mod.enforcedDecorators()
      : typeof mod.listInterceptors === 'function' ? mod.listInterceptors() : undefined
    if (Array.isArray(list) && list.length > 0) {
      const names = list.map((e: { decorator?: unknown }) => e?.decorator).filter((n: unknown): n is string => typeof n === 'string')
      if (names.length > 0) return { names: Array.from(new Set<string>(names)), source: 'runtime', version: packageVersion(entry) }
    }
  } catch {}
  return { names: [...BUNDLED_ENFORCED], source: 'bundled' }
}

function packageVersion(entry: string): string | undefined {
  let dir = dirname(entry)
  for (let i = 0; i < 5; i++) {
    const file = join(dir, 'package.json')
    if (existsSync(file)) {
      try {
        const pkg = JSON.parse(readFileSync(file, 'utf8'))
        if (pkg.name === '@axiljs/runtime') return pkg.version
      } catch {}
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

// ============================================================================
// RUNTIME SEMANTICS
// ============================================================================

/**
 * Catalog categories whose decorators promise behaviour at call time (as
 * opposed to routing, schema, documentation or input-shape declarations).
 */
const BEHAVIOURAL_CATEGORIES = new Set([
  'Security', 'Policy', 'Data', 'Reliability', 'Concurrency', 'Distributed', 'Messaging',
  'Caching', 'Compliance', 'Runtime', 'Workflow', 'Execution', 'Observability'
])

/**
 * Behavioural-category decorators that only describe shape, or that
 * @axiljs/runtime applies outside interceptors (redact()/redactResponses()).
 */
const NOT_BEHAVIOURAL = new Set(['tEntity', 'tColumn', 'tPrimaryKey', 'tRelation', 'tSensitive', 'tRedact'])

const CATALOG = new Map(DECORATOR_CATALOG.map(d => [d.name, d]))

function hasRuntimeSemantics(name: string): boolean {
  const info = CATALOG.get(name)
  return info !== undefined && BEHAVIOURAL_CATEGORIES.has(info.category) && !NOT_BEHAVIOURAL.has(name)
}

// ============================================================================
// STATIC SCAN
// ============================================================================

export interface DecoratorUse {
  name:     string
  file:     string
  line:     number
  /** Enclosing (or decorated) class, when there is one. */
  owner?:   string
}

export interface ClassInfo {
  name: string
  file: string
  line: number
}

export interface ScanResult {
  files:     string[]
  uses:      DecoratorUse[]
  classes:   ClassInfo[]
  /** Class names passed to wire(...) (or wired via wire(this) inside them). */
  wired:     string[]
  wireCalls: number
  wireAll:   boolean
}

/** src/**\/*.ts, without declarations, tests and node_modules. */
export function listSourceFiles(srcDir: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, item.name)
      if (item.isDirectory()) {
        if (item.name !== 'node_modules' && !item.name.startsWith('.')) walk(full)
      } else if (
        item.isFile() && item.name.endsWith('.ts') && !item.name.endsWith('.d.ts') &&
        !/\.(test|spec)\.ts$/.test(item.name)
      ) {
        out.push(full)
      }
    }
  }
  if (statSync(srcDir, { throwIfNoEntry: false })?.isDirectory()) walk(srcDir)
  return out.sort()
}

/**
 * Blank comments and string/template contents (newlines kept, so offsets and
 * line numbers stay valid). Not a TS parser: good enough to find decorators,
 * class bodies and wire() calls without matching text inside strings.
 */
export function maskSource(source: string): string {
  const out = source.split('')
  const n = source.length
  let i = 0
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '
  }
  while (i < n) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? n : end
      blank(i, stop)
      i = stop
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? n : end + 2
      blank(i, stop)
      i = stop
    } else if (ch === '\'' || ch === '"' || ch === '`') {
      let j = i + 1
      while (j < n && source[j] !== ch) {
        if (source[j] === '\\') j++
        else if (ch !== '`' && source[j] === '\n') break
        j++
      }
      blank(i + 1, Math.min(j, n))
      i = j + 1
    } else {
      i++
    }
  }
  return out.join('')
}

function lineAt(starts: number[], offset: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return starts
}

interface ClassRange { name: string; start: number; open: number; close: number }

function classRanges(code: string): ClassRange[] {
  const ranges: ClassRange[] = []
  const re = /\bclass\s+([A-Za-z_$][\w$]*)[^{;]*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    const open = m.index + m[0].length - 1
    let depth = 0
    let close = code.length
    for (let k = open; k < code.length; k++) {
      if (code[k] === '{') depth++
      else if (code[k] === '}' && --depth === 0) { close = k; break }
    }
    ranges.push({ name: m[1], start: m.index, open, close })
  }
  return ranges
}

/** Scan one file's source. `file` is the label used in results. */
export function scanSource(source: string, file: string): Omit<ScanResult, 'files'> {
  const code = maskSource(source)
  const starts = lineStarts(code)
  const ranges = classRanges(code)

  const ownerAt = (offset: number): string | undefined => {
    // Innermost class body containing the offset: a member decorator
    let inner: ClassRange | undefined
    for (const r of ranges) {
      if (r.open < offset && offset < r.close && (!inner || r.open > inner.open)) inner = r
    }
    if (inner) return inner.name
    // Otherwise a class decorator: the next class declaration
    return ranges.find(r => r.start > offset)?.name
  }

  const uses: DecoratorUse[] = []
  const decoRe = /@(t[A-Z][A-Za-z0-9]*)\b/g
  let m: RegExpExecArray | null
  while ((m = decoRe.exec(code))) {
    uses.push({ name: m[1], file, line: lineAt(starts, m.index), owner: ownerAt(m.index) })
  }

  const wired: string[] = []
  let wireCalls = 0
  const wireRe = /(?<![\w$.])wire\s*\(\s*(?:new\s+)?([A-Za-z_$][\w$]*)?/g
  while ((m = wireRe.exec(code))) {
    if (/function\s+$/.test(code.slice(Math.max(0, m.index - 12), m.index))) continue
    wireCalls++
    if (m[1] === 'this') {
      const owner = ownerAt(m.index)
      if (owner) wired.push(owner)
    } else if (m[1]) {
      wired.push(m[1])
    }
  }
  const wireAll = /(?<![\w$.])wireAll\s*\(/.test(code.replace(/function\s+wireAll\s*\(/g, ''))

  return {
    uses,
    classes: ranges.map(r => ({ name: r.name, file, line: lineAt(starts, r.start) })),
    wired,
    wireCalls,
    wireAll
  }
}

/** Scan `<cwd>/src`. File labels are relative to cwd with forward slashes. */
export function scanDecorators(cwd: string): ScanResult {
  const files = listSourceFiles(join(cwd, 'src'))
  const result: ScanResult = { files: [], uses: [], classes: [], wired: [], wireCalls: 0, wireAll: false }
  for (const full of files) {
    const label = relative(cwd, full).replace(/\\/g, '/')
    const r = scanSource(readFileSync(full, 'utf8'), label)
    result.files.push(label)
    result.uses.push(...r.uses)
    result.classes.push(...r.classes)
    result.wired.push(...r.wired)
    result.wireCalls += r.wireCalls
    result.wireAll = result.wireAll || r.wireAll
  }
  return result
}

// ============================================================================
// CLASSIFICATION
// ============================================================================

export type DecoratorStatus = 'enforced' | 'metadata-only'

export interface DecoratorSummary {
  name:             string
  category:         string | null
  status:           DecoratorStatus
  /** Promises call-time behaviour (catalog category based). */
  runtimeSemantics: boolean
  count:            number
  locations:        string[]
}

export interface WiringGap {
  class:      string
  file:       string
  line:       number
  decorators: string[]
  reason:     string
}

export function classify(scan: ScanResult, enforced: string[]): DecoratorSummary[] {
  const set = new Set(enforced)
  const byName = new Map<string, DecoratorSummary>()
  for (const use of scan.uses) {
    let s = byName.get(use.name)
    if (!s) {
      s = {
        name:             use.name,
        category:         CATALOG.get(use.name)?.category ?? null,
        status:           set.has(use.name) ? 'enforced' : 'metadata-only',
        runtimeSemantics: set.has(use.name) || hasRuntimeSemantics(use.name),
        count:            0,
        locations:        []
      }
      byName.set(use.name, s)
    }
    s.count++
    s.locations.push(`${use.file}:${use.line}`)
  }
  return Array.from(byName.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * Heuristic: classes with enforced decorators that no wire()/wireAll() call
 * reaches. wireAll() anywhere counts as wiring everything; wire(X),
 * wire(new X()) and wire(this) inside X count for X. A wire(instance)
 * through a variable is invisible to this check.
 */
export function findWiringGaps(scan: ScanResult, enforced: string[]): WiringGap[] {
  if (scan.wireAll) return []
  const set = new Set(enforced)
  const wired = new Set(scan.wired)
  const byClass = new Map<string, Set<string>>()
  for (const use of scan.uses) {
    if (!use.owner || !set.has(use.name)) continue
    const key = `${use.file}\0${use.owner}`
    if (!byClass.has(key)) byClass.set(key, new Set())
    byClass.get(key)!.add(use.name)
  }
  const gaps: WiringGap[] = []
  for (const [key, names] of byClass) {
    const [file, name] = key.split('\0')
    if (wired.has(name)) continue
    const cls = scan.classes.find(c => c.file === file && c.name === name)
    gaps.push({
      class:      name,
      file,
      line:       cls?.line ?? 0,
      decorators: Array.from(names).sort(),
      reason:     scan.wireCalls === 0
        ? 'no wire()/wireAll() call anywhere in src/'
        : `${name} is never passed to wire()`
    })
  }
  return gaps.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

// ============================================================================
// TEST RUN
// ============================================================================

export interface IntentViolationReport {
  decorator: string
  target:    string
  detail:    string
  /** Failing test the violation was reported under, when known. */
  test?:     string
}

export interface TestCounts { passed: number; failed: number; skipped: number }

export interface TestReport {
  ran:        boolean
  passed:     boolean
  exitCode:   number
  counts?:    TestCounts
  violations: IntentViolationReport[]
  /** Why tests did not run (no test files, …). */
  note?:      string
  /** Captured output (ANSI stripped), only when the run failed. */
  output?:    string
}

/** Pull counts and intent violations out of `axil test` output. */
export function parseTestOutput(raw: string): { counts?: TestCounts; violations: IntentViolationReport[]; noTests: boolean } {
  const text = ui.stripAnsi(raw)
  const lines = text.split(/\r?\n/)
  const violations: IntentViolationReport[] = []
  const seen = new Set<string>()
  let currentTest: string | undefined
  let counts: TestCounts | undefined

  for (const line of lines) {
    const failedTest = line.match(/^\s*✗\s+(.+?)(?:\s+\(\d+ms\))?\s*$/)
    if (failedTest) { currentTest = failedTest[1]; continue }

    const summary = line.match(/^\s*(\d+) passed(?:, (\d+) failed)?(?:, (\d+) skipped)?/)
    if (summary) {
      counts = { passed: Number(summary[1]), failed: Number(summary[2] ?? 0), skipped: Number(summary[3] ?? 0) }
      continue
    }

    if (!/IntentViolationError|violates t[A-Z]/.test(line)) continue
    const v = line.match(/(\S+) violates (t[A-Z][A-Za-z0-9]*):\s*(.*)$/)
    const report: IntentViolationReport = v
      ? { decorator: v[2], target: v[1], detail: v[3].trim() }
      : { decorator: 'unknown', target: 'unknown', detail: line.trim() }
    if (currentTest) report.test = currentTest
    const key = `${report.test}|${report.decorator}|${report.target}|${report.detail}`
    if (seen.has(key)) continue
    // A bare "IntentViolationError" line (e.g. a stack header) adds nothing
    // when the same test already has a parsed violation
    if (!v && violations.some(x => x.test === report.test && report.test !== undefined)) continue
    seen.add(key)
    violations.push(report)
  }

  return { counts, violations, noTests: /No test files found|No tests match/.test(text) }
}

export type TestRunner = (cwd: string, pattern: string | undefined, env: NodeJS.ProcessEnv) => Promise<{ code: number; output: string }>

/** `axil test [pattern]` in a child process (same entry, same loader flags). */
const runAxilTest: TestRunner = (cwd, pattern, env) => new Promise((done, reject) => {
  const entry = join(__dirname, '..', `cli${extname(__filename) || '.js'}`)
  const child = spawn(process.execPath, [...process.execArgv, entry, 'test', ...(pattern ? [pattern] : [])], { cwd, env })
  let output = ''
  child.stdout?.on('data', chunk => { output += chunk })
  child.stderr?.on('data', chunk => { output += chunk })
  child.on('error', reject)
  child.on('close', code => done({ code: code ?? 1, output }))
})

// ============================================================================
// COMMAND
// ============================================================================

export interface VerifyOptions {
  pattern?: string
  static?:  boolean
  json?:    boolean
  strict?:  boolean
  cwd?:     string
  /** Override the test runner (tests). */
  runTests?: TestRunner
  /** Override the enforced set (tests). */
  enforced?: EnforcedSet
}

export interface VerifyReport {
  project:    string
  enforced:   { source: 'runtime' | 'bundled'; version?: string; decorators: string[] }
  files:      number
  summary:    { uses: number; distinct: number; enforced: number; metadataOnly: number }
  decorators: DecoratorSummary[]
  /** Metadata-only decorators whose catalog semantics need runtime behaviour. */
  unenforced: string[]
  /** Heuristic: classes with enforced decorators that look unwired. */
  wiring:     WiringGap[]
  tests:      TestReport | null
  strict:     boolean
  ok:         boolean
}

const MAX_LOCATIONS = 3

function locations(list: string[]): string {
  const shown = list.slice(0, MAX_LOCATIONS).join(', ')
  return list.length > MAX_LOCATIONS ? `${shown} ${ui.muted(`+${list.length - MAX_LOCATIONS}`)}` : shown
}

export async function verify(options: VerifyOptions = {}): Promise<VerifyReport> {
  const cwd = options.cwd ?? process.cwd()
  const json = options.json === true
  const strict = options.strict === true

  if (!json) ui.title('verify', 'Do the decorators keep their promises?')

  // ---- static scan --------------------------------------------------------
  const enforcedSet = options.enforced ?? loadEnforcedSet(cwd)
  const scan = scanDecorators(cwd)
  const decorators = classify(scan, enforcedSet.names)
  const wiring = findWiringGaps(scan, enforcedSet.names)
  const unenforced = decorators.filter(d => d.status === 'metadata-only' && d.runtimeSemantics).map(d => d.name)

  const enforcedUses = decorators.filter(d => d.status === 'enforced').reduce((n, d) => n + d.count, 0)
  const summary = {
    uses:         scan.uses.length,
    distinct:     decorators.length,
    enforced:     enforcedUses,
    metadataOnly: scan.uses.length - enforcedUses
  }

  if (!json) renderScan(scan, enforcedSet, decorators, wiring, unenforced, strict)

  // ---- tests ----------------------------------------------------------------
  let tests: TestReport | null = null
  if (!options.static) {
    const env = { ...process.env, AXIL_INTENT_MODE: 'enforce' }
    if (!json) ui.section('Tests')
    const spin = json ? null : ui.spinner('Running tests with AXIL_INTENT_MODE=enforce')
    const run = await (options.runTests ?? runAxilTest)(cwd, options.pattern, env)
    const parsed = parseTestOutput(run.output)
    tests = {
      ran:        !parsed.noTests,
      passed:     run.code === 0,
      exitCode:   run.code,
      counts:     parsed.counts,
      violations: parsed.violations
    }
    if (parsed.noTests) tests.note = options.pattern ? `no tests match "${options.pattern}"` : 'no test files found'
    if (run.code !== 0) tests.output = ui.stripAnsi(run.output).replace(/\s+$/, '')

    if (spin) renderTests(spin, tests, run.output)
  }

  // ---- verdict --------------------------------------------------------------
  const testsFailed = tests !== null && !tests.passed
  const strictFailed = strict && (unenforced.length > 0 || wiring.length > 0)
  const ok = !testsFailed && !strictFailed
  if (!ok) process.exitCode = 1

  const report: VerifyReport = {
    project:    cwd,
    enforced:   { source: enforcedSet.source, version: enforcedSet.version, decorators: [...enforcedSet.names].sort() },
    files:      scan.files.length,
    summary,
    decorators,
    unenforced,
    wiring,
    tests,
    strict,
    ok
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2))
    return report
  }

  if (ok) {
    const what = tests === null ? 'Static checks passed' : tests.ran ? 'Promises kept' : 'Static checks passed, no tests ran'
    ui.done(what)
    ui.outro()
  } else {
    const reasons: string[] = []
    if (tests && tests.violations.length > 0) reasons.push(`${tests.violations.length} intent violation(s)`)
    else if (testsFailed) reasons.push('tests failed')
    if (strictFailed && unenforced.length > 0) reasons.push(`${unenforced.length} unenforced decorator(s)`)
    if (strictFailed && wiring.length > 0) reasons.push(`${wiring.length} class(es) look unwired`)
    ui.failed('Verify failed', reasons.join(', '))
  }

  return report
}

// ============================================================================
// RENDERING
// ============================================================================

function renderScan(
  scan: ScanResult,
  enforced: EnforcedSet,
  decorators: DecoratorSummary[],
  wiring: WiringGap[],
  unenforced: string[],
  strict: boolean
): void {
  const source = enforced.source === 'runtime'
    ? `@axiljs/runtime${enforced.version ? ` ${enforced.version}` : ''}`
    : 'bundled list (@axiljs/runtime not installed)'
  ui.info(`Scanned ${scan.files.length} file(s) in ${ui.path('src/')}`, `enforced set: ${source}, ${enforced.names.length} decorator(s)`)

  if (decorators.length === 0) {
    ui.warn('No t* decorators found.', scan.files.length === 0 ? 'no .ts files under src/' : undefined)
    return
  }

  const enforcedList = decorators.filter(d => d.status === 'enforced')
  const metadataList = decorators.filter(d => d.status === 'metadata-only')

  if (enforcedList.length > 0) {
    ui.section('Enforced at runtime')
    ui.table(enforcedList.map(d => [ui.cmd(`@${d.name}`), ui.muted(`${d.count}×`), locations(d.locations)]), { gap: 3 })
  }

  if (metadataList.length > 0) {
    ui.section('Metadata only')
    ui.table(metadataList.map(d => [
      ui.cmd(`@${d.name}`),
      ui.muted(`${d.count}×`),
      d.runtimeSemantics ? ui.c.yellow('not enforced') : ui.muted(d.category ?? 'not in catalog'),
      locations(d.locations)
    ]), { gap: 3 })
    if (unenforced.length > 0) {
      const tone = strict ? ui.warn : ui.info
      tone(
        `${unenforced.length} decorator(s) promise runtime behaviour nothing enforces`,
        strict ? 'fails with --strict' : 'add an interceptor (registerInterceptor) or treat them as documentation'
      )
    }
  }

  ui.section('Wiring  (heuristic)')
  if (wiring.length === 0) {
    ui.success(scan.wireAll ? 'wireAll() is called' : 'Every class with enforced decorators reaches wire()')
  } else {
    for (const gap of wiring) {
      ui.warn(`${gap.class} looks unwired`, `${gap.reason}`)
      ui.detail(`${gap.file}:${gap.line}  uses ${gap.decorators.map(d => `@${d}`).join(', ')}`)
    }
    ui.detail('Interceptors only run on wired classes: wire(Class) or wireAll() at startup.')
  }
}

function renderTests(spin: ui.Spinner, tests: TestReport, raw: string): void {
  const counts = tests.counts
  const countText = counts
    ? [`${counts.passed} passed`, counts.failed ? `${counts.failed} failed` : '', counts.skipped ? `${counts.skipped} skipped` : '']
      .filter(Boolean).join(', ')
    : undefined

  if (!tests.ran && tests.passed) {
    spin.warn('No tests ran', tests.note)
    return
  }
  if (tests.passed) {
    spin.succeed('Tests passed', countText)
    return
  }

  spin.fail('Tests failed', countText ?? `exit code ${tests.exitCode}`)
  // Skip the child's own `axil test` rail when the runner got as far as running
  const lines = (ui.supportsColor ? raw : ui.stripAnsi(raw)).replace(/\s+$/, '').split(/\r?\n/)
  const start = lines.findIndex(l => ui.stripAnsi(l).includes('[AxilJS Test]'))
  for (const line of lines.slice(Math.max(0, start))) ui.line(ui.stripAnsi(line).trim() === '' ? '' : `  ${line}`)

  if (tests.violations.length > 0) {
    ui.section('Intent violations')
    for (const v of tests.violations) {
      ui.line(`${ui.c.red(ui.sym.cross)} ${ui.c.bold(v.target)} violates ${ui.cmd(`@${v.decorator}`)}`)
      ui.detail(v.detail)
      if (v.test) ui.detail(`in test: ${v.test}`)
    }
  }
}
