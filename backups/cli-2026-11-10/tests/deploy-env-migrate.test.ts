import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { deploy, DOCKERIGNORE } from '../src/commands/deploy'
import { parseEnv, readEnvFile, loadEnvIntoProcess } from '../src/utils/env'
import { readEnvValue, readAppPort } from '../src/commands/run'
import { migrate, resolveDbConfig, resolveMigrationsDir } from '../src/commands/migrate'

let dir: string
let logs: string[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'axil-cli-'))
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const read = (...p: string[]): string => readFileSync(join(dir, ...p), 'utf8')

describe('axil deploy', () => {
  beforeEach(() => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@Org/My_API', version: '2.1.0' }))
  })

  it('keeps the previous defaults (port 3000, 3 replicas)', async () => {
    await deploy({ cwd: dir })
    const dockerfile = read('deploy', 'Dockerfile')
    const k8s = read('deploy', 'deployment.yaml')
    expect(dockerfile).toContain('EXPOSE 3000')
    expect(dockerfile).toContain('ENV PORT=3000')
    expect(k8s).toContain('replicas: 3')
    expect(k8s).toContain('name: org-my-api')
    expect(k8s).toContain('image: org-my-api:2.1.0')
    expect(read('deploy', 'deploy.sh')).toContain('docker build -f deploy/Dockerfile')
  })

  it('--port and --replicas are applied everywhere', async () => {
    await deploy({ cwd: dir, port: '8080', replicas: 2 })
    const k8s = read('deploy', 'deployment.yaml')
    expect(read('deploy', 'Dockerfile')).toContain('EXPOSE 8080')
    expect(k8s).toContain('replicas: 2')
    expect(k8s).toContain('containerPort: 8080')
    expect(k8s).toContain('targetPort: 8080')
    expect(k8s).toContain('value: "8080"')
    expect(logs.join('\n')).toContain('docker run -p 8080:8080')
  })

  it('rejects invalid --port / --replicas', async () => {
    await expect(deploy({ cwd: dir, port: 'abc' })).rejects.toThrow(/Invalid --port/)
    await expect(deploy({ cwd: dir, port: 70000 })).rejects.toThrow(/Invalid --port/)
    await expect(deploy({ cwd: dir, replicas: '0' })).rejects.toThrow(/Invalid --replicas/)
  })

  it('creates .dockerignore only when missing (or with --force)', async () => {
    await deploy({ cwd: dir })
    expect(read('.dockerignore')).toBe(DOCKERIGNORE)
    expect(read('.dockerignore')).toContain('node_modules')
    expect(read('.dockerignore')).toContain('.env')

    writeFileSync(join(dir, '.dockerignore'), 'custom\n')
    await deploy({ cwd: dir })
    expect(read('.dockerignore')).toBe('custom\n')

    await deploy({ cwd: dir, force: true })
    expect(read('.dockerignore')).toBe(DOCKERIGNORE)
  })

  it('warns before overwriting deploy/ files unless --force', async () => {
    await deploy({ cwd: dir })
    logs = []
    await deploy({ cwd: dir })
    expect(logs.filter(l => l.includes('Overwriting existing deploy/'))).toHaveLength(3)

    logs = []
    await deploy({ cwd: dir, force: true })
    expect(logs.some(l => l.includes('Overwriting'))).toBe(false)
  })
})

describe('.env parsing', () => {
  it('unquotes values and strips comments', () => {
    const env = parseEnv([
      '# comment',
      'PORT="4000"',
      "NAME='single # not a comment'",
      'PLAIN=value # trailing comment',
      'export TOKEN=abc',
      'ESCAPED="line1\\nline2 \\"q\\""',
      'EMPTY=',
      'SPACED = spaced value ',
      'URL=postgres://u:p@h:5432/db?x=1#frag',
      'not a var',
      ''
    ].join('\r\n'))

    expect(env).toEqual({
      PORT: '4000',
      NAME: 'single # not a comment',
      PLAIN: 'value',
      TOKEN: 'abc',
      ESCAPED: 'line1\nline2 "q"',
      EMPTY: '',
      SPACED: 'spaced value',
      URL: 'postgres://u:p@h:5432/db?x=1#frag'
    })
  })

  it('axil run reads quoted PORT values', () => {
    writeFileSync(join(dir, '.env'), 'PORT="4000"\nDATABASE_FILENAME=\'./my.db\'\n')
    expect(readAppPort(dir)).toBe(4000)
    expect(readEnvValue(dir, 'DATABASE_FILENAME')).toBe('./my.db')
    expect(readEnvValue(dir, 'MISSING')).toBeUndefined()
  })

  it('defaults to 3000 without .env or with a bad PORT', () => {
    expect(readAppPort(dir)).toBe(3000)
    writeFileSync(join(dir, '.env'), 'PORT=abc\n')
    expect(readAppPort(dir)).toBe(3000)
    expect(readEnvFile(join(dir, 'nope'))).toEqual({})
  })

  it('loadEnvIntoProcess never overrides existing variables', () => {
    const key = `AXIL_TEST_${Date.now()}`
    process.env[`${key}_KEEP`] = 'original'
    writeFileSync(join(dir, '.env'), `${key}_NEW="new"\n${key}_KEEP=changed\n`)
    try {
      loadEnvIntoProcess(dir)
      expect(process.env[`${key}_NEW`]).toBe('new')
      expect(process.env[`${key}_KEEP`]).toBe('original')
    } finally {
      delete process.env[`${key}_NEW`]
      delete process.env[`${key}_KEEP`]
    }
  })
})

