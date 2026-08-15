"use strict";
/**
 * axil create <name>
 * Scaffolds a new AxilJS project with standard directory structure.
 * Interactive prompts ask for database and optional features.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProject = createProject;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_readline_1 = require("node:readline");
// ─── Interactive Prompt ───────────────────────────────────────────────────────
function askQuestion(question, defaultValue = '') {
    const rl = (0, node_readline_1.createInterface)({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        const prompt = defaultValue
            ? `${question} (${defaultValue}): `
            : `${question}: `;
        rl.question(prompt, answer => {
            rl.close();
            resolve(answer.trim() || defaultValue);
        });
    });
}
// ─── Main Function ────────────────────────────────────────────────────────────
async function createProject(name) {
    console.log(`\n\x1b[36m[AxilJS]\x1b[0m Creating project: \x1b[1m${name}\x1b[0m\n`);
    const projectDir = (0, node_path_1.join)(process.cwd(), name);
    if ((0, node_fs_1.existsSync)(projectDir)) {
        console.error(`\x1b[31mError:\x1b[0m Directory '${name}' already exists.`);
        process.exit(1);
    }
    // ── Ask questions ───────────────────────────────────────────────────────────
    console.log('  \x1b[36m[AxilJS]\x1b[0m Project Configuration\n');
    const dbAnswer = await askQuestion('  Database driver (none, sqlite, postgres, mysql)', 'none');
    const database = dbAnswer.toLowerCase();
    const authAnswer = await askQuestion('  Include Authentication (JWT + RBAC)? (yes/no)', 'no');
    const includeAuth = authAnswer.toLowerCase() === 'yes' || authAnswer.toLowerCase() === 'y';
    const aiAnswer = await askQuestion('  Include AI Platform (LLM, RAG, Agents)? (yes/no)', 'no');
    const includeAI = aiAnswer.toLowerCase() === 'yes' || aiAnswer.toLowerCase() === 'y';
    const wsAnswer = await askQuestion('  Include WebSockets? (yes/no)', 'no');
    const includeWebsocket = wsAnswer.toLowerCase() === 'yes' || wsAnswer.toLowerCase() === 'y';
    const queueAnswer = await askQuestion('  Include Message Queue + Scheduler? (yes/no)', 'no');
    const includeQueue = queueAnswer.toLowerCase() === 'yes' || queueAnswer.toLowerCase() === 'y';
    const options = {
        database,
        includeAuth,
        includeAI,
        includeWebsocket,
        includeQueue
    };
    console.log('');
    // ── Create directories ──────────────────────────────────────────────────────
    const dirs = [
        projectDir,
        (0, node_path_1.join)(projectDir, 'src'),
        (0, node_path_1.join)(projectDir, 'src', 'modules'),
        (0, node_path_1.join)(projectDir, 'src', 'config'),
        (0, node_path_1.join)(projectDir, 'src', 'modules', 'users'),
        (0, node_path_1.join)(projectDir, 'src', 'modules', 'users', 'controllers'),
        (0, node_path_1.join)(projectDir, 'src', 'modules', 'users', 'services')
    ];
    if (database !== 'none') {
        dirs.push((0, node_path_1.join)(projectDir, 'src', 'migrations'), (0, node_path_1.join)(projectDir, 'src', 'db'));
    }
    dirs.forEach(dir => {
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        console.log(`  \x1b[32m+\x1b[0m ${dir.replace(process.cwd(), '.')}`);
    });
    // ─── Generate files ─────────────────────────────────────────────────────────
    const files = [
        { path: (0, node_path_1.join)(projectDir, 'package.json'), content: generatePackageJson(name, options) },
        { path: (0, node_path_1.join)(projectDir, 'tsconfig.json'), content: generateTsConfig() },
        { path: (0, node_path_1.join)(projectDir, '.gitignore'), content: generateGitignore() },
        { path: (0, node_path_1.join)(projectDir, '.env.example'), content: generateEnvExample(options) },
        { path: (0, node_path_1.join)(projectDir, 'README.md'), content: generateReadme(name, options) },
        { path: (0, node_path_1.join)(projectDir, 'src', 'main.ts'), content: generateMainFile(name, options) },
        { path: (0, node_path_1.join)(projectDir, 'src', 'config', 'app.config.ts'), content: generateAppConfig(options) },
        {
            path: (0, node_path_1.join)(projectDir, 'src', 'modules', 'users', 'controllers', 'users.controller.ts'),
            content: generateUsersController(options)
        },
        {
            path: (0, node_path_1.join)(projectDir, 'src', 'modules', 'users', 'services', 'users.service.ts'),
            content: generateUsersService(options)
        }
    ];
    if (database !== 'none') {
        files.push({ path: (0, node_path_1.join)(projectDir, 'src', 'db', 'connection.ts'), content: generateDbConnection(database) }, { path: (0, node_path_1.join)(projectDir, 'src', 'migrations', '001_create_users.ts'), content: generateUsersMigration(database) });
    }
    files.forEach(({ path: filePath, content }) => {
        (0, node_fs_1.writeFileSync)(filePath, content, 'utf-8');
        console.log(`  \x1b[32m+\x1b[0m ${filePath.replace(process.cwd(), '.')}`);
    });
    console.log('\n\x1b[32m✓\x1b[0m Project created successfully!\n');
    console.log('Next steps:\n');
    console.log(`  cd ${name}`);
    console.log('  npm install');
    if (database !== 'none') {
        console.log('  # Configure database connection in .env');
        console.log('  # Run migrations after starting the app');
    }
    console.log('  npm run dev\n');
}
// ─── Template Generators ──────────────────────────────────────────────────────
function generatePackageJson(name, options) {
    const deps = {
        '@axiljs/core': '^0.1.1'
    };
    if (options.database !== 'none') {
        deps['@axiljs/orm'] = '^0.1.1';
        if (options.database === 'postgres')
            deps['pg'] = '^8.23.0';
        if (options.database === 'mysql')
            deps['mysql2'] = '^3.23.3';
        if (options.database === 'sqlite')
            deps['better-sqlite3'] = '^13.0.3';
    }
    if (options.includeAuth)
        deps['@axiljs/auth'] = '^0.1.1';
    if (options.includeAI)
        deps['@axiljs/ai'] = '^0.1.1';
    if (options.includeWebsocket)
        deps['@axiljs/websocket'] = '^0.1.1';
    if (options.includeQueue)
        deps['@axiljs/queue'] = '^0.1.1';
    return JSON.stringify({
        name,
        version: '1.0.0',
        description: `${name} — Built with AxilJS`,
        scripts: {
            dev: 'axil run',
            build: 'tsc',
            start: 'node dist/main.js',
            test: 'axil test'
        },
        dependencies: deps,
        devDependencies: {
            '@axiljs/cli': '^0.1.1',
            '@types/node': '^26.2.0',
            typescript: '^7.0.2'
        }
    }, null, 2);
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
    }, null, 2);
}
function generateGitignore() {
    return `node_modules/
dist/
.env
.env.local
*.log
.tsbuildinfo
`;
}
function generateEnvExample(options) {
    let env = `# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Auth
JWT_SECRET=your-secret-minimum-32-characters-long

`;
    if (options.database === 'postgres') {
        env += `# Database — PostgreSQL
DATABASE_URL=postgres://user:password@localhost:5432/mydb
`;
    }
    else if (options.database === 'mysql') {
        env += `# Database — MySQL
DATABASE_URL=mysql://user:password@localhost:3306/mydb
`;
    }
    else if (options.database === 'sqlite') {
        env += `# Database — SQLite (development)
DATABASE_FILENAME=./dev.db
`;
    }
    if (options.includeAI) {
        env += `
# AI Platform
AI_PROVIDER=ollama
OLLAMA_MODEL=llama3.2
OLLAMA_URL=http://localhost:11434
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
`;
    }
    return env;
}
function generateReadme(name, options) {
    const features = ['HTTP Server', 'Routing', 'Middleware', 'Built-in Response Manager'];
    if (options.database !== 'none')
        features.push(`ORM (${options.database})`, 'Migrations');
    if (options.includeAuth)
        features.push('Authentication (JWT + RBAC)');
    if (options.includeAI)
        features.push('AI Platform');
    if (options.includeWebsocket)
        features.push('WebSockets');
    if (options.includeQueue)
        features.push('Queue + Scheduler');
    return `# ${name}

Built with **AxilJS** by SyntaxilitY.

## Included Features

${features.map(f => `- ${f}`).join('\n')}

## Quick Start

\`\`\`bash
npm install
${options.database !== 'none' ? '# Configure database in .env\n# Run migrations\na' : ''}npm run dev
\`\`\`

Server runs at: http://localhost:3000

## Learn More

- [AxilJS Documentation](https://github.com/SyntaxilitY/AxilJS)
- [npm packages](https://www.npmjs.com/org/axiljs)
`;
}
function generateMainFile(name, options) {
    let imports = `import { Application, cors } from '@axiljs/core'\n`;
    let body = `  app.use(cors())\n\n`;
    if (options.database !== 'none') {
        imports += `import { connectDB } from './db/connection.js'\n`;
        imports += `import { MigrationRunner } from '@axiljs/orm'\n`;
        imports += `import path from 'node:path'\n`;
        body += `  // Connect to database\n  const db = await connectDB()\n\n  // Run migrations\n  const runner = new MigrationRunner(db.getDriver(), path.join(__dirname, 'migrations'))\n  await runner.up()\n\n`;
    }
    if (options.includeAuth) {
        imports += `import { JWT } from '@axiljs/auth'\n`;
        body += `  // Initialize JWT\n  const jwt = new JWT(process.env.JWT_SECRET || 'dev-secret-32-chars-minimum!!')\n\n`;
    }
    if (options.includeWebsocket) {
        imports += `import { WSServer } from '@axiljs/websocket'\n`;
    }
    if (options.includeQueue) {
        imports += `import { Queue } from '@axiljs/queue'\n`;
    }
    return `/**
 * ${name} — Entry Point
 * Built with AxilJS by SyntaxilitY
 */

