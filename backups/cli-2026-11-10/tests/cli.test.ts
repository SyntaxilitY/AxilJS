import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

// Run the real entry point (src/cli.ts) through tsx, as a user would run `axil`
const CLI = resolve(__dirname, '..', 'src', 'cli.ts')
const TSX = resolve(__dirname, '..', '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs')

let cwd: string

beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), 'axil-cli-bin-'))
})

afterAll(() => {
  rmSync(cwd, { recursive: true, force: true })
})

function axil(...args: string[]): { code: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, [TSX, CLI, ...args], {
    cwd,
    encoding: 'utf8',
    input: '',
    timeout: 60000,
    env: { ...process.env, NO_COLOR: '1' }
  })
  const strip = (s: string): string => (s || '').replace(/\x1b\[[0-9;]*m/g, '')
  return { code: r.status, out: strip(r.stdout), err: strip(r.stderr) }
}

describe('axil binary', () => {
  it('--help lists the new commands', () => {
    const r = axil('--help')
    expect(r.code).toBe(0)
    expect(r.out).toContain('generate <kind> <name>')
    expect(r.out).toContain('migrate [up|down|status]')
  })

  it('`axil run --help` prints usage instead of starting the server', () => {
    // a project dir that would otherwise make `run` try to compile
    writeFileSync(join(cwd, 'package.json'), '{"name":"x"}')
    writeFileSync(join(cwd, 'tsconfig.json'), '{}')
    mkdirSync(join(cwd, 'src'), { recursive: true })

    const r = axil('run', '--help')
    expect(r.code).toBe(0)
    expect(r.out).toContain('axil run')
    expect(r.out).toContain('Usage:')
    expect(r.out).not.toContain('Initial compilation')
    expect(existsSync(join(cwd, 'dist'))).toBe(false)
  })

  it('-h after other subcommands prints their help', () => {
    expect(axil('deploy', '-h').out).toContain('--replicas')
    expect(axil('g', '--help').out).toContain('axil generate')
    expect(axil('migrate', '--help').out).toContain('DATABASE_URL')
    expect(axil('help', 'create').out).toContain('--skip-install')
    expect(existsSync(join(cwd, 'deploy'))).toBe(false)
  })

  it('unknown flags and commands fail with a hint', () => {
    const flag = axil('create', 'app', '--sqlite')
    expect(flag.code).toBe(1)
    expect(flag.err).toContain("Unknown flag '--sqlite'")
    expect(flag.err).toContain("axil create --help")
    expect(existsSync(join(cwd, 'app'))).toBe(false)

    const cmd = axil('migrat')
    expect(cmd.code).toBe(1)
    expect(cmd.err).toContain("did you mean 'migrate'")
  })

  it('create --yes --skip-install works end to end without a TTY', () => {
    const r = axil('create', 'svc', '--yes', '--db=sqlite', '--skip-install')
    expect(r.code).toBe(0)
    expect(existsSync(join(cwd, 'svc', 'src', 'migrations', '001_create_users.ts'))).toBe(true)
    expect(existsSync(join(cwd, 'svc', 'node_modules'))).toBe(false)
  })

  it('generate requires a kind and a name', () => {
    const r = axil('generate', 'module')
    expect(r.code).toBe(1)
    expect(r.err).toContain('axil generate <module|controller|service|entity|migration> <name>')
  })
})
