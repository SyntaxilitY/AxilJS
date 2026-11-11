import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createProject, resourceNames } from '../src/commands/create'
import { generate, detectProjectOptions, nextMigrationNumber } from '../src/commands/generate'

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
const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

describe('axil create (non-interactive)', () => {
  it('--yes uses defaults and --skip-install skips npm', async () => {
    await createProject('app', { yes: true, skipInstall: true, cwd: dir })

    const pkg = JSON.parse(read('app', 'package.json'))
    expect(pkg.dependencies['@axiljs/core']).toBeDefined()
    expect(pkg.dependencies['@axiljs/auth']).toBeDefined()          // auth defaults to on
    expect(pkg.dependencies['@axiljs/orm']).toBeUndefined()         // db defaults to none
    expect(pkg.devDependencies['@axiljs/testing']).toBeDefined()    // npm test → axil test
    expect(pkg.scripts.test).toBe('axil test')
    expect(pkg.scripts.migrate).toBeUndefined()
    expect(existsSync(join(dir, 'app', 'node_modules'))).toBe(false)
    expect(existsSync(join(dir, 'app', 'src', 'modules', 'users', 'services', 'users.service.ts'))).toBe(true)
    expect(plain(logs.join('\n'))).toContain('Skipped (--skip-install)')
  })

  it('does not prompt (or hang) when stdin is not a TTY', async () => {
    const original = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    try {
      await createProject('quiet', { skipInstall: true, cwd: dir })
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: original, configurable: true })
    }
    expect(existsSync(join(dir, 'quiet', 'package.json'))).toBe(true)
    expect(plain(logs.join('\n'))).not.toContain('CONFIGURE')
  })

  it('honours --db/--auth/--ws/--queue/--ai', async () => {
    await createProject('full', {
      db: 'postgres', auth: false, ws: true, queue: true, ai: true, skipInstall: true, cwd: dir
    })
    const pkg = JSON.parse(read('full', 'package.json'))
    expect(pkg.dependencies.pg).toBeDefined()
    expect(pkg.dependencies['@axiljs/orm']).toBeDefined()
    expect(pkg.dependencies['@axiljs/auth']).toBeUndefined()
    expect(pkg.dependencies['@axiljs/websocket']).toBeDefined()
    expect(pkg.dependencies['@axiljs/queue']).toBeDefined()
    expect(pkg.dependencies['@axiljs/ai']).toBeDefined()
    expect(pkg.scripts.migrate).toBe('axil migrate')

    const main = read('full', 'src', 'main.ts')
    expect(main).toContain('WSServer')
    expect(main).toContain('Queue')
    expect(main).not.toContain('@axiljs/auth')
  })

  it('postgres templates number their placeholders', async () => {
    await createProject('pg', { db: 'postgres', skipInstall: true, cwd: dir })
    const svc = read('pg', 'src', 'modules', 'users', 'services', 'users.service.ts')
    expect(svc).toContain('VALUES ($1, $2) RETURNING *')
    expect(svc).toContain('SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3')
    expect(svc).not.toContain('${p}')
  })

  it('mysql users service does not use RETURNING', async () => {
    await createProject('my', { db: 'mysql', skipInstall: true, cwd: dir })
    const svc = read('my', 'src', 'modules', 'users', 'services', 'users.service.ts')
    expect(svc).not.toMatch(/RETURNING/i)
    expect(svc).toContain('r.insertId')
    expect(svc).toContain('affectedRows')
    const migration = read('my', 'src', 'migrations', '001_create_users.ts')
    expect(migration).toContain('INT AUTO_INCREMENT PRIMARY KEY')
    expect(migration).toContain('import type { Migration }')
  })

  it('database projects document axil migrate', async () => {
    await createProject('lite', { db: 'sqlite', skipInstall: true, cwd: dir })
    const readme = read('lite', 'README.md')
    expect(readme).toContain('npm run migrate')
    expect(readme).toContain('axil migrate status')
    expect(readme).toContain('## Generators')
    expect(plain(logs.join('\n'))).toContain('npm run migrate')
  })

  it('refuses a non-empty directory unless --force', async () => {
    mkdirSync(join(dir, 'taken'))
    writeFileSync(join(dir, 'taken', 'keep.txt'), 'x')
    await expect(createProject('taken', { yes: true, skipInstall: true, cwd: dir }))
      .rejects.toThrow(/not empty.*--force/)

    await createProject('taken', { yes: true, skipInstall: true, force: true, cwd: dir })
    expect(existsSync(join(dir, 'taken', 'package.json'))).toBe(true)
    expect(read('taken', 'keep.txt')).toBe('x')
  })

  it('accepts an existing empty directory', async () => {
    mkdirSync(join(dir, 'empty'))
    await createProject('empty', { yes: true, skipInstall: true, cwd: dir })
    expect(existsSync(join(dir, 'empty', 'package.json'))).toBe(true)
  })

  it('validates the name and database', async () => {
    await expect(createProject('../evil', { yes: true, cwd: dir })).rejects.toThrow(/single directory/)
    await expect(createProject('ok', { db: 'oracle' as any, cwd: dir })).rejects.toThrow(/Invalid database/)
  })
})

