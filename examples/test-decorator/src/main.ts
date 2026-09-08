/**
 * test-decorator
 * AxilJS application entry point — decorator-driven edition.
 *
 * Every route below is registered by the http-bridge consumer reading
 * `@tHttp` metadata off plain controller classes. No `@Controller`,
 * no `@Module`, no `@UseGuards` — just semantic decorators and
 * independent consumers reading the same metadata registry.
 */

import { Application, cors } from '@axiljs/core'
import { loadEnv, defineConfig } from '@axiljs/config'
import { JWT } from '@axiljs/auth'

import { connectDB } from './db/connection.js'
import { setupDatabase } from './db/setup.js'

import { registerController } from './runtime/http-bridge.js'
import { registerEventHandlers } from './runtime/event-bus.js'

import { AuthController } from './controllers/auth.controller.js'
import { UserController } from './controllers/user.controller.js'
import { PostController } from './controllers/post.controller.js'
import { CategoryController } from './controllers/category.controller.js'
import { CommentController } from './controllers/comment.controller.js'
import { TagController } from './controllers/tag.controller.js'
import { UploadController } from './controllers/upload.controller.js'
import { NotificationController } from './controllers/notification.controller.js'
import { SettingsController } from './controllers/settings.controller.js'
import { ApiKeyController } from './controllers/api-key.controller.js'
import { AuditController } from './controllers/audit.controller.js'
import { StatsController } from './controllers/stats.controller.js'
import { SearchController } from './controllers/search.controller.js'
import { AiController } from './controllers/ai.controller.js'

loadEnv()

const config = defineConfig({
  PORT:       { type: 'number', default: 3000 },
  HOST:       { type: 'string', default: '127.0.0.1' },
  NODE_ENV:   { type: 'string', default: 'development' },
  JWT_SECRET: {
    type: 'string',
    default: 'change-this-secret-to-a-random-value-with-at-least-32-characters'
  }
})

const app = new Application({
  server: { port: config.PORT, host: config.HOST },
  env: config.NODE_ENV
})

app.use(cors())

const jwt = new JWT(config.JWT_SECRET)
void jwt

// ── Database ────────────────────────────────────────────────────────
const db = await connectDB()
await setupDatabase(db)

// ── Root & Health (plain routes — decorators are optional, not mandatory) ──
app.get('/', (_req, res) => res.json({ message: 'Hello, world!' }))

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: 'test-decorator',
  timestamp: new Date().toISOString()
}))

// ── Wire every decorated controller through the HTTP bridge ─────────
const ctx = { app, db }

const httpControllers = [
  new AuthController(db),
  new UserController(db),
  new PostController(db),
  new CategoryController(db),
  new CommentController(db),
  new TagController(db),
  new UploadController(db),
  new NotificationController(db),
  new SettingsController(),
  new ApiKeyController(db),
  new AuditController(db),
  new StatsController(db),
  new SearchController(),
  new AiController()
]

console.log('\n[axiljs/decorator] Registering HTTP routes from semantic metadata...\n')
for (const controller of httpControllers) {
  registerController(ctx, controller)
}

// ── Wire event handlers (independent of the HTTP bridge) ────────────
console.log('\n[axiljs/decorator] Registering event handlers from semantic metadata...\n')
registerEventHandlers(httpControllers.find(c => c instanceof NotificationController))

// ── Start ───────────────────────────────────────────────────────────
await app.listen()

console.log(`\n✓ test-decorator running at http://${config.HOST}:${config.PORT}`)
console.log(`  Try: axil decorator info tDatabase   (simulated via npm run decorators:info tDatabase)\n`)

process.on('SIGINT',  async () => { await app.close(); process.exit(0) })
process.on('SIGTERM', async () => { await app.close(); process.exit(0) })