/**
 * AxilJS CLI
 * create command
 *
 * Creates a production-ready AxilJS application, installs dependencies,
 * and prints the exact commands required to start development.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

import fs from 'node:fs'
import path from 'node:path'

import * as ui from '../ui'
import { npmSummary, printCaptured, runCaptured } from '../utils/exec'


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Database = 'none' | 'sqlite' | 'postgres' | 'mysql'

export const DATABASES: Database[] = ['none', 'sqlite', 'postgres', 'mysql']

export interface ProjectOptions {
  database:         Database
  includeAuth:      boolean
  includeAI:        boolean
  includeWebsocket: boolean
  includeQueue:     boolean
}

/**
 * Non-interactive options for createProject(). Every field is optional:
 * a field that is set skips its prompt.
 */
export interface CreateOptions {
  // Accept defaults for every option not given explicitly (no prompts)
  yes?:         boolean
  // Database driver (default: none)
  db?:          Database
  // JWT + RBAC (default: true)
  auth?:        boolean
  // AI platform (default: false)
  ai?:          boolean
  // WebSocket support (default: false)
  ws?:          boolean
  // Queue and Scheduler (default: false)
  queue?:       boolean
  // Skip `npm install` (default: false)
  skipInstall?: boolean
  // Allow an existing non-empty target directory (default: false)
  force?:       boolean
  // Parent directory of the project (default: process.cwd())
  cwd?:         string
  // Force prompting on/off (default: process.stdin.isTTY)
  interactive?: boolean
}

export const CREATE_DEFAULTS: ProjectOptions = {
  database:         'none',
  includeAuth:      true,
  includeAI:        false,
  includeWebsocket: false,
  includeQueue:     false
}


// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/** "  ? Question (default) " — readline question text. */
function questionText(question: string, hint: string): string {
  return `  ${ui.c.bold(ui.c.cyan('?'))} ${ui.c.bold(question)} ${hint} `
}

function prompt(question: string, fallback: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((res) => {
    rl.question(questionText(question, ui.muted(`(${fallback})`)), (raw) => {
      rl.close()
      res(raw.trim() || fallback)
    })
  })
}

function confirmPrompt(question: string, fallback = false): Promise<boolean> {
  const hint = ui.muted(fallback ? '(Y/n)' : '(y/N)')

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((res) => {
    rl.question(questionText(question, hint), (raw) => {
      rl.close()
      const a = raw.trim().toLowerCase()
      if (['y', 'yes'].includes(a)) return res(true)
      if (['n', 'no'].includes(a))  return res(false)
      res(fallback)
    })
  })
}

async function databasePrompt(): Promise<Database> {
  ui.line(`${ui.c.bold(ui.c.cyan('?'))} ${ui.c.bold('Database driver')}`)

  const items: Array<{ n: string; name: string; desc: string }> = [
    { n: '1', name: 'none',     desc: 'No database'            },
    { n: '2', name: 'sqlite',   desc: 'Embedded file database' },
    { n: '3', name: 'postgres', desc: 'PostgreSQL'             },
    { n: '4', name: 'mysql',    desc: 'MySQL / MariaDB'        }
  ]

  ui.table(
    items.map(it => [ui.cmd(it.n), ui.c.bold(it.name), ui.muted(it.desc)]),
    { indent: 6, gap: 2 }
  )
  ui.line()

  const map: Record<string, Database> = {
    '1': 'none', '2': 'sqlite', '3': 'postgres', '4': 'mysql'
  }

  const raw = await prompt('Select', '1')

  if (map[raw]) return map[raw]

  const norm = raw.toLowerCase()
  if (['none', 'sqlite', 'postgres', 'mysql'].includes(norm)) {
    return norm as Database
  }

  ui.warn('Invalid selection, using none.')
  return 'none'
}


// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateProjectName(name: string): void {
  const n = name.trim()
  if (!n) throw new Error('Project name is required.')
  if (n === '.' || n === '..' || n.includes('/') || n.includes('\\'))
    throw new Error('Project name must be a single directory name, not a path.')
  if (!/^[a-zA-Z0-9._-]+$/.test(n))
    throw new Error('Only letters, numbers, dots, hyphens, and underscores are allowed.')
  if (n.startsWith('.') || n.startsWith('-'))
    throw new Error('Cannot start with "." or "-".')
}


// ---------------------------------------------------------------------------
// File / process helpers
// ---------------------------------------------------------------------------

function writeFile(dir: string, rel: string, content: string): void {
  const fp = join(dir, rel)
  mkdirSync(resolve(fp, '..'), { recursive: true })
  writeFileSync(fp, content, 'utf8')
}


// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

function getAxilJSVersion(): string {
  const p = path.resolve(__dirname, '../../package.json')
  if (!fs.existsSync(p))
    throw new Error(`Cannot find CLI package.json at: ${p}`)
  const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'))
  if (!pkg.version)
    throw new Error(`CLI package.json has no version field: ${p}`)
  return pkg.version as string
}

