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
