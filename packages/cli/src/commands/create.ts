/**
 * axil create <name>
 * Scaffolds a new AxilJS project with standard directory structure.
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export async function createProject(name: string): Promise<void> {
  console.log(`\n\x1b[36m[AxilJS]\x1b[0m Creating project: \x1b[1m${name}\x1b[0m\n`)

  const projectDir = join(process.cwd(), name)

  if (existsSync(projectDir)) {
    console.error(`\x1b[31mError:\x1b[0m Directory '${name}' already exists.`)
    process.exit(1)
  }

  // Create directory structure
  const dirs = [
    projectDir,
    join(projectDir, 'src'),
    join(projectDir, 'src', 'modules'),
    join(projectDir, 'src', 'config'),
    join(projectDir, 'src', 'modules', 'users'),
    join(projectDir, 'src', 'modules', 'users', 'controllers'),
    join(projectDir, 'src', 'modules', 'users', 'services'),
  ]

  dirs.forEach(dir => {
    mkdirSync(dir, { recursive: true })
    console.log(`  \x1b[32m+\x1b[0m ${dir.replace(process.cwd(), '.')}`)
  })

  // Generate project files
  const files: Array<{ path: string; content: string }> = [
    { path: join(projectDir, 'package.json'),    content: generatePackageJson(name) },
    { path: join(projectDir, 'tsconfig.json'),   content: generateTsConfig() },
    { path: join(projectDir, '.gitignore'),      content: generateGitignore() },
    { path: join(projectDir, '.env.example'),    content: generateEnvExample() },
    { path: join(projectDir, 'src', 'main.ts'),  content: generateMainFile(name) },
    { path: join(projectDir, 'src', 'config', 'app.config.ts'), content: generateAppConfig() },
    {
      path: join(projectDir, 'src', 'modules', 'users', 'controllers', 'users.controller.ts'),
      content: generateUsersController()
    },
    {
      path: join(projectDir, 'src', 'modules', 'users', 'services', 'users.service.ts'),
      content: generateUsersService()
    }
  ]

  files.forEach(({ path, content }) => {
    writeFileSync(path, content, 'utf-8')
    console.log(`  \x1b[32m+\x1b[0m ${path.replace(process.cwd(), '.')}`)
  })

  console.log('\n\x1b[32m✓\x1b[0m Project created successfully!\n')
  console.log('Next steps:\n')
  console.log(`  cd ${name}`)
  console.log('  npm install')
  console.log('  axil run\n')
}

// ─── Templates ────────────────────────────────────────────────────────────────

function generatePackageJson(name: string): string {
  return JSON.stringify({
    name,
    version: '1.0.0',
    description: `${name} — Built with AxilJS`,
    scripts: {
      dev:   'axil run',
      build: 'tsc',
      start: 'node dist/main.js',
      test:  'axil test'
    },
    dependencies: {
      '@axiljs/core': '^0.1.0'
    },
    devDependencies: {
      typescript:   '^5.4.0',
      '@types/node': '^20.0.0',
      'ts-node':    '^10.9.0'
    }
  }, null, 2)
}

function generateTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target:                'ES2022',
      module:                'commonjs',
      moduleResolution:      'node',
      strict:                true,
      esModuleInterop:       true,
      experimentalDecorators: true,
      emitDecoratorMetadata:  true,
      outDir:                './dist',
      rootDir:               './src',
      skipLibCheck:          true,
      incremental:           true,
      tsBuildInfoFile:       './dist/.tsbuildinfo'
    },
    include: ['src/**/*'],
    exclude: ['dist', 'node_modules']
  }, null, 2)
}

function generateGitignore(): string {
  return `node_modules/
dist/
.env
.env.local
*.log
.tsbuildinfo
`
}

function generateEnvExample(): string {
  return `# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Auth
JWT_SECRET=your-secret-minimum-32-characters-long

# Database
DATABASE_URL=postgres://user:password@localhost:5432/mydb
`
}

function generateMainFile(name: string): string {
  return `/**
 * ${name} — Entry Point
 * Built with AxilJS by SyntaxilitY
 */

import { Application } from '@axiljs/core'
import { cors } from '@axiljs/core'
import { appConfig } from './config/app.config'
import { UsersController } from './modules/users/controllers/users.controller'

async function bootstrap() {
  const app = new Application(appConfig)

  app.use(cors())

  const usersController = new UsersController()
  usersController.register(app)

  await app.listen()
}

bootstrap().catch(console.error)
`
}

function generateAppConfig(): string {
  return `/**
 * Application configuration.
 */

import { AppConfig } from '@axiljs/core'

export const appConfig: AppConfig = {
  server: {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  env: process.env.NODE_ENV || 'development',
  logging: true,
  prefix: '/api'
}
`
}

function generateUsersController(): string {
  return `/**
 * Users Controller.
 */

import { Application, REstRequest, REstResponse } from '@axiljs/core'
import { UsersService } from '../services/users.service'

export class UsersController {
  private usersService: UsersService

  constructor() {
    this.usersService = new UsersService()
  }

  register(app: Application): void {
    app.get('/users',     this.list.bind(this))
    app.get('/users/:id', this.getById.bind(this))
    app.post('/users',    this.create.bind(this))
    app.put('/users/:id', this.update.bind(this))
    app.delete('/users/:id', this.remove.bind(this))
  }

  async list(req: REstRequest, res: REstResponse): Promise<void> {
    const users = await this.usersService.findAll()
    res.json({ data: users, total: users.length })
  }

  async getById(req: REstRequest, res: REstResponse): Promise<void> {
    const user = await this.usersService.findById(req.params.id)
    res.json({ data: user })
  }

  async create(req: REstRequest, res: REstResponse): Promise<void> {
    const user = await this.usersService.create(req.body as any)
    res.status(201).json({ data: user })
  }

  async update(req: REstRequest, res: REstResponse): Promise<void> {
    const user = await this.usersService.update(req.params.id, req.body as any)
    res.json({ data: user })
  }

  async remove(req: REstRequest, res: REstResponse): Promise<void> {
    await this.usersService.delete(req.params.id)
    res.status(204).send('')
  }
}
`
}

function generateUsersService(): string {
  return `/**
 * Users Service.
 * In-memory store — replaced by @axiljs/orm in production.
 */

import { NotFoundError } from '@axiljs/core'

export interface User {
  id: string
  name: string
  email: string
  createdAt: string
}

export class UsersService {
  private users: User[] = [
    {
      id: '1',
      name: 'Tariq Mehmood',
      email: 'tariq@syntaxility.dev',
      createdAt: new Date().toISOString()
    }
  ]

  async findAll(): Promise<User[]> {
    return this.users
  }

  async findById(id: string): Promise<User> {
    const user = this.users.find(u => u.id === id)
    if (!user) throw new NotFoundError(\`User \${id} not found\`)
    return user
  }

  async create(data: Partial<User>): Promise<User> {
    const user: User = {
      id:        String(this.users.length + 1),
      name:      data.name || '',
      email:     data.email || '',
      createdAt: new Date().toISOString()
    }
    this.users.push(user)
    return user
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const index = this.users.findIndex(u => u.id === id)
    if (index === -1) throw new NotFoundError(\`User \${id} not found\`)
    this.users[index] = { ...this.users[index], ...data }
    return this.users[index]
  }

  async delete(id: string): Promise<void> {
    const index = this.users.findIndex(u => u.id === id)
    if (index === -1) throw new NotFoundError(\`User \${id} not found\`)
    this.users.splice(index, 1)
  }
}
`
}