const axilVersion = getAxilJSVersion()

// Range for sibling @axiljs/* packages. The CLI can be published at a newer
// patch than the other packages (e.g. cli 0.3.2 vs core 0.3.1), so pin to the
// minor line instead of the CLI's exact patch to keep `npm install` resolvable.
const axilRange = `^${axilVersion.split('.').slice(0, 2).join('.')}.0`


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function createProject(name: string, opts: CreateOptions = {}): Promise<void> {
  validateProjectName(name)

  if (opts.db !== undefined && !DATABASES.includes(opts.db)) {
    throw new Error(`Invalid database "${opts.db}". Expected one of: ${DATABASES.join(', ')}.`)
  }

  const projectDir = join(opts.cwd || process.cwd(), name)

  if (existsSync(projectDir)) {
    const empty = fs.statSync(projectDir).isDirectory() && fs.readdirSync(projectDir).length === 0
    if (!fs.statSync(projectDir).isDirectory()) {
      throw new Error(`"${name}" already exists and is not a directory.`)
    }
    if (!empty && !opts.force) {
      throw new Error(`Directory "${name}" already exists and is not empty. Use --force to create into it anyway.`)
    }
  }

  // Prompt only on a TTY and without --yes; otherwise use flags + defaults
  const interactive = opts.interactive ?? (!opts.yes && process.stdin.isTTY === true)
  const startedAt   = Date.now()

  // ── Header ───────────────────────────────────────────────────────────
  ui.title('create', `AxilJS v${axilVersion}`)
  ui.step(`Creating ${ui.c.bold(name)} in ${ui.path(projectDir)}`)

  // ── Features ─────────────────────────────────────────────────────────
  if (interactive) {
    ui.section('Configure')
    ui.line()
  }

  const database = opts.db ?? (interactive ? await databasePrompt() : CREATE_DEFAULTS.database)
  const includeAuth      = opts.auth  ?? (interactive ? await confirmPrompt('Authentication (JWT + RBAC)?', true)  : CREATE_DEFAULTS.includeAuth)
  const includeAI        = opts.ai    ?? (interactive ? await confirmPrompt('AI platform?',                 false) : CREATE_DEFAULTS.includeAI)
  const includeWebsocket = opts.ws    ?? (interactive ? await confirmPrompt('WebSocket support?',           false) : CREATE_DEFAULTS.includeWebsocket)
  const includeQueue     = opts.queue ?? (interactive ? await confirmPrompt('Queue and Scheduler?',         false) : CREATE_DEFAULTS.includeQueue)

  const options: ProjectOptions = {
    database,
    includeAuth,
    includeAI,
    includeWebsocket,
    includeQueue
  }

  // ── Summary ──────────────────────────────────────────────────────────
  ui.section('Summary')

  const on  = ui.c.green('on')
  const off = ui.muted('-')

  ui.keyValue([
    ['Database',  database === 'none' ? ui.muted('none') : ui.cmd(database)],
    ['Auth',      includeAuth      ? on : off],
    ['AI',        includeAI        ? on : off],
    ['WebSocket', includeWebsocket ? on : off],
    ['Queue',     includeQueue     ? on : off]
  ])
  if (interactive) ui.line()

  const ok = interactive ? await confirmPrompt('Create project?', true) : true

  if (!ok) {
    ui.warn('Cancelled.')
    ui.line()
    return
  }

  // ── Scaffold ─────────────────────────────────────────────────────────
  ui.section('Scaffold')

  const dirs  = [
    'src',
    'src/config',
    'src/modules',
    'src/modules/users',
    'src/modules/users/controllers',
    'src/modules/users/services'
  ]
  if (database !== 'none') dirs.push('src/db', 'src/migrations')

  let written = 0
  const write = (rel: string, content: string): void => {
    writeFile(projectDir, rel, content)
    written++
  }

  try {
    for (const d of dirs) mkdirSync(join(projectDir, d), { recursive: true })
    ui.success('Project structure', `${dirs.length} directories`)

    write('package.json',           generatePackageJson(name, options))
    write('tsconfig.json',           generateTsConfig())
    write('.gitignore',               generateGitignore())
    write('.env.example',             generateEnvExample(options))
    write('README.md',                generateReadme(name, options))
    write('src/main.ts',              generateMainFile(name, options))
    write('src/config/app.config.ts', generateAppConfig())

    write(
      'src/modules/users/controllers/users.controller.ts',
      generateUsersController(options)
    )
    write(
      'src/modules/users/services/users.service.ts',
      generateUsersService(options)
    )

    if (database !== 'none') {
      write('src/db/connection.ts',              generateDbConnection(database))
      write('src/migrations/001_create_users.ts', generateUsersMigration(database))
    }

    ui.success('Application files', `${written} files written`)

    if (opts.skipInstall) {
      ui.warn('Skipped (--skip-install)', 'run npm install inside the project')
    } else {
      const installStart = Date.now()
      const spin = ui.spinner('Installing dependencies')
      const result = await runCaptured('npm install', projectDir)
      if (result.code !== 0) {
        spin.fail('Dependency install failed', 'npm install')
        printCaptured(result.output, l => console.error(l))
        throw new Error(`npm install exited with code ${result.code}.`)
      }
      spin.succeed(
        'Dependencies installed',
        npmSummary(result.output) ?? ui.formatDuration(Date.now() - installStart)
      )
    }
  } catch (err) {
    ui.line()
    ui.warn(`Left at: ${projectDir}`)
    ui.detail('Remove it manually before retrying.')
    throw err
  }

  ui.done(`Created ${name}`, startedAt)

  // ── Next steps ───────────────────────────────────────────────────────
  const isWin   = process.platform === 'win32'
  const copyCmd = isWin ? 'Copy-Item .env.example .env' : 'cp .env.example .env'

  const steps: Array<[string, string?]> = [[`cd ${name}`]]
  if (opts.skipInstall) steps.push(['npm install'])
  steps.push([copyCmd])

  if (database === 'postgres') {
    steps.push(['Edit .env', 'Set DATABASE_URL to your PostgreSQL connection string'])
  } else if (database === 'mysql') {
    steps.push(['Edit .env', 'Set DATABASE_URL to your MySQL connection string'])
  } else if (database === 'sqlite') {
    steps.push(['Review .env', 'DATABASE_FILENAME defaults to ./dev.db'])
  }

  if (options.includeAuth) {
    steps.push(['Edit .env', 'Set JWT_SECRET to a random string (32+ characters)'])
  }

  if (database !== 'none') {
    steps.push(['npm run migrate', 'Creates the users table (axil migrate)'])
  }

  steps.push(['npm run dev'])

  const lines: string[] = []
  steps.forEach(([command, hint], i) => {
    const isCommand = !/^(Edit|Review) /.test(command)
    lines.push(`${ui.muted(`${i + 1}.`)} ${isCommand ? ui.cmd(command) : ui.c.bold(command)}`)
    if (hint) lines.push(`   ${ui.muted(hint)}`)
  })
  ui.box('Next steps', lines)

  // ── Links ────────────────────────────────────────────────────────────
  ui.keyValue([
    ['Local', ui.cmd('http://localhost:3000')],
    ['Docs',  ui.path('https://github.com/SyntaxilitY/AxilJS')],
    ['npm',   ui.path('https://www.npmjs.com/org/axiljs')]
  ])
  ui.line()
  ui.line(`${ui.muted('Run')} ${ui.cmd('npm run dev')} ${ui.muted('inside')} ${ui.c.bold(name)} ${ui.muted('to start developing.')}`)
  ui.line()
}


