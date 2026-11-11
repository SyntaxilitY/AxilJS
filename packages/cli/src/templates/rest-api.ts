/**
 * Template: rest-api
 *
 * A production-shaped CRUD REST API: SQLite through @axiljs/orm repositories,
 * migrations applied at startup, validated body/params/query, filtered and
 * sorted pagination, JWT auth (scrypt passwords) on writes, owner/admin
 * checks, and one JSON error shape (401/403/404/405/409/422). Tests run every
 * file against its own in-memory database.
 */

import type { ProjectTemplate, TemplateContext } from './types'

export const restApiTemplate: ProjectTemplate = {
  id:       'rest-api',
  title:    'REST API',
  summary:  'CRUD on SQLite with JWT auth, validation and paging',
  category: 'APIs',
  highlights: [
    'ORM repositories on SQLite, migrations at startup',
    'Filter, sort and paginate with validated queries',
    'JWT register/login, owner-or-admin writes',
    'One JSON error shape: 401/403/404/409/422',
    'Tests on an isolated in-memory database'
  ],
  packages: ['@axiljs/core', '@axiljs/orm', '@axiljs/auth', '@axiljs/validation', '@axiljs/config', '@axiljs/testing'],
  port:     3001,

  dependencies: ctx => ({
    '@axiljs/auth':       ctx.axilRange,
    '@axiljs/config':     ctx.axilRange,
    '@axiljs/core':       ctx.axilRange,
    '@axiljs/orm':        ctx.axilRange,
    '@axiljs/validation': ctx.axilRange,
    'better-sqlite3':     '^13.0.0'
  }),

  scripts: {
    'migrate':        'axil migrate',
    'migrate:status': 'axil migrate status',
    'migrate:down':   'axil migrate down'
  },

  files: (ctx: TemplateContext) => ({
    'README.md': `# ${ctx.name}

A production-shaped CRUD REST API built on [AxilJS](https://github.com/SyntaxilitY/AxilJS), created with
\`axil create ${ctx.name} --template rest-api\`.

It manages **products** owned by **users**, and shows how the pieces fit together:

- **@axiljs/orm**: SQLite (better-sqlite3), \`@Entity\` models, \`BaseRepository\` subclasses, a filtered/sorted list on the query builder, migrations applied at startup
- **@axiljs/validation**: \`validate({ body, params, query })\` on every route; query strings are coerced to numbers, unknown fields are dropped
- **@axiljs/auth**: register/login with scrypt password hashes (\`hashPassword\`/\`verifyPassword\`), HS256 JWTs, \`authenticate()\` on writes, owner-or-admin checks
- **@axiljs/core**: \`Router\`s mounted under \`/auth\` and \`/products\`, the response envelope with \`res.paginated\`, CORS
- **@axiljs/config**: typed \`.env\` config; \`JWT_SECRET\` is required, so the app refuses to start without one
- **Errors**: one handler turns everything into \`{ "error": { "code", "message", "details"? } }\`: 401, 403, 404, 405, 409, 422, 500
- **@axiljs/testing**: every test file gets its own \`:memory:\` database with migrations applied; \`dev.db\` is never touched

## Run

\`\`\`bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
# edit .env: set JWT_SECRET to 32+ random characters
npm run dev                 # watch mode, http://localhost:3001
\`\`\`

On start the app opens \`DATABASE_FILENAME\` (default \`./dev.db\`, created if missing) and applies
pending migrations before it listens. The same migrations work with the CLI (it reads
\`DATABASE_FILENAME\` from \`.env\` and records into the same \`_migrations\` table):

\`\`\`bash
npm run migrate             # axil migrate: apply pending migrations without starting the app
npm run migrate:status      # which migrations ran, in which batch
npm run migrate:down        # roll back the last batch
\`\`\`

Production build:

\`\`\`bash
npm run build
npm start
\`\`\`

## Test

\`\`\`bash
npm test                    # axil test: compiles with tsc, runs src/**/*.test.ts
\`\`\`

Tests call \`setupTestApp()\` (\`src/testing/setup.ts\`), which opens a fresh \`:memory:\` SQLite database,
runs the migrations and builds the app around it. No port is configured and no file is written.

## Endpoints

| Method | Path             | Auth           | Description                          | Success | Errors             |
|--------|------------------|----------------|--------------------------------------|---------|--------------------|
| GET    | \`/\`              |                | Service name, version, endpoints     | 200     |                    |
| GET    | \`/health\`        |                | Liveness plus a database ping        | 200     | 503                |
| POST   | \`/auth/register\` |                | Create an account, returns a token   | 201     | 409, 422           |
| POST   | \`/auth/login\`    |                | Exchange email/password for a token  | 200     | 401, 422           |
| GET    | \`/auth/me\`       | Bearer         | The current user                     | 200     | 401                |
| GET    | \`/products\`      |                | List: filter, sort, paginate         | 200     | 422                |
| GET    | \`/products/:id\`  |                | One product                          | 200     | 404, 422           |
| POST   | \`/products\`      | Bearer         | Create; the caller becomes the owner | 201     | 401, 409, 422      |
| PATCH  | \`/products/:id\`  | owner or admin | Partial update                       | 200     | 401, 403, 404, 409, 422 |
| DELETE | \`/products/:id\`  | owner or admin | Delete                               | 204     | 401, 403, 404      |

### \`GET /products\` query parameters

| Parameter  | Type    | Default      | Description                                                  |
|------------|---------|--------------|--------------------------------------------------------------|
| \`page\`     | integer | \`1\`          | 1-based page number                                          |
| \`perPage\`  | integer | \`20\`         | 1-100 items per page                                         |
| \`sort\`     | enum    | \`-createdAt\` | \`name\`, \`price\`, \`createdAt\`; prefix \`-\` for descending       |
| \`q\`        | string  |              | Case-insensitive substring match on the name                 |
| \`category\` | string  |              | Exact category (case-insensitive)                            |
| \`minPrice\` | integer |              | Minimum price in cents                                       |
| \`maxPrice\` | integer |              | Maximum price in cents                                       |
| \`ownerId\`  | integer |              | Only products of this user                                   |

The response is the AxilJS paginated envelope:

\`\`\`json
{
  "status": 200, "code": "HTTP_200_OK", "message": "Products",
  "data": {
    "metadata": [ { "id": 1, "name": "Mechanical Keyboard", "sku": "KB-001", "category": "peripherals", "priceCents": 12900, "stock": 5, "ownerId": 1, "createdAt": "...", "updatedAt": null } ],
    "pagination": { "total": 6, "page": 1, "limit": 20, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false }
  }
}
\`\`\`

### Product body

| Field        | Type    | Rules                                                  |
|--------------|---------|--------------------------------------------------------|
| \`name\`       | string  | required, trimmed, 1-120 characters                    |
| \`sku\`        | string  | required, 3-32 of \`A-Z 0-9 -\`, stored upper-case, unique (409) |
| \`category\`   | string  | required, 1-40 characters, stored lower-case           |
| \`priceCents\` | integer | required, 0-100000000 (money as integer cents)         |
| \`stock\`      | integer | 0-1000000, default 0                                   |

\`PATCH\` takes the same fields, all optional, but at least one is required.

### Errors

\`\`\`json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [ { "path": "priceCents", "code": "MIN_VALUE", "source": "body", "message": "priceCents must be >= 0" } ] } }
{ "error": { "code": "CONFLICT", "message": "SKU KB-001 is already in use" } }
{ "error": { "code": "FORBIDDEN", "message": "Only the owner or an admin can modify this product" } }
\`\`\`

### curl

\`\`\`bash
# Register (or log in) and keep the token
TOKEN=$(curl -s -X POST http://localhost:3001/auth/register -H "Content-Type: application/json" \\
  -d '{"email":"ada@example.com","name":"Ada","password":"analytical-engine"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

curl -X POST http://localhost:3001/products -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"name":"Mechanical Keyboard","sku":"KB-001","category":"peripherals","priceCents":12900,"stock":5}'

curl "http://localhost:3001/products?category=peripherals&sort=-price&perPage=10"
curl "http://localhost:3001/products?q=key&maxPrice=20000&page=1"
curl -X PATCH http://localhost:3001/products/1 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"stock":4}'
curl -X DELETE http://localhost:3001/products/1 -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:3001/products -H "Content-Type: application/json" -d '{}'     # 401
\`\`\`

### PowerShell

\`curl\` is an alias for \`Invoke-WebRequest\` in Windows PowerShell, so use \`Invoke-RestMethod\` (or \`curl.exe\`):

\`\`\`powershell
$login = Invoke-RestMethod http://localhost:3001/auth/register -Method Post -ContentType 'application/json' \`
  -Body (@{ email = 'ada@example.com'; name = 'Ada'; password = 'analytical-engine' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.data.token)" }

Invoke-RestMethod http://localhost:3001/products -Method Post -Headers $headers -ContentType 'application/json' \`
  -Body (@{ name = 'Mechanical Keyboard'; sku = 'KB-001'; category = 'peripherals'; priceCents = 12900 } | ConvertTo-Json)
(Invoke-RestMethod 'http://localhost:3001/products?sort=-price').data.metadata
\`\`\`

## Roles

New accounts get the \`user\` role and can change only their own products. To make someone an
admin (who can change any product), update the row and have them log in again:

\`\`\`sql
UPDATE users SET role = 'admin' WHERE email = 'ada@example.com';
\`\`\`

## Configuration

| Variable            | Default       | Description                                        |
|---------------------|---------------|----------------------------------------------------|
| \`PORT\`              | \`3001\`        | HTTP port                                          |
| \`HOST\`              | \`127.0.0.1\`   | Bind address (\`0.0.0.0\` in containers)             |
| \`NODE_ENV\`          | \`development\` | \`development\`, \`production\` or \`test\`              |
| \`CORS_ORIGIN\`       | \`*\`           | \`*\` or a comma-separated list of origins           |
| \`DATABASE_FILENAME\` | \`./dev.db\`    | SQLite file (\`:memory:\` for a throwaway database)  |
| \`JWT_SECRET\`        | (required)    | HS256 key, at least 32 characters                  |
| \`JWT_EXPIRES_IN\`    | \`1h\`          | Token lifetime: \`30m\`, \`1h\`, \`7d\`, ...             |

## Project structure

\`\`\`
src/
  main.ts                          entry point: config, open DB, migrate, listen, graceful shutdown
  app.ts                           createApp(config, db): CORS, routers, error handler
  config.ts                        typed config (defineConfig)
  db/connection.ts                 openDatabase(filename) -> ConnectionManager
  db/migrate.ts                    ordered migration list + runner (records into _migrations)
  migrations/001_create_users.ts   Schema.create('users', ...)
  migrations/002_create_products.ts
  models/                          @Entity classes + DTO mappers (no password hash in responses)
  repositories/                    BaseRepository subclasses; ProductRepository.list() filters/sorts/pages
  routes/auth.ts                   /auth/register, /auth/login, /auth/me
  routes/products.ts               /products CRUD with validation and ownership checks
  middleware/error-handler.ts      errors -> { error: { code, message, details } }, ConflictError (409)
  testing/setup.ts                 setupTestApp(): fresh :memory: database per test file
  **/*.test.ts                     tests
\`\`\`

## Adding a table

1. Add \`src/migrations/003_<name>.ts\` (\`export default { up, down }\` using \`Schema.create\`)
2. List it in \`MIGRATIONS\` in \`src/db/migrate.ts\`; it runs on the next start (and in every test),
   or right away with \`npm run migrate\`
3. Add an \`@Entity\` model, a repository and a router; mount it in \`src/app.ts\`

## Next steps

- Postgres or MySQL: install \`pg\` or \`mysql2\`, change the driver in \`src/db/connection.ts\` and the \`Schema.create(..., 'sqlite')\` dialect in the migrations
- Rate limiting and security headers: \`@axiljs/security\` (\`rateLimit\`, \`helmet\`)
- Multi-tenant SaaS (tenants, plans, quotas, audit log)? See the \`saas-api\` template: \`axil create my-saas --template saas-api\`
`,

    '.env.example': `# Server
PORT=3001
HOST=127.0.0.1
NODE_ENV=development

# CORS: "*" or a comma-separated list of origins
CORS_ORIGIN=*

# SQLite database file (created on first start; migrations run automatically)
DATABASE_FILENAME=./dev.db

# JWT signing key: at least 32 random characters. Generate one with
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=replace-me-with-at-least-32-random-characters
JWT_EXPIRES_IN=1h
`,

    'src/app.ts': `/**
 * Application factory.
 * Builds the app around an open database connection without listening, so
 * tests can drive it with their own in-memory database.
 */

import { Application, cors } from '@axiljs/core'
import { JWT } from '@axiljs/auth'
import type { ConnectionManager } from '@axiljs/orm'
import type { Config } from './config.js'
import { errorHandler } from './middleware/error-handler.js'
import { UserRepository } from './repositories/user-repository.js'
import { ProductRepository } from './repositories/product-repository.js'
import { authRoutes } from './routes/auth.js'
import { productRoutes } from './routes/products.js'

export const SERVICE = '${ctx.name}'
export const VERSION = '1.0.0'

export function createApp(config: Config, db: ConnectionManager): Application {
  const app = new Application({
    server:  { port: config.PORT, host: config.HOST, methodNotAllowed: true },
    env:     config.NODE_ENV,
    logging: config.NODE_ENV !== 'test'
  })

  const jwt      = new JWT(config.JWT_SECRET)
  const users    = new UserRepository(db)
  const products = new ProductRepository(db)

  app.use(cors({ origin: parseOrigins(config.CORS_ORIGIN) }))

  app.get('/', (_req, res) => {
    res.success({
      service: SERVICE,
      version: VERSION,
      endpoints: [
        'GET    /health',
        'POST   /auth/register',
        'POST   /auth/login',
        'GET    /auth/me',
        'GET    /products',
        'GET    /products/:id',
        'POST   /products',
        'PATCH  /products/:id',
        'DELETE /products/:id'
      ]
    }, 'Service info')
  })

  app.get('/health', async (_req, res) => {
    const database = await db.getDriver().ping()
    res.status(database ? 200 : 503).json({
      status:    database ? 'ok' : 'degraded',
      database:  database ? 'up' : 'down',
      uptime:    Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    })
  })

  app.mount('/auth', authRoutes({ users, jwt, expiresIn: config.JWT_EXPIRES_IN }))
  app.mount('/products', productRoutes({ products, jwt }))

  // Unknown routes (404), wrong methods (405), validation (422), auth (401/403),
  // conflicts (409) and crashes (500) all end up here
  app.use(errorHandler(config.NODE_ENV))

  return app
}

function parseOrigins(value: string): string | string[] {
  if (value.trim() === '*') return '*'
  return value.split(',').map(o => o.trim()).filter(Boolean)
}
`,

    'src/config.ts': `/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 */

import { defineConfig } from '@axiljs/config'

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  return defineConfig({
    PORT:              { type: 'number', default: 3001, min: 0, max: 65535 },
    HOST:              { type: 'string', default: '127.0.0.1' },
    NODE_ENV:          { type: 'string', default: 'development', enum: ['development', 'production', 'test'] },
    // "*" or a comma-separated list of allowed origins
    CORS_ORIGIN:       { type: 'string', default: '*' },
    // SQLite file, relative to the working directory (":memory:" for a throwaway database)
    DATABASE_FILENAME: { type: 'string', default: './dev.db' },
    // HS256 signing key, at least 32 characters. No default on purpose.
    JWT_SECRET:        { type: 'string', required: true, description: 'at least 32 random characters' },
    // Token lifetime: 30m, 1h, 7d, ...
    JWT_EXPIRES_IN:    { type: 'string', default: '1h' }
  }, source)
}

export type Config = ReturnType<typeof loadConfig>
`,

    'src/db/connection.ts': `/**
 * Database connection (SQLite through better-sqlite3).
 *
 * The connection is created explicitly and passed to createApp(), so tests can
 * hand the app their own ":memory:" database instead of the dev file.
 */

import { ConnectionManager } from '@axiljs/orm'

export async function openDatabase(filename: string): Promise<ConnectionManager> {
  const db = new ConnectionManager({ driver: 'sqlite', filename })
  await db.connect()
  return db
}
`,

    'src/db/migrate.test.ts': `import { describe, it, expect } from '@axiljs/testing'
import { openDatabase } from './connection.js'
import { migrate, MIGRATIONS } from './migrate.js'

describe('migrate()', () => {
  it('applies every migration once and is idempotent', async () => {
    const db = await openDatabase(':memory:')
    try {
      expect(await migrate(db)).toEqual(MIGRATIONS.map(([name]) => name))
      expect(await migrate(db)).toEqual([])

      const { rows } = await db.getDriver().query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'products') ORDER BY name"
      )
      expect(rows.map(r => r.name)).toEqual(['products', 'users'])
    } finally {
      await db.disconnect()
    }
  })
})
`,

    'src/db/migrate.ts': `/**
 * Migration runner used at startup (and by the tests).
 *
 * Migrations live in src/migrations as \`export default { up, down }\` modules.
 * They are listed here in order, so they are compiled and bundled with the
 * app and no directory scanning happens at runtime. Applied migrations are
 * recorded in the same \`_migrations\` table that \`axil migrate\` uses.
 */

import type { ConnectionManager, Migration } from '@axiljs/orm'
import createUsers from '../migrations/001_create_users.js'
import createProducts from '../migrations/002_create_products.js'

export const MIGRATIONS: Array<[name: string, migration: Migration]> = [
  ['001_create_users', createUsers],
  ['002_create_products', createProducts]
]

/** Apply pending migrations in order; returns the names that ran. */
export async function migrate(db: ConnectionManager): Promise<string[]> {
  const driver = db.getDriver()

  await driver.query(\`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        VARCHAR(255) NOT NULL UNIQUE,
      batch       INTEGER NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  \`)

  const { rows } = await driver.query<{ name: string; batch: number }>('SELECT name, batch FROM _migrations')
  const applied  = new Set(rows.map(r => r.name))
  const batch    = Math.max(0, ...rows.map(r => r.batch)) + 1
  const ran: string[] = []

  for (const [name, migration] of MIGRATIONS) {
    if (applied.has(name)) continue
    // One transaction per migration: a failing migration leaves no trace
    await driver.transaction(async trx => {
      await migration.up(trx)
      await trx.query('INSERT INTO _migrations (name, batch) VALUES (?, ?)', [name, batch])
    })
    ran.push(name)
  }

  return ran
}
`,

    'src/main.ts': `/**
 * ${ctx.name}
 * Entry point: load .env, open the database, apply migrations, listen.
 */

import { loadEnv } from '@axiljs/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db/connection.js'
import { migrate } from './db/migrate.js'

loadEnv()

const config = loadConfig()
const db     = await openDatabase(config.DATABASE_FILENAME)

const ran = await migrate(db)
if (ran.length > 0) console.log(\`Applied migrations: \${ran.join(', ')}\`)

const app = createApp(config, db)
await app.listen()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    await db.disconnect()
    process.exit(0)
  })
}
`,

    'src/middleware/error-handler.ts': `/**
 * Error handler: turns thrown errors into one JSON shape.
 *
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
 *
 * axilError subclasses (NotFoundError, ValidationError, ConflictError, ...)
 * keep their status and code. A SQLite UNIQUE violation that slipped past the
 * explicit checks (two concurrent inserts) becomes a 409 too. Anything else
 * is a 500 whose message is hidden in production.
 */

import { axilError } from '@axiljs/core'
import type { ErrorMiddlewareFn } from '@axiljs/core'

export class ConflictError extends axilError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT')
  }
}

export function errorHandler(env: string): ErrorMiddlewareFn {
  // Four parameters: that is how Application.use() recognises an error handler
  return (err, req, res, _next) => {
    const error  = /UNIQUE constraint failed/.test(err.message) ? new ConflictError() : err
    const known  = error instanceof axilError
    const status = known ? error.statusCode : 500

    if (status >= 500) console.error(\`[\${req.method} \${req.path}]\`, err)

    res.status(status).json({
      error: {
        code:    known ? error.code : 'INTERNAL_ERROR',
        message: status >= 500 && env === 'production' ? 'Internal server error' : error.message,
        ...(known && error.details !== undefined ? { details: error.details } : {})
      }
    })
  }
}
`,

    'src/migrations/001_create_users.ts': `/**
 * Migration: 001_create_users
 */

import { Schema } from '@axiljs/orm'
import type { Migration } from '@axiljs/orm'

const migration: Migration = {
  async up(db) {
    await Schema.create('users', table => {
      table.id()
      table.string('email', 255).unique()
      table.string('name', 100)
      table.string('password_hash', 255)
      table.string('role', 20).default('user')
      table.string('created_at', 30)
    }, db, 'sqlite')
  },

  async down(db) {
    await Schema.drop('users', db)
  }
}

export default migration
`,

    'src/migrations/002_create_products.ts': `/**
 * Migration: 002_create_products
 *
 * Timestamps are ISO-8601 strings written by the app (millisecond precision,
 * so sorting by created_at is stable).
 */

import { Schema } from '@axiljs/orm'
import type { Migration } from '@axiljs/orm'

const migration: Migration = {
  async up(db) {
    await Schema.create('products', table => {
      table.id()
      table.foreignKey('owner_id', 'users')
      table.string('name', 120)
      table.string('sku', 32).unique()
      table.string('category', 40)
      table.integer('price_cents')
      table.integer('stock').default(0)
      table.string('created_at', 30)
      table.string('updated_at', 30).nullable()
      table.index(['category'])
      table.index(['price_cents'])
    }, db, 'sqlite')
  },

  async down(db) {
    await Schema.drop('products', db)
  }
}

export default migration
`,

    'src/models/product.ts': `/**
 * Product entity: a row of the \`products\` table.
 */

import { Entity, PrimaryKey, Column } from '@axiljs/orm'

@Entity('products')
export class Product {
  @PrimaryKey()
  id!: number

  @Column({ type: 'integer' })
  owner_id!: number

  @Column()
  name!: string

  @Column({ unique: true })
  sku!: string

  @Column()
  category!: string

  @Column({ type: 'integer' })
  price_cents!: number

  @Column({ type: 'integer', default: 0 })
  stock!: number

  @Column()
  created_at!: string

  @Column({ nullable: true })
  updated_at!: string | null
}

/** API shape: camelCase, money in integer cents. */
export function toProductDto(product: Product) {
  return {
    id:         product.id,
    name:       product.name,
    sku:        product.sku,
    category:   product.category,
    priceCents: product.price_cents,
    stock:      product.stock,
    ownerId:    product.owner_id,
    createdAt:  product.created_at,
    updatedAt:  product.updated_at
  }
}
`,

    'src/models/user.ts': `/**
 * User entity: a row of the \`users\` table.
 * Property names match the column names, so rows map onto it as-is.
 */

import { Entity, PrimaryKey, Column } from '@axiljs/orm'

export type Role = 'user' | 'admin'

@Entity('users')
export class User {
  @PrimaryKey()
  id!: number

  @Column({ unique: true })
  email!: string

  @Column()
  name!: string

  @Column()
  password_hash!: string

  @Column({ default: 'user' })
  role!: Role

  @Column()
  created_at!: string
}

/** Public shape: never expose the password hash. */
export function toUserDto(user: User) {
  return {
    id:        user.id,
    email:     user.email,
    name:      user.name,
    role:      user.role,
    createdAt: user.created_at
  }
}
`,

    'src/repositories/product-repository.ts': `/**
 * Products repository: CRUD from BaseRepository plus a filtered, sorted,
 * paginated list built on the ORM query builder (all values are bound
 * parameters; sort columns come from a fixed allow-list).
 */

import { BaseRepository } from '@axiljs/orm'
import type { ConnectionManager } from '@axiljs/orm'
import { Product } from '../models/product.js'

/** Sort keys accepted by the API ("-" prefix = descending). */
export const SORT_KEYS = ['name', '-name', 'price', '-price', 'createdAt', '-createdAt'] as const
export type SortKey = typeof SORT_KEYS[number]

const SORT_COLUMNS: Record<string, string> = {
  name:      'name',
  price:     'price_cents',
  createdAt: 'created_at'
}

export interface ProductQuery {
  page:      number
  perPage:   number
  sort:      SortKey
  q?:        string
  category?: string
  minPrice?: number
  maxPrice?: number
  ownerId?:  number
}

export class ProductRepository extends BaseRepository<Product> {
  constructor(db: ConnectionManager) {
    super(Product, db)
  }

  findBySku(sku: string): Promise<Product | null> {
    return this.findOne({ sku })
  }

  async list(options: ProductQuery): Promise<{ items: Product[]; total: number }> {
    const qb = this.query()

    if (options.q)                     qb.whereLike('name', \`%\${options.q}%\`)
    if (options.category)              qb.where('category', '=', options.category)
    if (options.minPrice !== undefined) qb.where('price_cents', '>=', options.minPrice)
    if (options.maxPrice !== undefined) qb.where('price_cents', '<=', options.maxPrice)
    if (options.ownerId !== undefined)  qb.where('owner_id', '=', options.ownerId)

    // Count before LIMIT/OFFSET are applied
    const total = await qb.count()

    const descending = options.sort.startsWith('-')
    const direction  = descending ? 'DESC' : 'ASC'
    const column     = SORT_COLUMNS[descending ? options.sort.slice(1) : options.sort]

    const items = await qb
      .orderBy(column, direction)
      .orderBy('id', direction)          // tie-breaker: stable pages
      .limit(options.perPage)
      .offset((options.page - 1) * options.perPage)
      .all<Product>()

    return { items, total }
  }
}
`,

    'src/repositories/user-repository.ts': `/**
 * Users repository: BaseRepository gives find/findById/create/update/delete/
 * paginate; add the queries this app needs on top.
 */

import { BaseRepository } from '@axiljs/orm'
import type { ConnectionManager } from '@axiljs/orm'
import { User } from '../models/user.js'

export class UserRepository extends BaseRepository<User> {
  constructor(db: ConnectionManager) {
    super(User, db)
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOne({ email })
  }
}
`,

    'src/routes/auth.test.ts': `import { describe, it, expect } from '@axiljs/testing'
import { setupTestApp } from '../testing/setup.js'

const { client } = await setupTestApp()

describe('POST /auth/register', () => {
  it('creates an account and returns a token without the password hash', async () => {
    const res = await client.post('/auth/register').send({ email: ' Ada@Example.com ', name: 'Ada', password: 'analytical-engine' })
    expect(res.status).toBe(201)
    expect(res.body.data.user.email).toBe('ada@example.com')
    expect(res.body.data.user.role).toBe('user')
    expect(res.body.data.user.password_hash).toBeUndefined()
    expect(res.body.data.token.split('.')).toHaveLength(3)
  })

  it('returns 409 for an email that is already registered', async () => {
    const res = await client.post('/auth/register').send({ email: 'ada@example.com', name: 'Ada 2', password: 'analytical-engine' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  it('returns 422 with field errors for invalid input', async () => {
    const res = await client.post('/auth/register').send({ email: 'not-an-email', password: 'short' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    const paths = res.body.error.details.map((d: { path: string }) => d.path)
    expect(paths).toContain('email')
    expect(paths).toContain('name')
    expect(paths).toContain('password')
  })
})

describe('POST /auth/login', () => {
  it('returns a token for valid credentials', async () => {
    const res = await client.post('/auth/login').send({ email: 'ADA@example.com', password: 'analytical-engine' })
    expect(res.status).toBe(200)
    expect(typeof res.body.data.token).toBe('string')
  })

  it('returns 401 for a wrong password', async () => {
    const res = await client.post('/auth/login').send({ email: 'ada@example.com', password: 'wrong-password' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns the same 401 for an unknown email', async () => {
    const res = await client.post('/auth/login').send({ email: 'nobody@example.com', password: 'whatever-123' })
    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe('Invalid email or password')
  })
})

describe('GET /auth/me', () => {
  it('returns the current user for a valid token', async () => {
    const login = await client.post('/auth/login').send({ email: 'ada@example.com', password: 'analytical-engine' })
    const res = await client.get('/auth/me').auth(login.body.data.token)
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Ada')
  })

  it('returns 401 without a token', async () => {
    const res = await client.get('/auth/me')
    expect(res.status).toBe(401)
  })

  it('returns 401 for a tampered token', async () => {
    const login = await client.post('/auth/login').send({ email: 'ada@example.com', password: 'analytical-engine' })
    const token = login.body.data.token as string
    const res = await client.get('/auth/me').auth(token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA'))
    expect(res.status).toBe(401)
  })
})
`,

    'src/routes/auth.ts': `/**
 * /auth: register, log in, and read the current user.
 *
 * Passwords are hashed with scrypt (hashPassword) and checked in constant
 * time (verifyPassword). Tokens are HS256 JWTs carrying the user id (sub)
 * and role; send them as \`Authorization: Bearer <token>\`.
 */

import { Router, UnauthorizedError } from '@axiljs/core'
import { JWT, authenticate, getUser, hashPassword, verifyPassword } from '@axiljs/auth'
import { v, validate } from '@axiljs/validation'
import { ConflictError } from '../middleware/error-handler.js'
import { toUserDto } from '../models/user.js'
import type { User } from '../models/user.js'
import type { UserRepository } from '../repositories/user-repository.js'

const RegisterBody = v.object({
  email:    v.string().trim().email().max(255).transform(s => s.toLowerCase()),
  name:     v.string().trim().min(1).max(100),
  password: v.string().min(8).max(128)
}).strip()

const LoginBody = v.object({
  email:    v.string().trim().email().transform(s => s.toLowerCase()),
  password: v.string().min(1).max(128)
}).strip()

interface RegisterInput { email: string; name: string; password: string }
interface LoginInput    { email: string; password: string }

export interface AuthDeps {
  users:     UserRepository
  jwt:       JWT
  expiresIn: string
}

export function authRoutes({ users, jwt, expiresIn }: AuthDeps): Router {
  const router = new Router()

  const issueToken = (user: User) => jwt.sign({ sub: user.id, role: user.role }, { expiresIn })

  router.post('/register', validate({ body: RegisterBody }), async (req, res) => {
    const { email, name, password } = req.body as RegisterInput

    if (await users.findByEmail(email)) {
      throw new ConflictError('An account with this email already exists')
    }

    const user = await users.create({
      email,
      name,
      password_hash: await hashPassword(password),
      role:          'user',
      created_at:    new Date().toISOString()
    })

    res.created({ user: toUserDto(user), token: issueToken(user) }, 'Account created')
  })

  router.post('/login', validate({ body: LoginBody }), async (req, res) => {
    const { email, password } = req.body as LoginInput
    const user = await users.findByEmail(email)

    // Same error for "no such user" and "wrong password": don't leak which emails exist
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new UnauthorizedError('Invalid email or password')
    }

    res.success({ user: toUserDto(user), token: issueToken(user) }, 'Logged in')
  })

  router.get('/me', authenticate(jwt), async (req, res) => {
    const user = await users.findById(Number(getUser(req).id))
    if (!user) throw new UnauthorizedError('Account no longer exists')
    res.success(toUserDto(user), 'Current user')
  })

  return router
}
`,

    'src/routes/products.test.ts': `import { describe, it, expect } from '@axiljs/testing'
import { setupTestApp, exec } from '../testing/setup.js'

const { client, db, signUp } = await setupTestApp()

const seed = [
  { name: 'Mechanical Keyboard', sku: 'KB-001',  category: 'peripherals', priceCents: 12900, stock: 5 },
  { name: 'Wireless Mouse',      sku: 'MS-001',  category: 'peripherals', priceCents: 3900,  stock: 40 },
  { name: 'USB-C Hub',           sku: 'HUB-001', category: 'accessories', priceCents: 4900,  stock: 12 },
  { name: '4K Monitor',          sku: 'MON-001', category: 'displays',    priceCents: 39900, stock: 2 },
  { name: 'Keyboard Wrist Rest', sku: 'KB-002',  category: 'accessories', priceCents: 1900,  stock: 30 }
]

// Fixtures, created once before the tests run (top-level await: this file is an ES module)
const alice = await signUp('alice@example.com', 'Alice')     // owns the seeded products
const bob   = await signUp('bob@example.com', 'Bob')         // another user

// Promote a third user to admin straight in the database, then log in again
// so the new role is in the token
await signUp('root@example.com', 'Root')
await exec(db, "UPDATE users SET role = 'admin' WHERE email = ?", ['root@example.com'])
const admin = (await client.post('/auth/login').send({ email: 'root@example.com', password: 'correct-horse-battery' })).body.data.token as string

for (const product of seed) {
  const res = await client.post('/products').auth(alice).send(product)
  if (res.status !== 201) throw new Error(\`seed failed: \${res.text}\`)
}

describe('POST /products', () => {
  it('requires authentication (401)', async () => {
    const res = await client.post('/products').send({ name: 'Cable', sku: 'CAB-001', category: 'cables', priceCents: 500 })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('creates a product owned by the caller, with normalised fields', async () => {
    const res = await client.post('/products').auth(bob).send({ name: '  Cable  ', sku: 'cab-001', category: 'Cables', priceCents: 500 })
    expect(res.status).toBe(201)
    expect(res.headers['location']).toBe(\`/products/\${res.body.data.id}\`)
    expect(res.body.data).toMatchObject({ name: 'Cable', sku: 'CAB-001', category: 'cables', priceCents: 500, stock: 0 })
  })

  it('returns 409 for a duplicate SKU', async () => {
    const res = await client.post('/products').auth(bob).send({ name: 'Other', sku: 'KB-001', category: 'x', priceCents: 1 })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  it('returns 422 with every invalid field', async () => {
    const res = await client.post('/products').auth(bob).send({ name: '', sku: 'a b', priceCents: -1, stock: 1.5 })
    expect(res.status).toBe(422)
    const paths = res.body.error.details.map((d: { path: string }) => d.path)
    for (const field of ['name', 'sku', 'category', 'priceCents', 'stock']) expect(paths).toContain(field)
  })
})

describe('GET /products/:id', () => {
  it('returns a product', async () => {
    const res = await client.get('/products/1')
    expect(res.status).toBe(200)
    expect(res.body.data.sku).toBe('KB-001')
  })

  it('returns 404 for a missing product', async () => {
    const res = await client.get('/products/9999')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 422 for a non-numeric id', async () => {
    const res = await client.get('/products/abc')
    expect(res.status).toBe(422)
    expect(res.body.error.details[0].source).toBe('params')
  })
})

describe('GET /products (pagination, filtering, sorting)', () => {
  it('paginates with totals and page flags', async () => {
    const res = await client.get('/products?perPage=2&page=2&sort=name')
    expect(res.status).toBe(200)
    const { metadata, pagination } = res.body.data
    expect(metadata).toHaveLength(2)
    expect(pagination).toMatchObject({ total: 6, page: 2, limit: 2, totalPages: 3, hasNextPage: true, hasPrevPage: true })
  })

  it('returns an empty last page past the end', async () => {
    const res = await client.get('/products?perPage=5&page=9')
    expect(res.body.data.metadata).toEqual([])
    expect(res.body.data.pagination.hasNextPage).toBe(false)
  })

  it('filters by category and sorts by price descending', async () => {
    const res = await client.get('/products?category=Peripherals&sort=-price')
    const skus = res.body.data.metadata.map((p: { sku: string }) => p.sku)
    expect(skus).toEqual(['KB-001', 'MS-001'])
  })

  it('searches by name and filters by price range', async () => {
    const res = await client.get('/products?q=keyboard&maxPrice=5000')
    const skus = res.body.data.metadata.map((p: { sku: string }) => p.sku)
    expect(skus).toEqual(['KB-002'])
  })

  it('sorts by name ascending', async () => {
    const res = await client.get('/products?sort=name&perPage=3')
    const names = res.body.data.metadata.map((p: { name: string }) => p.name)
    expect(names).toEqual(['4K Monitor', 'Cable', 'Keyboard Wrist Rest'])
  })

  it('rejects invalid query parameters (422)', async () => {
    const res = await client.get('/products?perPage=500&sort=price;drop&page=0')
    expect(res.status).toBe(422)
    const paths = res.body.error.details.map((d: { path: string }) => d.path)
    expect(paths).toContain('perPage')
    expect(paths).toContain('sort')
    expect(paths).toContain('page')
  })
})

describe('PATCH /products/:id', () => {
  it('lets the owner update fields', async () => {
    const res = await client.patch('/products/2').auth(alice).send({ priceCents: 3500, stock: 39 })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ priceCents: 3500, stock: 39, name: 'Wireless Mouse' })
    expect(typeof res.body.data.updatedAt).toBe('string')
  })

  it('forbids other users (403)', async () => {
    const res = await client.patch('/products/2').auth(bob).send({ priceCents: 1 })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('lets an admin update any product', async () => {
    const res = await client.patch('/products/2').auth(admin).send({ stock: 0 })
    expect(res.status).toBe(200)
    expect(res.body.data.stock).toBe(0)
  })

  it('returns 409 when changing to a SKU in use', async () => {
    const res = await client.patch('/products/2').auth(alice).send({ sku: 'KB-001' })
    expect(res.status).toBe(409)
  })

  it('returns 422 for an empty update', async () => {
    const res = await client.patch('/products/2').auth(alice).send({})
    expect(res.status).toBe(422)
  })

  it('requires authentication (401)', async () => {
    const res = await client.patch('/products/2').send({ stock: 1 })
    expect(res.status).toBe(401)
  })
})

describe('DELETE /products/:id', () => {
  it('forbids other users (403)', async () => {
    const res = await client.delete('/products/3').auth(bob)
    expect(res.status).toBe(403)
  })

  it('lets the owner delete, then the product is gone', async () => {
    const res = await client.delete('/products/3').auth(alice)
    expect(res.status).toBe(204)
    const after = await client.get('/products/3')
    expect(after.status).toBe(404)
  })

  it('returns 404 for a product that does not exist', async () => {
    const res = await client.delete('/products/3').auth(alice)
    expect(res.status).toBe(404)
  })
})

describe('service routes', () => {
  it('reports health including the database', async () => {
    const res = await client.get('/health')
    expect(res.status).toBe(200)
    expect(res.body.database).toBe('up')
  })

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await client.get('/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 405 for a known path with the wrong method', async () => {
    const res = await client.put('/products/1').auth(alice).send({})
    expect(res.status).toBe(405)
  })
})
`,

    'src/routes/products.ts': `/**
 * /products: public reads, authenticated writes.
 *
 *   GET    /products          list: filter, sort, paginate
 *   GET    /products/:id      one product
 *   POST   /products          create (any signed-in user; they become the owner)
 *   PATCH  /products/:id      partial update (owner or admin)
 *   DELETE /products/:id      delete (owner or admin)
 */

import { Router, ForbiddenError, NotFoundError } from '@axiljs/core'
import type { axilRequest } from '@axiljs/core'
import { JWT, authenticate, getUser } from '@axiljs/auth'
import { v, validate } from '@axiljs/validation'
import { ConflictError } from '../middleware/error-handler.js'
import { toProductDto } from '../models/product.js'
import type { Product } from '../models/product.js'
import { SORT_KEYS } from '../repositories/product-repository.js'
import type { ProductQuery, ProductRepository } from '../repositories/product-repository.js'

// ─── Schemas ──────────────────────────────────────────────────────────────────

// Query-string values arrive as strings: v.number() accepts "2", transform(Number) hands back 2
const int = (min: number, max = Number.MAX_SAFE_INTEGER) => v.number().integer().min(min).max(max)

const ListQuery = v.object({
  page:     int(1).default(1).transform(Number),
  perPage:  int(1, 100).default(20).transform(Number),
  sort:     v.enum([...SORT_KEYS]).default('-createdAt'),
  q:        v.string().trim().min(1).max(100).optional(),
  category: v.string().trim().min(1).max(40).transform(s => s.toLowerCase()).optional(),
  minPrice: int(0).transform(Number).optional(),
  maxPrice: int(0).transform(Number).optional(),
  ownerId:  int(1).transform(Number).optional()
}).strip()

const IdParams = v.object({
  id: int(1).transform(Number)
})

const sku = () => v.string().trim().pattern(/^[A-Za-z0-9-]{3,32}$/).transform(s => s.toUpperCase())

const CreateBody = v.object({
  name:       v.string().trim().min(1).max(120),
  sku:        sku(),
  category:   v.string().trim().min(1).max(40).transform(s => s.toLowerCase()),
  priceCents: int(0, 100_000_000).transform(Number),
  stock:      int(0, 1_000_000).default(0).transform(Number)
}).strip()

const UpdateBody = v.object({
  name:       v.string().trim().min(1).max(120).optional(),
  sku:        sku().optional(),
  category:   v.string().trim().min(1).max(40).transform(s => s.toLowerCase()).optional(),
  priceCents: int(0, 100_000_000).transform(Number).optional(),
  stock:      int(0, 1_000_000).transform(Number).optional()
}).strip().custom(
  body => Object.keys(body).some(k => ['name', 'sku', 'category', 'priceCents', 'stock'].includes(k)),
  'Provide at least one of: name, sku, category, priceCents, stock'
)

interface CreateInput {
  name:       string
  sku:        string
  category:   string
  priceCents: number
  stock:      number
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export interface ProductDeps {
  products: ProductRepository
  jwt:      JWT
}

export function productRoutes({ products, jwt }: ProductDeps): Router {
  const router = new Router()
  const requireAuth = authenticate(jwt)

  /** Load :id or 404. */
  const load = async (req: axilRequest): Promise<Product> => {
    const product = await products.findById(req.params.id)
    if (!product) throw new NotFoundError(\`Product \${req.params.id} not found\`)
    return product
  }

  /** Owners may change their products; admins may change any. */
  const assertCanModify = (req: axilRequest, product: Product): void => {
    const user = getUser(req)
    if (user.role !== 'admin' && Number(user.id) !== product.owner_id) {
      throw new ForbiddenError('Only the owner or an admin can modify this product')
    }
  }

  const assertSkuFree = async (sku: string, exceptId?: number): Promise<void> => {
    const existing = await products.findBySku(sku)
    if (existing && existing.id !== exceptId) {
      throw new ConflictError(\`SKU \${sku} is already in use\`)
    }
  }

  router.get('/', validate({ query: ListQuery }), async (req, res) => {
    const query = req.query as unknown as ProductQuery
    const { items, total } = await products.list(query)
    res.paginated(items.map(toProductDto), total, query.page, query.perPage, 'Products')
  })

  router.get('/:id', validate({ params: IdParams }), async (req, res) => {
    res.success(toProductDto(await load(req)), 'Product')
  })

  router.post('/', requireAuth, validate({ body: CreateBody }), async (req, res) => {
    const input = req.body as CreateInput
    await assertSkuFree(input.sku)

    const product = await products.create({
      owner_id:    Number(getUser(req).id),
      name:        input.name,
      sku:         input.sku,
      category:    input.category,
      price_cents: input.priceCents,
      stock:       input.stock,
      created_at:  new Date().toISOString()
    })

    res.header('Location', \`/products/\${product.id}\`)
    res.created(toProductDto(product), 'Product created')
  })

  router.patch('/:id', requireAuth, validate({ params: IdParams, body: UpdateBody }), async (req, res) => {
    const product = await load(req)
    assertCanModify(req, product)

    const input = req.body as Partial<CreateInput>
    if (input.sku !== undefined) await assertSkuFree(input.sku, product.id)

    const updated = await products.update(product.id, {
      name:        input.name,
      sku:         input.sku,
      category:    input.category,
      price_cents: input.priceCents,
      stock:       input.stock,
      updated_at:  new Date().toISOString()
    })

    res.success(toProductDto(updated), 'Product updated')
  })

  router.delete('/:id', requireAuth, validate({ params: IdParams }), async (req, res) => {
    const product = await load(req)
    assertCanModify(req, product)
    await products.delete(product.id)
    res.status(204).send('')
  })

  return router
}
`,

    'src/testing/setup.ts': `/**
 * Test helpers: every call builds a fresh app on its own ":memory:" SQLite
 * database with all migrations applied, so tests never touch dev.db and
 * never see each other's data.
 */

import { createTestClient } from '@axiljs/testing'
import type { ConnectionManager } from '@axiljs/orm'
import { createApp } from '../app.js'
import { loadConfig } from '../config.js'
import { openDatabase } from '../db/connection.js'
import { migrate } from '../db/migrate.js'

// Test-only signing key (not a secret; never use it outside tests)
export const TEST_JWT_SECRET = 'test-only-jwt-secret-not-for-production-use'

export async function setupTestApp() {
  const config = loadConfig({
    NODE_ENV:          'test',
    DATABASE_FILENAME: ':memory:',
    JWT_SECRET:        TEST_JWT_SECRET
  })
  const db     = await openDatabase(config.DATABASE_FILENAME)
  await migrate(db)

  const app    = createApp(config, db)
  const client = createTestClient(app)

  /** Register a user and return their bearer token. */
  async function signUp(email: string, name = 'Test User', password = 'correct-horse-battery'): Promise<string> {
    const res = await client.post('/auth/register').send({ email, name, password })
    if (res.status !== 201) throw new Error(\`signUp(\${email}) failed: \${res.status} \${res.text}\`)
    return res.body.data.token as string
  }

  return { app, client, db, signUp }
}

/** Run SQL directly (e.g. promote a user to admin). */
export async function exec(db: ConnectionManager, sql: string, params: unknown[] = []): Promise<void> {
  await db.getDriver().query(sql, params)
}
`
  }),

  nextSteps: () => [
    ['Edit .env', 'Set JWT_SECRET to 32+ random characters'],
    ['npm test', 'CRUD, auth, validation and paging tests on :memory:']
  ]
}
