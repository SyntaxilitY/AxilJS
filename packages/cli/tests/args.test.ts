import { describe, it, expect } from 'vitest'
import {
  parseArgs,
  ArgError,
  COMMANDS,
  findCommand,
  formatCommandHelp,
  closest,
  FlagSpec
} from '../src/args'

const createFlags = findCommand('create')!.flags

describe('parseArgs', () => {
  it('parses positionals, booleans, --flag=value and --flag value', () => {
    const r = parseArgs(['my-api', '--yes', '--db=sqlite', '--ws'], createFlags, 'create')
    expect(r.positionals).toEqual(['my-api'])
    expect(r.flags).toEqual({ yes: true, db: 'sqlite', ws: true })
    expect(r.help).toBe(false)

    const r2 = parseArgs(['--db', 'postgres', 'app'], createFlags)
    expect(r2.flags.db).toBe('postgres')
    expect(r2.positionals).toEqual(['app'])
  })

  it('supports short aliases and --no-<flag>', () => {
    const r = parseArgs(['app', '-y', '--no-auth', '--skip-install'], createFlags)
    expect(r.flags).toEqual({ yes: true, auth: false, 'skip-install': true })
  })

  it('accepts explicit boolean values', () => {
    expect(parseArgs(['--auth=false'], createFlags).flags.auth).toBe(false)
    expect(parseArgs(['--auth=true'], createFlags).flags.auth).toBe(true)
    expect(() => parseArgs(['--auth=maybe'], createFlags)).toThrow(ArgError)
  })

  it('detects --help and -h anywhere', () => {
    expect(parseArgs(['--help'], []).help).toBe(true)
    expect(parseArgs(['x', '-h'], []).help).toBe(true)
  })

  it('treats everything after -- as positional', () => {
    const r = parseArgs(['--', '--yes', '-h'], createFlags)
    expect(r.positionals).toEqual(['--yes', '-h'])
    expect(r.help).toBe(false)
  })

  it('rejects unknown flags with a suggestion', () => {
    expect(() => parseArgs(['--forse'], createFlags, 'create'))
      .toThrow("Unknown flag '--forse'. Did you mean --force? Run 'axil create --help' to see available options.")
    expect(() => parseArgs(['-z'], createFlags, 'create')).toThrow(/Unknown flag '-z'/)
    expect(() => parseArgs(['--port'], [], 'run')).toThrow(/Run 'axil run --help'/)
  })

  it('validates enumerated values and missing values', () => {
    expect(() => parseArgs(['--db=oracle'], createFlags)).toThrow(/Invalid value "oracle" for --db/)
    expect(() => parseArgs(['--db'], createFlags)).toThrow(/requires a value/)
    expect(() => parseArgs(['--db', '--yes'], createFlags)).toThrow(/requires a value/)
  })

  it('keeps negative numbers as positionals', () => {
    const flags: FlagSpec[] = []
    expect(parseArgs(['-1'], flags).positionals).toEqual(['-1'])
  })

  it('closest() finds near misses only', () => {
    expect(closest('crate', ['create', 'run'])).toBe('create')
    expect(closest('xyzxyz', ['create', 'run'])).toBeNull()
  })
})

describe('command specs and help', () => {
  it('knows every command and alias', () => {
    for (const name of ['create', 'generate', 'g', 'migrate', 'run', 'build', 'install', 'i', 'test', 'deploy', 'doctor', 'decorator', 'dec']) {
      expect(findCommand(name), name).toBeDefined()
    }
    expect(findCommand('g')!.name).toBe('generate')
    expect(findCommand('nope')).toBeUndefined()
  })

  it('formats per-command help with usage, options and examples', () => {
    for (const spec of COMMANDS) {
      const help = formatCommandHelp(spec).replace(/\x1b\[[0-9;]*m/g, '')
      expect(help).toContain(`axil ${spec.name}`)
      expect(help).toContain('Usage:')
      for (const usage of spec.usage.split('\n')) expect(help).toContain(usage)
      expect(help).toContain('-h, --help')
      for (const f of spec.flags) expect(help).toContain(`--${f.name}`)
    }

    const create = formatCommandHelp(findCommand('create')!).replace(/\x1b\[[0-9;]*m/g, '')
    expect(create).toContain('-y, --yes')
    expect(create).toContain('--db=<driver>')
    expect(create).toContain('[none|sqlite|postgres|mysql]')
  })
})