// ---------------------------------------------------------------------------
// Generators (unchanged logic, clean output)
// ---------------------------------------------------------------------------

function generatePackageJson(name: string, options: ProjectOptions): string {
  const deps: Record<string, string> = {
    '@axiljs/core':   axilRange,
    '@axiljs/config': axilRange
  }

  if (options.database !== 'none') {
    deps['@axiljs/orm'] = axilRange
    if (options.database === 'postgres') deps['pg']             = '^8.23.0'
    if (options.database === 'mysql')    deps['mysql2']         = '^3.23.3'
    if (options.database === 'sqlite')   deps['better-sqlite3'] = '^13.0.3'
  }

  if (options.includeAuth)      deps['@axiljs/auth']      = axilRange
  if (options.includeAI)        deps['@axiljs/ai']        = axilRange
  if (options.includeWebsocket) deps['@axiljs/websocket'] = axilRange
  if (options.includeQueue)     deps['@axiljs/queue']     = axilRange

  return JSON.stringify({
    name,
    version: '1.0.0',
    private: true,
    type: 'module',
    description: `${name} - AxilJS application`,
    scripts: {
      dev:   'axil run',
      build: 'tsc',
      start: 'node dist/main.js',
      test:  'axil test',
      ...(options.database !== 'none' ? { migrate: 'axil migrate' } : {})
    },
    dependencies: deps,
    devDependencies: {
      '@axiljs/cli':     `^${axilVersion}`,
      // `npm test` → `axil test` loads the project's @axiljs/testing
      '@axiljs/testing': axilRange,
      '@types/node':     '^26.2.0',
      typescript:        '^7.0.2'
    }
  }, null, 2) + '\n'
}

