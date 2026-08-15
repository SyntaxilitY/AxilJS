"use strict";
/**
 * AxilJS CLI
 * create command
 *
 * Creates a production-ready AxilJS application, installs dependencies,
 * and prints the exact commands required to start development.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProject = createProject;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_readline_1 = require("node:readline");
const node_child_process_1 = require("node:child_process");
const node_fs_2 = __importDefault(require("node:fs"));
const node_path_2 = __importDefault(require("node:path"));
// ---------------------------------------------------------------------------
// ANSI primitives
// ---------------------------------------------------------------------------
const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    gray: '\x1b[90m',
    bgCyan: '\x1b[46m',
    bgBlue: '\x1b[44m',
    black: '\x1b[30m'
};
function s(value, ...codes) {
    return `${codes.join('')}${value}${ANSI.reset}`;
}
function visibleLength(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}
function blank() {
    console.log('');
}
// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
const COL_WIDTH = 64;
function line(char = '─') {
    console.log(s(char.repeat(COL_WIDTH), ANSI.gray));
}
function thinLine() {
    console.log(s('  ' + '·'.repeat(COL_WIDTH - 4), ANSI.gray));
}
function labelValue(label, value, indent = 2) {
    const lbl = s(label.padEnd(14), ANSI.gray);
    console.log(' '.repeat(indent) + lbl + value);
}
function bullet(text, indent = 4) {
    console.log(' '.repeat(indent) + s('-', ANSI.gray) + ' ' + text);
}
function numberedItem(n, command, hint, indent = 4) {
    const num = s(String(n).padStart(2) + '.', ANSI.gray);
    const cmd = s(command, ANSI.white + ANSI.bold);
    console.log(' '.repeat(indent) + num + ' ' + cmd);
    if (hint) {
        console.log(' '.repeat(indent) +
            '    ' +
            s(hint, ANSI.yellow));
    }
}
// ---------------------------------------------------------------------------
// Step indicators
// ---------------------------------------------------------------------------
function stepStart(n, total, msg) {
    const tag = s(` ${n}/${total} `, ANSI.bgCyan + ANSI.black + ANSI.bold);
    console.log(`  ${tag}  ${msg}`);
}
function stepDone(msg) {
    console.log(`         ${s('done', ANSI.green + ANSI.bold)}  ${s(msg, ANSI.gray)}`);
}
function stepFail(msg) {
    console.error(`         ${s('fail', ANSI.red + ANSI.bold)}  ${msg}`);
}
function stepWarn(msg) {
    console.log(`         ${s('warn', ANSI.yellow + ANSI.bold)}  ${s(msg, ANSI.gray)}`);
}
// ---------------------------------------------------------------------------
// ASCII banner
// ---------------------------------------------------------------------------
function c(text, ...codes) {
    return `${codes.join('')}${text}${ANSI.reset}`;
}
const H_LINE_DIM = '─'.repeat(COL_WIDTH);
function printBanner(name, location, version) {
    console.log('');
    console.log(c('  █████╗ ██╗  ██╗██╗██╗          ██╗███████╗', ANSI.cyan + ANSI.bold));
    console.log(c(' ██╔══██╗╚██╗██╔╝██║██║          ██║██╔════╝', ANSI.cyan + ANSI.bold));
    console.log(c(' ███████║ ╚███╔╝ ██║██║          ██║███████╗', ANSI.cyan + ANSI.bold));
    console.log(c(' ██╔══██║ ██╔██╗ ██║██║     ██╗  ██║╚════██║', ANSI.cyan + ANSI.bold));
    console.log(c(' ██║  ██║██╔╝ ██╗██║███████╗╚█████╔╝███████║', ANSI.cyan + ANSI.bold));
    console.log(c(' ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝ ╚════╝ ╚══════╝', ANSI.cyan + ANSI.bold));
    console.log('');
    console.log(`  ${c('AxilJS CLI', ANSI.bold)} ${c(`v${version}`, ANSI.dim)}`);
    console.log(`  Creating app ${c(name, ANSI.bold + ANSI.white)} in ${c(location, ANSI.dim)}`);
    console.log('');
    console.log(H_LINE_DIM);
}
// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
function prompt(question, fallback) {
    const rl = (0, node_readline_1.createInterface)({ input: process.stdin, output: process.stdout });
    return new Promise((res) => {
        const q = `  ${s('?', ANSI.cyan + ANSI.bold)}  ${question} ${s(`(${fallback})`, ANSI.gray)} `;
        rl.question(q, (raw) => {
            rl.close();
            res(raw.trim() || fallback);
        });
    });
}
function confirmPrompt(question, fallback = false) {
    const hint = fallback
        ? s('Y', ANSI.green + ANSI.bold) + s('/n', ANSI.gray)
        : s('y', ANSI.gray) + s('/N', ANSI.white + ANSI.bold);
    const rl = (0, node_readline_1.createInterface)({ input: process.stdin, output: process.stdout });
    return new Promise((res) => {
        const q = `  ${s('?', ANSI.cyan + ANSI.bold)}  ${question} ${hint} `;
        rl.question(q, (raw) => {
            rl.close();
            const a = raw.trim().toLowerCase();
            if (['y', 'yes'].includes(a))
                return res(true);
            if (['n', 'no'].includes(a))
                return res(false);
            res(fallback);
        });
    });
}
async function databasePrompt() {
    blank();
    console.log(`  ${s('?', ANSI.cyan + ANSI.bold)}  ${s('Database driver', ANSI.white + ANSI.bold)}`);
    blank();
    const items = [
        { n: '1', name: 'none', desc: 'No database' },
        { n: '2', name: 'sqlite', desc: 'Embedded file database' },
        { n: '3', name: 'postgres', desc: 'PostgreSQL' },
        { n: '4', name: 'mysql', desc: 'MySQL / MariaDB' }
    ];
    for (const it of items) {
        const num = s(` ${it.n} `, ANSI.bgCyan + ANSI.black + ANSI.bold);
        const label = s(it.name.padEnd(12), ANSI.white + ANSI.bold);
        const desc = s(it.desc, ANSI.gray);
        console.log(`      ${num} ${label} ${desc}`);
    }
    blank();
    const map = {
        '1': 'none', '2': 'sqlite', '3': 'postgres', '4': 'mysql'
    };
    const raw = await prompt('Select', '1');
    if (map[raw])
        return map[raw];
    const norm = raw.toLowerCase();
    if (['none', 'sqlite', 'postgres', 'mysql'].includes(norm)) {
        return norm;
    }
    stepWarn('Invalid selection, using none.');
    return 'none';
}
// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateProjectName(name) {
    const n = name.trim();
    if (!n)
        throw new Error('Project name is required.');
    if (n === '.' || n === '..' || n.includes('/') || n.includes('\\'))
        throw new Error('Project name must be a single directory name, not a path.');
    if (!/^[a-zA-Z0-9._-]+$/.test(n))
        throw new Error('Only letters, numbers, dots, hyphens, and underscores are allowed.');
    if (n.startsWith('.') || n.startsWith('-'))
        throw new Error('Cannot start with "." or "-".');
}
// ---------------------------------------------------------------------------
// File / process helpers
// ---------------------------------------------------------------------------
function writeFile(dir, rel, content) {
    const fp = (0, node_path_1.join)(dir, rel);
    (0, node_fs_1.mkdirSync)((0, node_path_1.resolve)(fp, '..'), { recursive: true });
    (0, node_fs_1.writeFileSync)(fp, content, 'utf8');
}
function run(cmd, args, cwd) {
    const r = (0, node_child_process_1.spawnSync)(cmd, args, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });
    if (r.error)
        throw r.error;
    if (r.status !== 0)
        throw new Error(`${cmd} ${args.join(' ')} exited with code ${r.status ?? 1}.`);
}
// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
function getAxilJSVersion() {
    const p = node_path_2.default.resolve(__dirname, '../../package.json');
    if (!node_fs_2.default.existsSync(p))
        throw new Error(`Cannot find CLI package.json at: ${p}`);
    const pkg = JSON.parse(node_fs_2.default.readFileSync(p, 'utf-8'));
    if (!pkg.version)
        throw new Error(`CLI package.json has no version field: ${p}`);
    return pkg.version;
}
const axilVersion = getAxilJSVersion();
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function createProject(name) {
    validateProjectName(name);
    const projectDir = (0, node_path_1.join)(process.cwd(), name);
    if ((0, node_fs_1.existsSync)(projectDir)) {
        throw new Error(`Directory "${name}" already exists.`);
    }
    // ── Banner ───────────────────────────────────────────────────────────
    printBanner(name, projectDir, axilVersion);
    // ── Features ─────────────────────────────────────────────────────────
    blank();
    console.log(s('  CONFIGURE', ANSI.gray + ANSI.bold));
    thinLine();
    const database = await databasePrompt();
    blank();
    const includeAuth = await confirmPrompt('Authentication (JWT + RBAC)?', true);
    const includeAI = await confirmPrompt('AI platform?', false);
    const includeWebsocket = await confirmPrompt('WebSocket support?', false);
    const includeQueue = await confirmPrompt('Queue and Scheduler?', false);
    const options = {
        database,
        includeAuth,
        includeAI,
        includeWebsocket,
        includeQueue
    };
    // ── Summary ──────────────────────────────────────────────────────────
    blank();
    console.log(s('  SUMMARY', ANSI.gray + ANSI.bold));
    thinLine();
    blank();
    const on = s('on', ANSI.green + ANSI.bold);
    const off = s('-', ANSI.gray);
    const dbVal = database === 'none'
        ? s('none', ANSI.gray)
        : s(database, ANSI.cyan + ANSI.bold);
    labelValue('Database', dbVal, 4);
    labelValue('Auth', includeAuth ? on : off, 4);
    labelValue('AI', includeAI ? on : off, 4);
    labelValue('WebSocket', includeWebsocket ? on : off, 4);
    labelValue('Queue', includeQueue ? on : off, 4);
    blank();
    thinLine();
    blank();
    const ok = await confirmPrompt('Create project?', true);
    if (!ok) {
        blank();
        stepWarn('Cancelled.');
        blank();
        return;
    }
    // ── Scaffold ─────────────────────────────────────────────────────────
    blank();
    console.log(s('  CREATING', ANSI.gray + ANSI.bold));
    line();
    blank();
    const total = 4;
    const dirs = [
        'src',
        'src/config',
        'src/modules',
        'src/modules/users',
        'src/modules/users/controllers',
        'src/modules/users/services'
    ];
    if (database !== 'none')
        dirs.push('src/db', 'src/migrations');
    try {
        stepStart(1, total, 'Project structure');
        for (const d of dirs)
            (0, node_fs_1.mkdirSync)((0, node_path_1.join)(projectDir, d), { recursive: true });
        stepDone('Directories created');
        blank();
        stepStart(2, total, 'Application files');
        writeFile(projectDir, 'package.json', generatePackageJson(name, options));
        writeFile(projectDir, 'tsconfig.json', generateTsConfig());
        writeFile(projectDir, '.gitignore', generateGitignore());
        writeFile(projectDir, '.env.example', generateEnvExample(options));
        writeFile(projectDir, 'README.md', generateReadme(name, options));
        writeFile(projectDir, 'src/main.ts', generateMainFile(name, options));
        writeFile(projectDir, 'src/config/app.config.ts', generateAppConfig());
        writeFile(projectDir, 'src/modules/users/controllers/users.controller.ts', generateUsersController(options));
        writeFile(projectDir, 'src/modules/users/services/users.service.ts', generateUsersService(options));
        if (database !== 'none') {
            writeFile(projectDir, 'src/db/connection.ts', generateDbConnection(database));
            writeFile(projectDir, 'src/migrations/001_create_users.ts', generateUsersMigration(database));
        }
        stepDone('Files written');
        blank();
        stepStart(3, total, 'Dependencies');
        blank();
        run('npm', ['install'], projectDir);
        blank();
        stepDone('Installed');
        blank();
        stepStart(4, total, 'Finalising');
        stepDone('Ready');
    }
    catch (err) {
        blank();
        stepFail(err instanceof Error ? err.message : String(err));
        blank();
        stepWarn(`Left at: ${projectDir}`);
        stepWarn('Remove it manually before retrying.');
        blank();
        throw err;
    }
    // ── Next steps ───────────────────────────────────────────────────────
    blank();
    line();
    blank();
    console.log(s('  NEXT STEPS', ANSI.gray + ANSI.bold));
    thinLine();
    blank();
    const isWin = process.platform === 'win32';
    const copyCmd = isWin ? 'Copy-Item .env.example .env' : 'cp .env.example .env';
    let step = 1;
    numberedItem(step++, `cd ${name}`);
    numberedItem(step++, copyCmd);
    if (database === 'postgres') {
        numberedItem(step++, 'Edit .env', 'Set DATABASE_URL to your PostgreSQL connection string');
    }
    else if (database === 'mysql') {
        numberedItem(step++, 'Edit .env', 'Set DATABASE_URL to your MySQL connection string');
    }
    else if (database === 'sqlite') {
        numberedItem(step++, 'Review .env', 'DATABASE_FILENAME defaults to ./dev.db');
    }
    if (options.includeAuth) {
        numberedItem(step++, 'Edit .env', 'Set JWT_SECRET to a random string (32+ characters)');
    }
    numberedItem(step++, 'npm run dev');
    // ── Links ────────────────────────────────────────────────────────────
    blank();
    line();
    blank();
    labelValue('Local', s('http://localhost:3000', ANSI.cyan + ANSI.underline));
    labelValue('Docs', s('https://github.com/SyntaxilitY/AxilJS', ANSI.gray + ANSI.underline));
    labelValue('npm', s('https://www.npmjs.com/org/axiljs', ANSI.gray + ANSI.underline));
    blank();
    thinLine();
    blank();
    console.log('  ' +
        s('Run ', ANSI.gray) +
        s('npm run dev', ANSI.cyan + ANSI.bold) +
        s(' inside ', ANSI.gray) +
        s(name, ANSI.white + ANSI.bold) +
        s(' to start developing.', ANSI.gray));
    blank();
    line();
    blank();
}
// ---------------------------------------------------------------------------
// Generators (unchanged logic, clean output)
// ---------------------------------------------------------------------------
function generatePackageJson(name, options) {
    const deps = {
        '@axiljs/core': `^${axilVersion}`,
        '@axiljs/config': `^${axilVersion}`
    };
    if (options.database !== 'none') {
        deps['@axiljs/orm'] = `^${axilVersion}`;
        if (options.database === 'postgres')
            deps['pg'] = '^8.23.0';
        if (options.database === 'mysql')
            deps['mysql2'] = '^3.23.3';
        if (options.database === 'sqlite')
            deps['better-sqlite3'] = '^13.0.3';
    }
    if (options.includeAuth)
        deps['@axiljs/auth'] = `^${axilVersion}`;
    if (options.includeAI)
        deps['@axiljs/ai'] = `^${axilVersion}`;
    if (options.includeWebsocket)
        deps['@axiljs/websocket'] = `^${axilVersion}`;
    if (options.includeQueue)
        deps['@axiljs/queue'] = `^${axilVersion}`;
    return JSON.stringify({
        name,
        version: '1.0.0',
        private: true,
        type: 'module',
        description: `${name} - AxilJS application`,
        scripts: {
            dev: 'axil run',
            build: 'tsc',
            start: 'node dist/main.js',
            test: 'axil test'
        },
        dependencies: deps,
        devDependencies: {
            '@axiljs/cli': `^${axilVersion}`,
            '@types/node': '^26.2.0',
            typescript: '^7.0.2'
        }
    }, null, 2) + '\n';
}
function generateTsConfig() {
    return JSON.stringify({
        compilerOptions: {
            target: 'ES2023',
            module: 'Node16',
            moduleResolution: 'Node16',
            lib: ['ES2023'],
            types: ['node'],
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            isolatedModules: true,
            rootDir: './src',
            outDir: './dist',
            incremental: true,
            tsBuildInfoFile: './dist/.tsbuildinfo',
            experimentalDecorators: true,
            emitDecoratorMetadata: false,
            declaration: true,
            declarationMap: true,
            sourceMap: true
        },
        include: ['src/**/*'],
        exclude: ['dist', 'node_modules']
    }, null, 2) + '\n';
}
function generateGitignore() {
    return [
        'node_modules/', 'dist/', '.env', '.env.local', '*.log', '.tsbuildinfo', ''
    ].join('\n');
}
function generateEnvExample(options) {
    const l = [
        '# Server', 'PORT=3000', 'HOST=127.0.0.1', 'NODE_ENV=development', ''
    ];
    if (options.includeAuth) {
        l.push('# Authentication', '# Replace with a securely generated random string (32+ characters).', 'JWT_SECRET=change-this-secret-to-a-random-value-with-at-least-32-characters', '');
    }
    if (options.database === 'postgres') {
        l.push('# PostgreSQL', '# Format: postgres://username:password@host:port/database', 'DATABASE_URL=postgres://username:password@localhost:5432/mydb', '');
    }
    else if (options.database === 'mysql') {
        l.push('# MySQL / MariaDB', '# Format: mysql://username:password@host:port/database', 'DATABASE_URL=mysql://username:password@localhost:3306/mydb', '');
    }
    else if (options.database === 'sqlite') {
        l.push('# SQLite', '# Path to the database file. Created automatically on first run.', 'DATABASE_FILENAME=./dev.db', '');
    }
    if (options.includeAI) {
        l.push('# AI Platform', '# Set AI_PROVIDER to: ollama | openai | anthropic | google', 'AI_PROVIDER=ollama', 'OLLAMA_MODEL=llama3.2', 'OLLAMA_URL=http://127.0.0.1:11434', 'OPENAI_API_KEY=', 'ANTHROPIC_API_KEY=', 'GOOGLE_API_KEY=', '');
    }
    return l.join('\n');
}
function generateReadme(name, options) {
    const f = ['HTTP server', 'Routing', 'Middleware', 'Built-in response handling'];
    if (options.database !== 'none')
        f.push(`ORM (${options.database})`, 'Database migrations');
    if (options.includeAuth)
        f.push('JWT authentication', 'Role-based access control (RBAC)');
    if (options.includeAI)
        f.push('AI platform');
    if (options.includeWebsocket)
        f.push('WebSockets');
    if (options.includeQueue)
        f.push('Queue and Scheduler');
    const dbNote = options.database === 'postgres'
        ? '\nUpdate `DATABASE_URL` in `.env` with your PostgreSQL credentials before starting.\n'
        : options.database === 'mysql'
            ? '\nUpdate `DATABASE_URL` in `.env` with your MySQL credentials before starting.\n' : '';
    const authNote = options.includeAuth
        ? '\nSet `JWT_SECRET` in `.env` to a securely generated random string (32+ characters).\n' : '';
    return `# ${name}

Built with [AxilJS](https://github.com/SyntaxilitY/AxilJS).

## Features

${f.map(x => `- ${x}`).join('\n')}

## Getting started

\`\`\`bash
npm install
cp .env.example .env
\`\`\`
${dbNote}${authNote}
\`\`\`bash
npm run dev
\`\`\`

**Windows PowerShell**

\`\`\`powershell
npm install
Copy-Item .env.example .env
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
`;
}
function generateMainFile(name, options) {
    const imp = [
        `import { Application, cors } from '@axiljs/core'`,
        `import { loadEnv, defineConfig } from '@axiljs/config'`
    ];
    if (options.includeAuth)
        imp.push(`import { JWT } from '@axiljs/auth'`);
    if (options.includeWebsocket)
        imp.push(`import { WSServer } from '@axiljs/websocket'`);
    if (options.includeQueue)
        imp.push(`import { Queue, Scheduler } from '@axiljs/queue'`);
    if (options.database !== 'none')
        imp.push(`import { connectDB } from './db/connection.js'`);
    const cfg = [
        `  PORT:     { type: 'number', default: 3000 }`,
        `  HOST:     { type: 'string', default: '127.0.0.1' }`,
        `  NODE_ENV: { type: 'string', default: 'development' }`
    ];
    if (options.includeAuth) {
        cfg.push(`  JWT_SECRET: {\n    type: 'string',\n` +
            `    default: 'change-this-secret-to-a-random-value-with-at-least-32-characters'\n  }`);
    }
    const b = [];
    b.push(`loadEnv()`, ``, `const config = defineConfig({`, cfg.join(',\n'), `})`, ``, `const app = new Application({`, `  server: { port: config.PORT, host: config.HOST },`, `  env: config.NODE_ENV`, `})`, ``, `app.use(cors())`);
    if (options.includeAuth)
        b.push(``, `const jwt = new JWT(config.JWT_SECRET)`, `void jwt`);
    if (options.database !== 'none')
        b.push(``, `await connectDB()`);
    b.push(``, `app.get('/health', (_req, res) => {`, `  res.json({ status: 'ok', service: '${name}', timestamp: new Date().toISOString() })`, `})`, ``, `await app.listen()`);
    if (options.includeWebsocket) {
        b.push(``, `const httpServer = app.getServer()`, ``, `if (httpServer) {`, `  const wss = new WSServer(httpServer, { path: '/ws' })`, ``, `  wss.on('connection', (client) => {`, `    client.sendJSON({ type: 'welcome', message: 'Connected to AxilJS' })`, `  })`, `}`);
    }
    if (options.includeQueue) {
        b.push(``, `const queue     = new Queue('default', { concurrency: 3 })`, `const scheduler = new Scheduler()`, ``, `queue.start()`, `scheduler.start()`);
    }
    b.push(``, `process.on('SIGINT', async () => { await app.close(); process.exit(0) })`, `process.on('SIGTERM', async () => { await app.close(); process.exit(0) })`);
    return `/**\n * ${name}\n * AxilJS application entry point.\n */\n\n` +
        imp.join('\n') + '\n\n' + b.join('\n') + '\n';
}
function generateAppConfig() {
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
`;
}
function generateUsersController(options) {
    const ai = options.includeAuth ? `\nimport { JWT, authenticate } from '@axiljs/auth'` : '';
    const jf = options.includeAuth
        ? `\n  private readonly jwt = new JWT(\n` +
            `    process.env.JWT_SECRET ||\n` +
            `      'change-this-secret-to-a-random-value-with-at-least-32-characters'\n  )\n` : '';
    const lr = options.includeAuth
        ? `    app.get('/users', authenticate(this.jwt), this.list.bind(this) as any)`
        : `    app.get('/users', this.list.bind(this) as any)`;
    return `/**
 * Users Controller.
 */

import { Application } from '@axiljs/core'
import type { axilRequest as Request, axilResponse as Response } from '@axiljs/core'
import { UsersService } from '../services/users.service.js'${ai}

export class UsersController {
  private readonly usersService = new UsersService()
${jf}
  register(app: Application): void {
${lr}
    app.get('/users/:id',    this.getById.bind(this) as any)
    app.post('/users',       this.create.bind(this)  as any)
    app.put('/users/:id',    this.update.bind(this)  as any)
    app.delete('/users/:id', this.remove.bind(this)  as any)
  }

  async list(_req: Request, res: Response): Promise<void> {
    const users = await this.usersService.findAll()
    res.success({ data: users, total: users.length }, 'Users retrieved successfully')
  }

  async getById(req: Request, res: Response): Promise<void> {
    const user = await this.usersService.findById(req.params.id)
    res.success({ data: user }, 'User retrieved successfully')
  }

  async create(req: Request, res: Response): Promise<void> {
    const user = await this.usersService.create(req.body as any)
    res.created({ data: user }, 'User created successfully')
  }

  async update(req: Request, res: Response): Promise<void> {
    const user = await this.usersService.update(req.params.id, req.body as any)
    res.success({ data: user }, 'User updated successfully')
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.usersService.delete(req.params.id)
    res.noContent()
  }
}
`;
}
function generateUsersService(options) {
    if (options.database === 'none') {
        return `/**
 * Users Service.
 * In-memory implementation (no database configured).
 */

import { NotFoundError } from '@axiljs/core'

export interface User {
  id: string; name: string; email: string; createdAt: string
}

export class UsersService {
  private users: User[] = [
    { id: '1', name: 'Example User', email: 'user@example.com', createdAt: new Date().toISOString() }
  ]

  async findAll(): Promise<User[]> { return this.users }

  async findById(id: string): Promise<User> {
    const u = this.users.find((x) => x.id === id)
    if (!u) throw new NotFoundError(\`User \${id} not found.\`)
    return u
  }

  async create(data: Partial<User>): Promise<User> {
    const u: User = {
      id: String(this.users.length + 1),
      name: data.name || '', email: data.email || '',
      createdAt: new Date().toISOString()
    }
    this.users.push(u)
    return u
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const i = this.users.findIndex((x) => x.id === id)
    if (i === -1) throw new NotFoundError(\`User \${id} not found.\`)
    this.users[i] = { ...this.users[i], ...data }
    return this.users[i]
  }

  async delete(id: string): Promise<void> {
    const i = this.users.findIndex((x) => x.id === id)
    if (i === -1) throw new NotFoundError(\`User \${id} not found.\`)
    this.users.splice(i, 1)
  }
}
`;
    }
    const p = options.database === 'postgres' ? '$1' : '?';
    return `/**
 * Users Service.
 * Database-backed implementation.
 */

import { NotFoundError } from '@axiljs/core'
import { getDB } from '../../../db/connection.js'

export interface User {
  id: string; name: string; email: string; createdAt: string
}

function toUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id), name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    createdAt: String(row.createdAt ?? row.created_at ?? '')
  }
}

export class UsersService {
  private get driver() { return getDB().getDriver() }

  async findAll(): Promise<User[]> {
    const r = await this.driver.query('SELECT * FROM users ORDER BY id DESC')
    return r.rows.map(toUser)
  }

  async findById(id: string): Promise<User> {
    const r = await this.driver.query('SELECT * FROM users WHERE id = ${p}', [id])
    if (r.rows.length === 0) throw new NotFoundError(\`User \${id} not found.\`)
    return toUser(r.rows[0])
  }

  async create(data: Partial<User>): Promise<User> {
    const r = await this.driver.query(
      'INSERT INTO users (name, email) VALUES (${p}, ${p}) RETURNING *',
      [data.name || '', data.email || '']
    )
    return toUser(r.rows[0])
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const r = await this.driver.query(
      'UPDATE users SET name = COALESCE(${p}, name), email = COALESCE(${p}, email) WHERE id = ${p} RETURNING *',
      [data.name, data.email, id]
    )
    if (r.rows.length === 0) throw new NotFoundError(\`User \${id} not found.\`)
    return toUser(r.rows[0])
  }

  async delete(id: string): Promise<void> {
    const r = await this.driver.query('DELETE FROM users WHERE id = ${p} RETURNING id', [id])
    if (r.rows.length === 0) throw new NotFoundError(\`User \${id} not found.\`)
  }
}
`.replaceAll('${p}', p);
}
function generateDbConnection(database) {
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
`;
    }
    const driver = database === 'postgres' ? 'postgres' : 'mysql';
    const example = database === 'postgres'
        ? 'postgres://username:password@localhost:5432/mydb'
        : 'mysql://username:password@localhost:3306/mydb';
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
`;
}
function generateUsersMigration(database) {
    const idType = database === 'sqlite'
        ? 'INTEGER PRIMARY KEY AUTOINCREMENT'
        : 'SERIAL PRIMARY KEY';
    return `/**
 * Migration: 001_create_users
 */

import { Migration } from '@axiljs/orm'

const migration: Migration = {
  async up(db) {
    await db.query(\`
      CREATE TABLE IF NOT EXISTS users (
        id         ${idType},
        name       VARCHAR(255) NOT NULL,
        email      VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    \`)
  },

  async down(db) {
    await db.query('DROP TABLE IF EXISTS users')
  }
}

export default migration
`;
}
//# sourceMappingURL=create.js.map