${imports}
import { appConfig } from './config/app.config.js'
import { UsersController } from './modules/users/controllers/users.controller.js'

async function bootstrap() {
  const app = new Application(appConfig)

${body}
  const usersController = new UsersController()
  usersController.register(app)

${options.includeWebsocket ? `  // WebSocket setup\n  const wss = new WSServer(app.getServer(), { path: '/ws' })\n  wss.on('connection', (client) => {\n    client.sendJSON({ type: 'welcome' })\n  })\n\n` : ''}
  await app.listen()
}

bootstrap().catch(console.error)
`;
}
function generateAppConfig(options) {
    return `/**
 * Application configuration.
 */

import type { AppConfig } from '@axiljs/core'

export const appConfig: AppConfig = {
  server: {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  env: process.env.NODE_ENV || 'development',
  logging: true,
  prefix: '/api'
}
`;
}
function generateUsersController(options) {
    const imports = `import type { axilRequest as Request, axilResponse as Response } from '@axiljs/core'\nimport { Application } from '@axiljs/core'`;
    const authMiddleware = options.includeAuth
        ? `\nimport { authenticate, requireRole } from '@axiljs/auth'`
        : '';
    const servicePath = '../services/users.service.js';
    return `/**
 * Users Controller.
 */

${imports}${authMiddleware}
import { UsersService } from '${servicePath}'

export class UsersController {
  private usersService: UsersService

  constructor() {
    this.usersService = new UsersService()
  }

  register(app: Application): void {
    app.get('/users',     this.list.bind(this) as any)
    app.get('/users/:id', this.getById.bind(this) as any)
    app.post('/users',    this.create.bind(this) as any)
    app.put('/users/:id', this.update.bind(this) as any)
    app.delete('/users/:id', this.remove.bind(this) as any)
  }

  async list(req: Request, res: Response): Promise<void> {
    const users = await this.usersService.findAll()
    res.success({ data: users, total: users.length }, 'Users fetched successfully')
  }

  async getById(req: Request, res: Response): Promise<void> {
    const user = await this.usersService.findById(req.params.id)
    res.success({ data: user }, 'User fetched successfully')
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
    const dbImport = options.database !== 'none'
        ? `\nimport { getDB } from '../../../db/connection.js'`
        : '';
    const dbMethods = options.database !== 'none'
        ? `
  private get driver() {
    return getDB().getDriver()
  }
`
        : '';
    const body = options.database !== 'none'
        ? `    const result = await this.driver.query('SELECT * FROM users ORDER BY id DESC')
    return result.rows`
        : `    return this.users`;
    return `/**
 * Users Service.
 * ${options.database !== 'none' ? 'Database-backed (${options.database})' : 'In-memory store'}
 */

import { NotFoundError } from '@axiljs/core'${dbImport}

export interface User {
  id: string
  name: string
  email: string
  createdAt: string
}

export class UsersService {
${dbMethods}
  ${options.database === 'none' ? `private users: User[] = [
    {
      id: '1',
      name: 'Tariq Mehmood',
      email: 'tariq@syntaxility.dev',
      createdAt: new Date().toISOString()
    }
  ]` : ''}

  async findAll(): Promise<User[]> {
${body}
  }

  async findById(id: string): Promise<User> {
    ${options.database !== 'none'
        ? `const result = await this.driver.query('SELECT * FROM users WHERE id = $1', [id])
    if (result.rows.length === 0) throw new NotFoundError(\`User \${id} not found\`)
    return result.rows[0]`
        : `const user = this.users.find(u => u.id === id)
    if (!user) throw new NotFoundError(\`User \${id} not found\`)
    return user`}
  }

  async create(data: Partial<User>): Promise<User> {
    ${options.database !== 'none'
        ? `const result = await this.driver.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [(data as any).name, (data as any).email]
    )
    return result.rows[0]`
        : `const user: User = {
      id:        String(this.users.length + 1),
      name:      data.name || '',
      email:     data.email || '',
      createdAt: new Date().toISOString()
    }
    this.users.push(user)
    return user`}
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    ${options.database !== 'none'
        ? `const result = await this.driver.query(
      'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING *',
      [(data as any).name, (data as any).email, id]
    )
    if (result.rows.length === 0) throw new NotFoundError(\`User \${id} not found\`)
    return result.rows[0]`
        : `const index = this.users.findIndex(u => u.id === id)
    if (index === -1) throw new NotFoundError(\`User \${id} not found\`)
    this.users[index] = { ...this.users[index], ...data }
    return this.users[index]`}
  }

  async delete(id: string): Promise<void> {
    ${options.database !== 'none'
        ? `const result = await this.driver.query('DELETE FROM users WHERE id = $1 RETURNING id', [id])
    if (result.rows.length === 0) throw new NotFoundError(\`User \${id} not found\`)`
        : `const index = this.users.findIndex(u => u.id === id)
    if (index === -1) throw new NotFoundError(\`User \${id} not found\`)
    this.users.splice(index, 1)`}
  }
}
`;
}
function generateDbConnection(database) {
    const config = database === 'postgres'
        ? `driver: 'postgres', url: process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/mydb'`
        : database === 'mysql'
            ? `driver: 'mysql', url: process.env.DATABASE_URL || 'mysql://user:pass@localhost:3306/mydb'`
            : `driver: 'sqlite', filename: process.env.DATABASE_FILENAME || './dev.db'`;
    return `/**
 * Database connection.
 */

import { createConnection, ConnectionManager } from '@axiljs/orm'

let db: ConnectionManager | null = null

export async function connectDB(): Promise<ConnectionManager> {
  if (db) return db

  db = await createConnection({
    ${config},
    logging: process.env.NODE_ENV === 'development'
  })

  return db
}

export function getDB(): ConnectionManager {
  if (!db) throw new Error('Database not connected. Call connectDB() first.')
  return db
}
`;
}
function generateUsersMigration(database) {
    const autoIncrement = database === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY';
    return `/**
 * Migration: 001_create_users
 */

import { Migration } from '@axiljs/orm'

const migration: Migration = {
  async up(db) {
    await db.query(\`
      CREATE TABLE IF NOT EXISTS users (
        id          ${autoIncrement},
        name        VARCHAR(255) NOT NULL,
        email       VARCHAR(255) UNIQUE NOT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    \`)
  },

  async down(db) {
    await db.query('DROP TABLE IF EXISTS users')
  }
}

module.exports = migration
`;
}
//# sourceMappingURL=create.js.map