function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target:                           'ES2023',
      module:                           'Node16',
      moduleResolution:                 'Node16',
      lib:                              ['ES2023'],
      types:                            ['node'],
      strict:                           true,
      esModuleInterop:                  true,
      skipLibCheck:                     true,
      forceConsistentCasingInFileNames: true,
      isolatedModules:                  true,
      rootDir:                          './src',
      outDir:                           './dist',
      incremental:                      true,
      tsBuildInfoFile:                  './dist/.tsbuildinfo',
      experimentalDecorators:           true,
      emitDecoratorMetadata:            false,
      declaration:                      true,
      declarationMap:                   true,
      sourceMap:                        true
    },
    include: ['src/**/*'],
    exclude: ['dist', 'node_modules']
  }, null, 2) + '\n'
}

function generateGitignore(): string {
  return [
    'node_modules/', 'dist/', '.env', '.env.local', '*.log', '.tsbuildinfo', ''
  ].join('\n')
}

function generateEnvExample(options: ProjectOptions): string {
  const l: string[] = [
    '# Server', 'PORT=3000', 'HOST=127.0.0.1', 'NODE_ENV=development', ''
  ]

  if (options.includeAuth) {
    l.push(
      '# Authentication',
      '# Replace with a securely generated random string (32+ characters).',
      'JWT_SECRET=change-this-secret-to-a-random-value-with-at-least-32-characters', ''
    )
  }

  if (options.database === 'postgres') {
    l.push('# PostgreSQL', '# Format: postgres://username:password@host:port/database',
      'DATABASE_URL=postgres://username:password@localhost:5432/mydb', '')
  } else if (options.database === 'mysql') {
    l.push('# MySQL / MariaDB', '# Format: mysql://username:password@host:port/database',
      'DATABASE_URL=mysql://username:password@localhost:3306/mydb', '')
  } else if (options.database === 'sqlite') {
    l.push('# SQLite', '# Path to the database file. Created automatically on first run.',
      'DATABASE_FILENAME=./dev.db', '')
  }

  if (options.includeAI) {
    l.push(
      '# AI Platform', '# Set AI_PROVIDER to: ollama | openai | anthropic | google',
      'AI_PROVIDER=ollama', 'OLLAMA_MODEL=llama3.2',
      'OLLAMA_URL=http://127.0.0.1:11434',
      'OPENAI_API_KEY=', 'ANTHROPIC_API_KEY=', 'GOOGLE_API_KEY=', ''
    )
  }

  return l.join('\n')
}

function generateReadme(name: string, options: ProjectOptions): string {
  const f: string[] = ['HTTP server', 'Routing', 'Middleware', 'Built-in response handling']
  if (options.database !== 'none') f.push(`ORM (${options.database})`, 'Database migrations')
  if (options.includeAuth)      f.push('JWT authentication', 'Role-based access control (RBAC)')
  if (options.includeAI)        f.push('AI platform')
  if (options.includeWebsocket) f.push('WebSockets')
  if (options.includeQueue)     f.push('Queue and Scheduler')

  const dbNote = options.database === 'postgres'
    ? '\nUpdate `DATABASE_URL` in `.env` with your PostgreSQL credentials before starting.\n'
    : options.database === 'mysql'
      ? '\nUpdate `DATABASE_URL` in `.env` with your MySQL credentials before starting.\n' : ''

  const hasDb = options.database !== 'none'

  const migrateBlock = hasDb
    ? '\nCreate the database tables (runs `src/migrations/*` via `axil migrate`):\n\n```bash\nnpm run migrate\n```\n'
    : ''

  const migrationsSection = hasDb
    ? '## Migrations\n\n' +
      'Migrations live in `src/migrations/` and run with the `@axiljs/orm` MigrationRunner.\n' +
      'Connection settings come from `.env` (`DATABASE_URL`, `DATABASE_FILENAME`, optional `DB_DRIVER`).\n\n' +
      '```bash\n' +
      'npx axil migrate          # apply pending migrations\n' +
      'npx axil migrate status   # show applied / pending\n' +
      'npx axil migrate down     # roll back the last batch\n' +
      'npx axil g migration add_price_to_products\n' +
      '```\n\n'
    : ''

  const authNote = options.includeAuth
    ? '\nSet `JWT_SECRET` in `.env` to a securely generated random string (32+ characters).\n' : ''

  return `# ${name}

Built with [AxilJS](https://github.com/SyntaxilitY/AxilJS).

## Features

${f.map(x => `- ${x}`).join('\n')}

## Getting started

\`\`\`bash
npm install
cp .env.example .env
\`\`\`
${dbNote}${authNote}${migrateBlock}
\`\`\`bash
npm run dev
\`\`\`

**Windows PowerShell**

\`\`\`powershell
npm install
Copy-Item .env.example .env${hasDb ? '\nnpm run migrate' : ''}
npm run dev
\`\`\`

The server starts at <http://localhost:3000>.

## Available scripts

| Script            | Description                        |
| ----------------- | ---------------------------------- |
| \`npm run dev\`   | Start the development server       |
| \`npm run build\` | Compile TypeScript to \`dist/\`    |
| \`npm start\`     | Run the compiled application       |
| \`npm test\`      | Run the test suite                 |
${hasDb ? '| `npm run migrate` | Apply pending migrations (`axil migrate`) |\n' : ''}
${migrationsSection}## Generators

\`\`\`bash
npx axil generate module products     # controller + service (+ migration with a database)
npx axil g controller orders
npx axil g service billing
npx axil g entity product
npx axil g migration add_price_to_products
\`\`\`

Register a generated controller in \`src/main.ts\`, e.g.
\`new ProductsController().register(app)\`.

## Project structure

\`\`\`
src/
  config/              Application configuration
  db/                  Database connection
  migrations/          Schema migrations
  modules/
    users/
      controllers/     Route handlers
      services/        Business logic
  main.ts              Application entry point
\`\`\`

## Documentation

- <https://github.com/SyntaxilitY/AxilJS>
- <https://www.npmjs.com/org/axiljs>
`
}