describe('resourceNames', () => {
  it('derives file, class, route and table names', () => {
    expect(resourceNames('users')).toMatchObject({
      file: 'users', className: 'Users', entity: 'User', route: 'users', table: 'users'
    })
    expect(resourceNames('OrderItem')).toMatchObject({
      file: 'order-item', className: 'OrderItem', entity: 'OrderItem', route: 'order-items', table: 'order_items'
    })
    expect(resourceNames('categories')).toMatchObject({ entity: 'Category', route: 'categories' })
    expect(resourceNames('box')).toMatchObject({ entity: 'Box', route: 'boxes' })
    expect(() => resourceNames('!!!')).toThrow(/Invalid name/)
    expect(() => resourceNames('1abc')).toThrow(/digit/)
  })
})

describe('axil generate', () => {
  async function project(db: 'none' | 'sqlite' | 'postgres' | 'mysql' = 'none'): Promise<string> {
    await createProject('proj', { yes: true, db, skipInstall: true, cwd: dir })
    logs = []
    return join(dir, 'proj')
  }

  it('module → controller + service in the create layout (+ migration with a db)', async () => {
    const cwd = await project('sqlite')
    const r = await generate('module', 'products', { cwd })

    expect(r.created).toEqual([
      'src/modules/products/controllers/products.controller.ts',
      'src/modules/products/services/products.service.ts',
      'src/migrations/002_create_products.ts'
    ])
    const ctrl = readFileSync(join(cwd, r.created[0]), 'utf8')
    expect(ctrl).toContain('export class ProductsController')
    expect(ctrl).toContain("from '../services/products.service.js'")
    expect(ctrl).toContain("app.get('/products', authenticate(this.jwt)")   // auth detected
    const svc = readFileSync(join(cwd, r.created[1]), 'utf8')
    expect(svc).toContain('export interface Product {')
    expect(svc).toContain("from '../../../db/connection.js'")
    expect(svc).toContain('INSERT INTO products (name) VALUES (?) RETURNING *')
    const mig = readFileSync(join(cwd, r.created[2]), 'utf8')
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS products')
    expect(mig).toContain('INTEGER PRIMARY KEY AUTOINCREMENT')

    const out = plain(logs.join('\n'))
    expect(out).toContain('create  src/modules/products/controllers/products.controller.ts')
    expect(out).toContain('new ProductsController().register(app)')
  })

  it('never overwrites existing files unless --force', async () => {
    const cwd = await project()
    const target = join(cwd, 'src/modules/users/services/users.service.ts')
    writeFileSync(target, '// custom')

    const r = await generate('service', 'users', { cwd })
    expect(r.created).toEqual([])
    expect(r.skipped).toEqual(['src/modules/users/services/users.service.ts'])
    expect(readFileSync(target, 'utf8')).toBe('// custom')
    expect(plain(logs.join('\n'))).toMatch(/skip\s+src\/modules\/users\/services\/users\.service\.ts/)

    const forced = await generate('service', 'users', { cwd, force: true })
    expect(forced.created).toHaveLength(1)
    expect(readFileSync(target, 'utf8')).toContain('export class UsersService')
  })

  it('in-memory service when the project has no database', async () => {
    const cwd = await project('none')
    await generate('module', 'tags', { cwd, silent: true })
    const svc = readFileSync(join(cwd, 'src/modules/tags/services/tags.service.ts'), 'utf8')
    expect(svc).toContain('In-memory implementation')
    expect(existsSync(join(cwd, 'src/migrations'))).toBe(false)
  })

  it('mysql services avoid RETURNING', async () => {
    const cwd = await project('mysql')
    await generate('service', 'orders', { cwd, silent: true })
    const svc = readFileSync(join(cwd, 'src/modules/orders/services/orders.service.ts'), 'utf8')
    expect(svc).not.toMatch(/RETURNING/i)
    expect(svc).toContain('this.findById(String(r.insertId))')
  })

  it('controller / entity / migration generators', async () => {
    const cwd = await project('postgres')
    await generate('controller', 'orders', { cwd, auth: false, silent: true })
    const ctrl = readFileSync(join(cwd, 'src/modules/orders/controllers/orders.controller.ts'), 'utf8')
    expect(ctrl).toContain("app.get('/orders', this.list.bind(this) as any)")

    await generate('entity', 'product', { cwd, silent: true })
    const entity = readFileSync(join(cwd, 'src/modules/product/entities/product.entity.ts'), 'utf8')
    expect(entity).toContain("@Entity('products')")
    expect(entity).toContain('export class Product extends BaseModel')

    const m1 = await generate('migration', 'add price to products', { cwd, silent: true })
    expect(m1.created).toEqual(['src/migrations/002_add_price_to_products.ts'])
    const m2 = await generate('migration', 'AddIndexes', { cwd, silent: true })
    expect(m2.created).toEqual(['src/migrations/003_add_indexes.ts'])
    // same base name again → same file, skipped
    const m3 = await generate('migration', 'add_price_to_products', { cwd, silent: true })
    expect(m3.skipped).toEqual(['src/migrations/002_add_price_to_products.ts'])
    expect(readFileSync(join(cwd, m1.created[0]), 'utf8')).toContain('import type { Migration }')
  })

  it('rejects unknown generators and missing names', async () => {
    await expect(generate('widget', 'x', { cwd: dir })).rejects.toThrow(/Unknown generator "widget"/)
    await expect(generate('module', '', { cwd: dir })).rejects.toThrow(/provide a name/)
  })

  it('detectProjectOptions reads package.json', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: { '@axiljs/orm': '1', mysql2: '1', '@axiljs/auth': '1' }
    }))
    expect(detectProjectOptions(dir)).toMatchObject({ database: 'mysql', includeAuth: true })
    expect(detectProjectOptions(join(dir, 'missing')).database).toBe('none')
  })

  it('nextMigrationNumber', () => {
    expect(nextMigrationNumber(join(dir, 'nope'))).toBe('001')
    mkdirSync(join(dir, 'm'))
    writeFileSync(join(dir, 'm', '009_x.ts'), '')
    writeFileSync(join(dir, 'm', 'README.md'), '')
    expect(nextMigrationNumber(join(dir, 'm'))).toBe('010')
    expect(readdirSync(join(dir, 'm'))).toHaveLength(2)
  })
})

