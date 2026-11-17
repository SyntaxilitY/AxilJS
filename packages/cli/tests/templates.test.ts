import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createProject } from '../src/commands/create'
import { TEMPLATES, TEMPLATE_IDS, findTemplate } from '../src/templates'
import { findCommand, formatCommandHelp } from '../src/args'

const ctx = { name: 'demo', axilRange: '^0.3.0', cliVersion: '0.3.2' }

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'axil-tpl-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('template registry', () => {
  it('has unique kebab-case ids and complete metadata', () => {
    expect(new Set(TEMPLATE_IDS).size).toBe(TEMPLATE_IDS.length)
    const ports = TEMPLATES.map(t => t.port)
    expect(new Set(ports).size).toBe(ports.length)
    for (const t of TEMPLATES) {
      expect(t.id, t.id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
      expect(t.title.length, t.id).toBeGreaterThan(0)
      expect(t.summary.length, t.id).toBeGreaterThan(0)
      expect(t.summary.length, t.id).toBeLessThanOrEqual(60)
      expect(t.packages.length, t.id).toBeGreaterThan(0)
      expect(findTemplate(t.id)).toBe(t)
    }
  })

  for (const t of TEMPLATES) {
    describe(t.id, () => {
      const files = t.files(ctx)

      it('ships main, README, .env.example and at least one test', () => {
        expect(Object.keys(files)).toEqual(expect.arrayContaining(['src/main.ts', 'README.md', '.env.example']))
        expect(Object.keys(files).some(f => /^src\/.+\.test\.ts$/.test(f))).toBe(true)
      })

      it('uses POSIX relative paths inside the project only', () => {
        for (const f of Object.keys(files)) {
          expect(f).not.toMatch(/\\|^\/|^\.\.|\/\.\.\//)
          expect(['package.json', 'tsconfig.json', '.gitignore']).not.toContain(f)
        }
      })

      it('imports relative modules with .js extensions (ESM)', () => {
        for (const [f, content] of Object.entries(files)) {
          if (!f.endsWith('.ts')) continue
          const bad = [...content.matchAll(/from '(\.{1,2}\/[^']+)'/g)].map(m => m[1]).filter(p => !p.endsWith('.js'))
          expect(bad, f).toEqual([])
        }
      })

      it('depends on every @axiljs package it imports, at the shared range', () => {
        const deps = t.dependencies(ctx)
        const dev = t.devDependencies?.(ctx) ?? {}
        const imported = new Set<string>()
        for (const content of Object.values(files)) {
          for (const m of content.matchAll(/from '(@axiljs\/[a-z-]+)'/g)) imported.add(m[1])
        }
        imported.delete('@axiljs/testing') // shared devDependency
        for (const pkg of imported) expect(deps[pkg] ?? dev[pkg], `${t.id} imports ${pkg}`).toBe('^0.3.0')
        expect(files['.env.example']).not.toMatch(/sk-[A-Za-z0-9]{20,}|postgres(ql)?:\/\/[^:]+:[^@]{8,}@(?!localhost)/)
      })
    })
  }
})