describe('axil migrate', () => {
  it('resolveDbConfig infers the driver', () => {
    expect(resolveDbConfig({ DATABASE_URL: 'postgres://u:p@h/db' }, dir))
      .toEqual({ driver: 'postgres', url: 'postgres://u:p@h/db' })
    expect(resolveDbConfig({ DATABASE_URL: 'postgresql://h/db' }, dir).driver).toBe('postgres')
    expect(resolveDbConfig({ DATABASE_URL: 'mysql://h/db' }, dir).driver).toBe('mysql')
    expect(resolveDbConfig({ DATABASE_FILENAME: './dev.db' }, dir))
      .toEqual({ driver: 'sqlite', filename: resolve(dir, 'dev.db') })
    expect(resolveDbConfig({ DB_FILE: 'x.db' }, dir).filename).toBe(resolve(dir, 'x.db'))
    expect(resolveDbConfig({ DB_DRIVER: 'sqlite' }, dir).filename).toBe(resolve(dir, 'dev.db'))
    expect(resolveDbConfig({ DB_DRIVER: 'sqlite', DATABASE_FILENAME: ':memory:' }, dir).filename).toBe(':memory:')
    expect(resolveDbConfig({ DB_DRIVER: 'PG', DATABASE_URL: 'x://y' }, dir).driver).toBe('postgres')
  })

  it('resolveDbConfig explains what is missing', () => {
    expect(() => resolveDbConfig({}, dir)).toThrow(/No database configured/)
    expect(() => resolveDbConfig({ DB_DRIVER: 'oracle' }, dir)).toThrow(/Unsupported DB_DRIVER/)
    expect(() => resolveDbConfig({ DB_DRIVER: 'mysql' }, dir)).toThrow(/requires DATABASE_URL/)
  })

  it('resolveMigrationsDir prefers --dir, then src/migrations, then dist/migrations', () => {
    expect(resolveMigrationsDir(dir, 'db/migrations')).toBe(resolve(dir, 'db/migrations'))
    expect(resolveMigrationsDir(dir)).toBe(join(dir, 'src', 'migrations'))
    mkdirSync(join(dir, 'dist', 'migrations'), { recursive: true })
    expect(resolveMigrationsDir(dir)).toBe(join(dir, 'dist', 'migrations'))
    mkdirSync(join(dir, 'src', 'migrations'), { recursive: true })
    expect(resolveMigrationsDir(dir)).toBe(join(dir, 'src', 'migrations'))
  })

  /** A project-local fake @axiljs/orm that records what migrate() does. */
  function fakeOrm(): string {
    const ormDir = join(dir, 'node_modules', '@axiljs', 'orm')
    mkdirSync(ormDir, { recursive: true })
    writeFileSync(join(ormDir, 'package.json'), JSON.stringify({ name: '@axiljs/orm', main: 'index.js' }))
    writeFileSync(join(ormDir, 'index.js', ), `
      const calls = { push: (c) => globalThis.__axilFakeOrm.push(c) }
      exports.createConnection = async (config) => {
        calls.push(['connect', config])
        return {
          getDriver: () => ({ config }),
          disconnect: async () => { calls.push(['disconnect']) }
        }
      }
      exports.MigrationRunner = class {
        constructor (driver, dir) { calls.push(['runner', driver.config.driver, dir]) }
        async up () { calls.push(['up']) }
        async down () { calls.push(['down']) }
        async status () { calls.push(['status']) }
      }
    `)
    mkdirSync(join(dir, 'src', 'migrations'), { recursive: true })
    return ormDir
  }

  it('loads .env, resolves @axiljs/orm from the project and runs the action', async () => {
    fakeOrm()
    ;(globalThis as any).__axilFakeOrm = []
    writeFileSync(join(dir, '.env'), 'DB_DRIVER=sqlite\nDATABASE_FILENAME="./data/app.db"\n')

    const saved = { ...process.env }
    try {
      delete process.env.DATABASE_URL
      delete process.env.DB_DRIVER
      delete process.env.DATABASE_FILENAME
      delete process.env.DB_FILE
      await migrate('status', { cwd: dir })
    } finally {
      for (const k of ['DB_DRIVER', 'DATABASE_FILENAME']) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
      }
    }

    const calls = (globalThis as any).__axilFakeOrm
    expect(calls[0][0]).toBe('connect')
    expect(calls[0][1]).toMatchObject({ driver: 'sqlite', filename: resolve(dir, 'data', 'app.db') })
    expect(calls[1]).toEqual(['runner', 'sqlite', join(dir, 'src', 'migrations')])
    expect(calls[2]).toEqual(['status'])
    expect(calls[3]).toEqual(['disconnect'])
  })

  it('runs up by default and down on request (explicit env)', async () => {
    fakeOrm()
    ;(globalThis as any).__axilFakeOrm = []
    const env = { DATABASE_URL: 'postgres://u:p@localhost/db' }

    await migrate(undefined, { cwd: dir, env })
    expect((globalThis as any).__axilFakeOrm.map((c: unknown[]) => c[0])).toEqual(['connect', 'runner', 'up', 'disconnect'])

    ;(globalThis as any).__axilFakeOrm = []
    await migrate('down', { cwd: dir, env, dir: 'src/migrations' })
    expect((globalThis as any).__axilFakeOrm.map((c: unknown[]) => c[0])).toEqual(['connect', 'runner', 'down', 'disconnect'])
  })

  it('validates the action and the migrations directory', async () => {
    await expect(migrate('sideways', { cwd: dir, env: {} })).rejects.toThrow(/Unknown migrate action/)
    await expect(migrate('up', { cwd: dir, env: { DATABASE_FILENAME: 'x.db' }, dir: 'missing' }))
      .rejects.toThrow(/Migrations directory not found/)
    expect(existsSync(join(dir, 'x.db'))).toBe(false)
  })
})