function generateMainFile(name: string, options: ProjectOptions): string {
  const imp: string[] = [
    `import { Application, cors } from '@axiljs/core'`,
    `import { loadEnv, defineConfig } from '@axiljs/config'`
  ]
  if (options.includeAuth)         imp.push(`import { JWT } from '@axiljs/auth'`)
  if (options.includeWebsocket)    imp.push(`import { WSServer } from '@axiljs/websocket'`)
  if (options.includeQueue)        imp.push(`import { Queue, Scheduler } from '@axiljs/queue'`)
  if (options.database !== 'none') imp.push(`import { connectDB } from './db/connection.js'`)
  imp.push(`import { UsersController } from './modules/users/controllers/users.controller.js'`)

  const cfg = [
    `  PORT:     { type: 'number', default: 3000 }`,
    `  HOST:     { type: 'string', default: '127.0.0.1' }`,
    `  NODE_ENV: { type: 'string', default: 'development' }`
  ]
  if (options.includeAuth) {
    cfg.push(
      `  JWT_SECRET: {\n    type: 'string',\n` +
      `    default: 'change-this-secret-to-a-random-value-with-at-least-32-characters'\n  }`
    )
  }

  const b: string[] = []

  b.push(
    `loadEnv()`, ``,
    `const config = defineConfig({`, cfg.join(',\n'), `})`, ``,
    `const app = new Application({`,
    `  server: { port: config.PORT, host: config.HOST },`,
    `  env: config.NODE_ENV`,
    `})`, ``,
    `app.use(cors())`
  )

  if (options.includeAuth) b.push(``, `const jwt = new JWT(config.JWT_SECRET)`, `void jwt`)
  if (options.database !== 'none') b.push(``, `await connectDB()`)

  b.push(
    ``,
    `app.get('/health', (_req, res) => {`,
    `  res.json({ status: 'ok', service: '${name}', timestamp: new Date().toISOString() })`,
    `})`, ``,
    `new UsersController().register(app)`, ``,
    `await app.listen()`
  )

  if (options.includeWebsocket) {
    b.push(``,
      `const httpServer = app.getServer()`, ``,
      `if (httpServer) {`,
      `  const wss = new WSServer(httpServer, { path: '/ws' })`, ``,
      `  wss.on('connection', (client) => {`,
      `    client.sendJSON({ type: 'welcome', message: 'Connected to AxilJS' })`,
      `  })`,
      `}`)
  }

  if (options.includeQueue) {
    b.push(``,
      `const queue     = new Queue('default', { concurrency: 3 })`,
      `const scheduler = new Scheduler()`, ``,
      `queue.start()`, `scheduler.start()`)
  }

  b.push(``,
    `process.on('SIGINT', async () => { await app.close(); process.exit(0) })`,
    `process.on('SIGTERM', async () => { await app.close(); process.exit(0) })`)

  return `/**\n * ${name}\n * AxilJS application entry point.\n */\n\n` +
    imp.join('\n') + '\n\n' + b.join('\n') + '\n'
}

function generateAppConfig(): string {
  return `/**
 * Application configuration.
 *
 * Consumed by modules outside the main bootstrap (e.g. standalone scripts).
 * The authoritative runtime configuration is in src/main.ts via defineConfig().
 */

import type { AppConfig } from '@axiljs/core'

export const appConfig: AppConfig = {
  server: {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST        || '127.0.0.1'
  },
  env:     process.env.NODE_ENV || 'development',
  logging: true,
  prefix:  '/api'
}
`
}

// ---------------------------------------------------------------------------
// Resource templates (shared by `axil create` and `axil generate`)
// ---------------------------------------------------------------------------

export interface ResourceNames {
  // Directory + file base name, kebab-case ("users", "order-items")
  file:      string
  // Class prefix ("Users" → UsersController / UsersService)
  className: string
  // Record type name ("User")
  entity:    string
  // Route path without leading slash ("users")
  route:     string
  // SQL table name ("users", "order_items")
  table:     string
  // Human label for list messages ("Users")
  plural:    string
  // Human label for single-record messages ("User")
  singular:  string
}