describe('shared state in multi-instance templates', () => {
  for (const id of ['saas-api', 'high-scale-api']) {
    describe(id, () => {
      const t = findTemplate(id)!
      const files = t.files(ctx)
      const main = files['src/main.ts']

      it('depends on @axiljs/stores, runtime, orm and a SQLite driver', () => {
        const deps = t.dependencies(ctx)
        for (const pkg of ['@axiljs/stores', '@axiljs/runtime', '@axiljs/orm']) expect(deps[pkg], pkg).toBe('^0.3.0')
        expect(deps['better-sqlite3']).toBeDefined()
        expect(t.packages).toContain('@axiljs/stores')
      })

      it('creates the stores from the connection and installs them in the runtime', () => {
        const state = files['src/shared-state.ts']
        expect(state).toContain("import { createSqlStores, fromConnection } from '@axiljs/stores'")
        expect(state).toContain("import { useStores } from '@axiljs/runtime'")
        const create = state.indexOf('createConnection(connectionConfig(url))')
        const stores = state.indexOf('const stores = createSqlStores(fromConnection(db))')
        const schema = state.indexOf('await stores.ensureSchema()')
        const use    = state.indexOf('useStores(stores)')
        expect(create).toBeGreaterThan(-1)
        expect(stores).toBeGreaterThan(create)
        expect(schema).toBeGreaterThan(stores)
        expect(use).toBeGreaterThan(schema)
        expect(state).toMatch(/stores\.close\(\)[\s\S]*await db\.disconnect\(\)/)
        expect(files['src/shared-state.test.ts']).toContain("openSharedState('sqlite::memory:', { install: false })")
      })

      it('opens the shared state at startup, wires decorators after the imports and closes on shutdown', () => {
        expect(main).toContain("import { openSharedState } from './shared-state.js'")
        expect(main).toContain('await openSharedState(config.DATABASE_URL)')
        const lastImport = main.lastIndexOf('\nimport ')
        const wire = main.indexOf('wireAll()')
        expect(wire).toBeGreaterThan(lastImport)
        expect(wire).toBeGreaterThan(main.indexOf('openSharedState(config.DATABASE_URL)'))
        expect(main).toContain('await state.close()')
      })

      it('configures DATABASE_URL with a SQLite default and documents several instances', () => {
        expect(files['.env.example']).toMatch(/^DATABASE_URL=sqlite:\.\/shared-state\.db$/m)
        expect(files['src/config.ts']).toContain("DATABASE_URL:")
        expect(files['README.md']).toContain('## Running several instances')
        expect(files['README.md']).toMatch(/PostgreSQL/)
        expect(t.nextSteps(ctx).map(([c]) => c).join('\n')).toContain('DATABASE_URL')
      })

      it('loads the Studio intent endpoint only outside production, with a dynamic require', () => {
        const dev = files['src/dev/studio-intent.ts']
        expect(dev).toContain("if (process.env.NODE_ENV !== 'production')")
        expect(dev).toContain("require('@axiljs/studio/dist/intent')")
        expect(dev).toMatch(/createRequire\(import\.meta\.url\)/)
        expect(files['src/app.ts']).toContain("import { studioIntentEndpoint } from './dev/studio-intent.js'")
        expect(files['src/app.ts']).toMatch(/const intent = studioIntentEndpoint\(\)\s+if \(intent\) app\.use\(intent\)/)
      })
    })
  }

  it('high-scale-api relays cluster events from the primary', () => {
    const main = findTemplate('high-scale-api')!.files(ctx)['src/main.ts']
    expect(main).toContain("import { installClusterEventRelay } from '@axiljs/events'")
    expect(main).toContain('onPrimary: () => installClusterEventRelay()')
    // The factory opens the state per worker and closes it when serve() drains the worker
    expect(main).toMatch(/await serve\(async \(\) => \{\s+[\s\S]*openSharedState[\s\S]*async close\(\) \{\s+await app\.close\(\)\s+await state\.close\(\)/)
  })

  it('no template imports @axiljs/studio statically (it is a devDependency)', () => {
    for (const t of TEMPLATES) {
      for (const [f, content] of Object.entries(t.files(ctx))) {
        if (f.endsWith('.ts')) expect(content, `${t.id}/${f}`).not.toMatch(/from '@axiljs\/studio/)
      }
    }
  })
})

describe('axil create --template', () => {
  it('writes the template files plus the shared scaffolding', async () => {
    const t = TEMPLATES[0]
    await createProject('app', { template: t.id, yes: true, skipInstall: true, cwd: dir })

    const pkg = JSON.parse(readFileSync(join(dir, 'app', 'package.json'), 'utf8'))
    expect(pkg.name).toBe('app')
    expect(pkg.type).toBe('module')
    expect(pkg.scripts).toMatchObject({ dev: 'axil run', test: 'axil test', build: 'tsc' })
    expect(pkg.devDependencies['@axiljs/testing']).toBeDefined()
    for (const f of ['tsconfig.json', '.gitignore', ...Object.keys(t.files({ ...ctx, name: 'app' }))]) {
      expect(existsSync(join(dir, 'app', f)), f).toBe(true)
    }
  })

  it('refuses to combine a template with feature flags', async () => {
    await expect(
      createProject('app', { template: TEMPLATES[0].id, db: 'sqlite', yes: true, skipInstall: true, cwd: dir })
    ).rejects.toThrow(/defines its own stack/)
  })

  it('suggests the closest template for a typo', async () => {
    await expect(
      createProject('app', { template: 'rest-apl', yes: true, skipInstall: true, cwd: dir })
    ).rejects.toThrow(/Unknown template "rest-apl"\. Did you mean "rest-api"\?/)
  })

  it('lists every template in `axil create --help`', () => {
    const help = formatCommandHelp(findCommand('create')!)
    expect(help).toContain('--template=<name>')
    for (const id of TEMPLATE_IDS) expect(help).toContain(id)
  })
})