describe('axil create (interactive)', () => {
  const saved: Array<[object, string, PropertyDescriptor | undefined]> = []
  let screen: string[]

  beforeEach(() => {
    for (const [obj, key] of [[process.stdin, 'isTTY'], [process.stdout, 'isTTY'], [process.stdin, 'isRaw']] as const) {
      saved.push([obj, key, Object.getOwnPropertyDescriptor(obj, key)])
      Object.defineProperty(obj, key, { value: key !== 'isRaw', configurable: true })
    }
    ;(process.stdin as any).setRawMode = vi.fn()
    vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin)
    vi.spyOn(process.stdin, 'pause').mockImplementation(() => process.stdin)
    screen = []
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: any) => { screen.push(String(chunk)); return true }) as any)
  })

  afterEach(() => {
    for (const [obj, key, desc] of saved.splice(0)) {
      if (desc) Object.defineProperty(obj, key, desc)
      else delete (obj as any)[key]
    }
    delete (process.stdin as any).setRawMode
  })

  /** Wait for the next prompt to attach, then press keys. */
  async function keys(...seq: Array<[string | undefined, { name?: string; ctrl?: boolean }]>): Promise<void> {
    for (let i = 0; i < 50 && process.stdin.listenerCount('keypress') === 0; i++) await new Promise(r => setTimeout(r, 5))
    for (const [str, key] of seq) process.stdin.emit('keypress', str, key)
    await new Promise(r => setImmediate(r))
  }

  it('asks for a name, browses templates, picks with space and confirms', async () => {
    const done = createProject(undefined, { cwd: dir, skipInstall: true })

    // 1/4: name (an invalid one first)
    await keys(['-', {}], ['\r', { name: 'return' }], [undefined, { name: 'backspace' }])
    await keys(...[...'shop'].map(ch => [ch, {}] as [string, {}]), ['\r', { name: 'return' }])
    // 2/4: template picker opens on the first template; space picks it
    await keys([' ', { name: 'space' }])
    // 4/4: confirm
    await keys(['y', {}])
    await done

    const out = plain(screen.join(''))
    expect(out).toContain('Project name  1/4')
    expect(out).toContain('Cannot start with "." or "-".')
    expect(out).toContain('Pick a template  2/4')
    expect(out).toContain('Create project?  4/4')
    expect(existsSync(join(dir, 'shop', 'src', 'main.ts'))).toBe(true)
    expect(JSON.parse(read('shop', 'package.json')).description).toContain('template: minimal')
    expect(process.stdin.listenerCount('keypress')).toBe(0)
  })

  it('picks the Custom stack from its tab and asks for database and features', async () => {
    const done = createProject('api', { cwd: dir, skipInstall: true })
    await keys([undefined, { name: 'left' }], ['\r', { name: 'return' }])   // ← wraps to the Custom tab
    await keys([undefined, { name: 'down' }], [' ', { name: 'space' }])       // database: SQLite
    await keys(['\r', { name: 'return' }])                                    // features: defaults
    await keys(['y', {}])
    await done

    expect(plain(screen.join(''))).toContain('Database  3/4')
    expect(existsSync(join(dir, 'api', 'src', 'db', 'connection.ts'))).toBe(true)
  })
})