export function toKebab(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

export function toPascal(input: string): string {
  return toKebab(input).split('-').filter(Boolean)
    .map(p => p[0].toUpperCase() + p.slice(1)).join('')
}

export function toSnake(input: string): string {
  return toKebab(input).replace(/-/g, '_')
}

function singularize(word: string): string {
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y'
  if (/(ss|us|is)$/.test(word)) return word
  if (/(ch|sh|x|z)es$/.test(word)) return word.slice(0, -2)
  if (/s$/.test(word)) return word.slice(0, -1)
  return word
}

function pluralize(word: string): string {
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + 'ies'
  if (/(s|ch|sh|x|z)$/.test(word)) return /(ss|ch|sh|x|z)$/.test(word) || !/s$/.test(word) ? word + 'es' : word
  return word + 's'
}

/** Derive file/class/route/table names from a user-supplied resource name. */
export function resourceNames(input: string): ResourceNames {
  const file = toKebab(input)
  if (!file) throw new Error(`Invalid name "${input}". Use letters, numbers and dashes.`)
  if (/^\d/.test(file)) throw new Error(`Invalid name "${input}". Names cannot start with a digit.`)

  const parts    = file.split('-')
  const last     = parts[parts.length - 1]
  const single   = [...parts.slice(0, -1), singularize(last)].join('-')
  const many     = [...parts.slice(0, -1), pluralize(singularize(last))].join('-')

  return {
    file,
    className: toPascal(file),
    entity:    toPascal(single),
    route:     many,
    table:     toSnake(many),
    plural:    toPascal(many),
    singular:  toPascal(single)
  }
}

const USERS: ResourceNames = resourceNames('users')
const USER_FIELDS = ['name', 'email']

export function generateResourceController(
  options: ProjectOptions,
  n: ResourceNames
): string {
  const ai = options.includeAuth ? `\nimport { JWT, authenticate } from '@axiljs/auth'` : ''
  const jf = options.includeAuth
    ? `\n  private readonly jwt = new JWT(\n` +
      `    process.env.JWT_SECRET ||\n` +
      `      'change-this-secret-to-a-random-value-with-at-least-32-characters'\n  )\n` : ''
  const lr = options.includeAuth
    ? `    app.get('/${n.route}', authenticate(this.jwt), this.list.bind(this) as any)`
    : `    app.get('/${n.route}', this.list.bind(this) as any)`
  const svc = `${n.className[0].toLowerCase()}${n.className.slice(1)}Service`

  return `/**
 * ${n.className} Controller.
 */

import { Application } from '@axiljs/core'
import type { axilRequest as Request, axilResponse as Response } from '@axiljs/core'
import { ${n.className}Service } from '../services/${n.file}.service.js'${ai}

export class ${n.className}Controller {
  private readonly ${svc} = new ${n.className}Service()
${jf}
  register(app: Application): void {
${lr}
    app.get('/${n.route}/:id',    this.getById.bind(this) as any)
    app.post('/${n.route}',       this.create.bind(this)  as any)
    app.put('/${n.route}/:id',    this.update.bind(this)  as any)
    app.delete('/${n.route}/:id', this.remove.bind(this)  as any)
  }

  async list(_req: Request, res: Response): Promise<void> {
    const items = await this.${svc}.findAll()
    res.success({ data: items, total: items.length }, '${n.plural} retrieved successfully')
  }

  async getById(req: Request, res: Response): Promise<void> {
    const item = await this.${svc}.findById(req.params.id)
    res.success({ data: item }, '${n.singular} retrieved successfully')
  }

  async create(req: Request, res: Response): Promise<void> {
    const item = await this.${svc}.create(req.body as any)
    res.created({ data: item }, '${n.singular} created successfully')
  }

  async update(req: Request, res: Response): Promise<void> {
    const item = await this.${svc}.update(req.params.id, req.body as any)
    res.success({ data: item }, '${n.singular} updated successfully')
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.${svc}.delete(req.params.id)
    res.noContent()
  }
}
`
}

export function generateResourceService(
  options: ProjectOptions,
  n: ResourceNames,
  fields: string[] = ['name']
): string {
  const E = n.entity
  const fieldTypes = fields.map(f => `${f}: string`).join('; ')

  if (options.database === 'none') {
    const sample = fields.map(f => `${f}: ${f === 'email' ? `'user@example.com'` : `'Example ${n.singular}'`}`).join(', ')
    const assign = fields.map(f => `${f}: data.${f} || ''`).join(', ')
    return `/**
 * ${n.className} Service.
 * In-memory implementation (no database configured).
 */

import { NotFoundError } from '@axiljs/core'

export interface ${E} {
  id: string; ${fieldTypes}; createdAt: string
}

export class ${n.className}Service {
  private items: ${E}[] = [
    { id: '1', ${sample}, createdAt: new Date().toISOString() }
  ]
  private nextId = 2

  async findAll(): Promise<${E}[]> { return this.items }

  async findById(id: string): Promise<${E}> {
    const item = this.items.find((x) => x.id === id)
    if (!item) throw new NotFoundError(\`${n.singular} \${id} not found.\`)
    return item
  }

  async create(data: Partial<${E}>): Promise<${E}> {
    const item: ${E} = {
      id: String(this.nextId++),
      ${assign},
      createdAt: new Date().toISOString()
    }
    this.items.push(item)
    return item
  }

  async update(id: string, data: Partial<${E}>): Promise<${E}> {
    const i = this.items.findIndex((x) => x.id === id)
    if (i === -1) throw new NotFoundError(\`${n.singular} \${id} not found.\`)
    const { id: _ignored, ...changes } = data
    this.items[i] = { ...this.items[i], ...changes }
    return this.items[i]
  }

  async delete(id: string): Promise<void> {
    const i = this.items.findIndex((x) => x.id === id)
    if (i === -1) throw new NotFoundError(\`${n.singular} \${id} not found.\`)
    this.items.splice(i, 1)
  }
}
`
  }

  // Placeholders: $1, $2, … for postgres; ? for sqlite/mysql
  const pg = options.database === 'postgres'
  const ph = (i: number): string => pg ? `$${i}` : '?'
  const cols      = fields.join(', ')
  const values    = fields.map((_, i) => ph(i + 1)).join(', ')
  const setList   = fields.map((f, i) => `${f} = COALESCE(${ph(i + 1)}, ${f})`).join(', ')
  const idPh      = ph(fields.length + 1)
  const createArgs = fields.map(f => `data.${f} ?? ''`).join(', ')
  const updateArgs = fields.map(f => `data.${f} ?? null`).join(', ')
  const mapFields  = fields.map(f => `${f}: String(row.${f} ?? '')`).join(',\n    ')

  // MySQL has no RETURNING: insert, then read the row back by insertId;
  // update/delete check existence / affectedRows instead.
  const writeMethods = options.database === 'mysql'
    ? `  async create(data: Partial<${E}>): Promise<${E}> {
    const r = await this.driver.query(
      'INSERT INTO ${n.table} (${cols}) VALUES (${values})',
      [${createArgs}]
    )
    return this.findById(String(r.insertId))
  }

  async update(id: string, data: Partial<${E}>): Promise<${E}> {
    await this.findById(id)
    await this.driver.query(
      'UPDATE ${n.table} SET ${setList} WHERE id = ${idPh}',
      [${updateArgs}, id]
    )
    return this.findById(id)
  }

  async delete(id: string): Promise<void> {
    const r = await this.driver.query('DELETE FROM ${n.table} WHERE id = ?', [id])
    if (r.affectedRows === 0) throw new NotFoundError(\`${n.singular} \${id} not found.\`)
  }`
    : `  async create(data: Partial<${E}>): Promise<${E}> {
    const r = await this.driver.query(
      'INSERT INTO ${n.table} (${cols}) VALUES (${values}) RETURNING *',
      [${createArgs}]
    )
    return to${E}(r.rows[0])
  }

  async update(id: string, data: Partial<${E}>): Promise<${E}> {
    const r = await this.driver.query(
      'UPDATE ${n.table} SET ${setList} WHERE id = ${idPh} RETURNING *',
      [${updateArgs}, id]
    )
    if (r.rows.length === 0) throw new NotFoundError(\`${n.singular} \${id} not found.\`)
    return to${E}(r.rows[0])
  }

  async delete(id: string): Promise<void> {
    const r = await this.driver.query('DELETE FROM ${n.table} WHERE id = ${ph(1)} RETURNING id', [id])
    if (r.rows.length === 0) throw new NotFoundError(\`${n.singular} \${id} not found.\`)
  }`

  return `/**
 * ${n.className} Service.
 * Database-backed implementation (${options.database}).
 */

import { NotFoundError } from '@axiljs/core'
import { getDB } from '../../../db/connection.js'

export interface ${E} {
  id: string; ${fieldTypes}; createdAt: string
}

function to${E}(row: Record<string, unknown>): ${E} {
  return {
    id: String(row.id),
    ${mapFields},
    createdAt: String(row.createdAt ?? row.created_at ?? '')
  }
}

export class ${n.className}Service {
  private get driver() { return getDB().getDriver() }

  async findAll(): Promise<${E}[]> {
    const r = await this.driver.query('SELECT * FROM ${n.table} ORDER BY id DESC')
    return r.rows.map(to${E})
  }

  async findById(id: string): Promise<${E}> {
    const r = await this.driver.query('SELECT * FROM ${n.table} WHERE id = ${ph(1)}', [id])
    if (r.rows.length === 0) throw new NotFoundError(\`${n.singular} \${id} not found.\`)
    return to${E}(r.rows[0])
  }

${writeMethods}
}
`
}

export function generateEntity(n: ResourceNames, fields: string[] = ['name']): string {
  const cols = fields.map(f => `  @Column({ type: 'string', length: 255 })\n  ${f}!: string\n`).join('\n')
  return `/**
 * ${n.entity} entity (table: ${n.table}).
 * Requires "experimentalDecorators": true in tsconfig.json.
 */

import { BaseModel, Entity, PrimaryKey, Column, CreatedAt } from '@axiljs/orm'

@Entity('${n.table}')
export class ${n.entity} extends BaseModel {
  @PrimaryKey()
  id!: number

${cols}
  @CreatedAt()
  createdAt!: Date
}
`
}

function idColumn(database: Database): string {
  if (database === 'sqlite') return 'INTEGER PRIMARY KEY AUTOINCREMENT'
  if (database === 'mysql')  return 'INT AUTO_INCREMENT PRIMARY KEY'
  return 'SERIAL PRIMARY KEY'
}

export function generateCreateTableMigration(
  database: Database,
  migrationName: string,
  table: string,
  fields: string[] = ['name'],
  uniqueFields: string[] = []
): string {
  const width = Math.max(10, ...fields.map(f => f.length))
  const colLines = [
    `        ${'id'.padEnd(width)} ${idColumn(database)}`,
    ...fields.map(f =>
      `        ${f.padEnd(width)} VARCHAR(255) NOT NULL${uniqueFields.includes(f) ? ' UNIQUE' : ''}`
    ),
    `        ${'created_at'.padEnd(width)} TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP`
  ]

  return `/**
 * Migration: ${migrationName}
 */

import type { Migration } from '@axiljs/orm'

const migration: Migration = {
  async up(db) {
    await db.query(\`
      CREATE TABLE IF NOT EXISTS ${table} (
${colLines.join(',\n')}
      )
    \`)
  },

  async down(db) {
    await db.query('DROP TABLE IF EXISTS ${table}')
  }
}

export default migration
`
}

export function generateEmptyMigration(migrationName: string): string {
  return `/**
 * Migration: ${migrationName}
 */

import type { Migration } from '@axiljs/orm'

const migration: Migration = {
  async up(db) {
    // await db.query('ALTER TABLE ... ADD COLUMN ...')
    void db
  },

  async down(db) {
    // Reverse whatever up() did
    void db
  }
}

export default migration
`
}

function generateUsersController(options: ProjectOptions): string {
  return generateResourceController(options, USERS)
}

function generateUsersService(options: ProjectOptions): string {
  return generateResourceService(options, USERS, USER_FIELDS)
}

function generateUsersMigration(database: Database): string {
  return generateCreateTableMigration(database, '001_create_users', 'users', USER_FIELDS, ['email'])
}


function generateDbConnection(database: Database): string {
  if (database === 'sqlite') {
    return `/**
 * Database connection - SQLite.
 */

import { ConnectionManager, createConnection } from '@axiljs/orm'

let db: ConnectionManager | null = null

export async function connectDB(): Promise<ConnectionManager> {
  if (db) return db
  db = await createConnection({
    driver: 'sqlite',
    filename: process.env.DATABASE_FILENAME || './dev.db',
    logging: process.env.NODE_ENV === 'development'
  })
  return db
}

export function getDB(): ConnectionManager {
  if (!db) throw new Error('Database is not connected. Call connectDB() first.')
  return db
}
`
  }

  const driver = database === 'postgres' ? 'postgres' : 'mysql'
  const example = database === 'postgres'
    ? 'postgres://username:password@localhost:5432/mydb'
    : 'mysql://username:password@localhost:3306/mydb'

  return `/**
 * Database connection - ${driver}.
 */

import { ConnectionManager, createConnection } from '@axiljs/orm'

let db: ConnectionManager | null = null

export async function connectDB(): Promise<ConnectionManager> {
  if (db) return db

  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set.\\n' +
      '  1. Copy .env.example to .env\\n' +
      '  2. Set DATABASE_URL to your ${driver} connection string.\\n' +
      '     Example: ${example}'
    )
  }

  let parsed: URL
  try { parsed = new URL(url) } catch {
    throw new Error(
      'DATABASE_URL is not a valid URL.\\n' +
      '  Expected: ${example}\\n' +
      '  Received: ' + url
    )
  }

  if (parsed.username === 'username' && parsed.password === 'password') {
    throw new Error(
      'DATABASE_URL still contains placeholder credentials.\\n' +
      '  Open .env and replace the username and password with real values.\\n' +
      '  Current value: ' + url
    )
  }

  db = await createConnection({
    driver: '${driver}',
    url,
    logging: process.env.NODE_ENV === 'development'
  })

  return db
}

export function getDB(): ConnectionManager {
  if (!db) throw new Error('Database is not connected. Call connectDB() first.')
  return db
}
`
}
