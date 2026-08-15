/**
 * AxilJS MVC Example — Blog Platform
 *
 * Architecture:
 *   Model      → data + business logic (User, Post, Comment)
 *   View       → response formatting (views/response.ts)
 *   Controller → request handling (AuthController, PostController, etc.)
 *   Routes     → URL mapping (authRoutes, postRoutes, commentRoutes)
 *
 * Run: node ../packages/cli/dist/cli.js run (from examples/)
 * Or:  npx ts-node src/mvc/main.ts
 */

import { Application, cors } from '@axiljs/core'
import { helmet, rateLimit } from '@axiljs/security'
import { JWT }               from '@axiljs/auth'
import { Logger }            from '@axiljs/observability'
import { config }            from './config/app.config'
import { authRoutes }        from './routes/auth.routes'
import { postRoutes }        from './routes/post.routes'
import { commentRoutes }     from './routes/comment.routes'
import { mvcLogger }         from './middlewares/logger.middleware'

const logger = new Logger({ name: 'MVC-Blog' })
const jwt    = new JWT(config.JWT_SECRET)
const app    = new Application({ server: { port: config.PORT, host: config.HOST }, env: config.NODE_ENV })

// ── Global middleware ────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: '*' }))
app.use(rateLimit({ max: 200, windowMs: 60000 }))
app.use(mvcLogger())

// ── Mount routes ─────────────────────────────────────────────────────────────
app.mount('', authRoutes(jwt))
app.mount('', postRoutes(jwt))
app.mount('', commentRoutes(jwt))

// ── Info endpoint ────────────────────────────────────────────────────────────
app.get('/', (req:any, res:any) => {
  res.json({
    name:         'AxilJS MVC Example — Blog Platform',
    architecture: 'Model-View-Controller',
    version:      '0.1.0',
    endpoints: {
      auth: {
        'POST /api/auth/register':   'Register a new user',
        'POST /api/auth/login':      'Login and get JWT token',
        'GET  /api/auth/me':         'Get current user [auth]',
        'PUT  /api/auth/profile':    'Update profile [auth]'
      },
      posts: {
        'GET    /api/posts':             'List published posts',
        'GET    /api/posts/:id':         'Get a post by ID',
        'GET    /api/posts/slug/:slug':  'Get a post by slug',
        'POST   /api/posts':            'Create a post [author/admin]',
        'PUT    /api/posts/:id':        'Update a post [owner/admin]',
        'DELETE /api/posts/:id':        'Delete a post [owner/admin]',
        'PATCH  /api/posts/:id/publish':'Toggle publish [owner/admin]'
      },
      comments: {
        'GET    /api/posts/:postId/comments': 'List comments on a post',
        'POST   /api/posts/:postId/comments': 'Add a comment [auth]',
        'DELETE /api/comments/:id':           'Delete a comment [owner/admin]'
      }
    },
    quickStart: [
      '1. POST /api/auth/register  { name, email, password, role: "author" }',
      '2. POST /api/auth/login     { email, password }  → copy token',
      '3. POST /api/posts          { title, content }   [Bearer token]',
      '4. PATCH /api/posts/1/publish                    [Bearer token]',
      '5. GET  /api/posts'
    ]
  })
})

// ── Start ────────────────────────────────────────────────────────────────────
async function start() {
  await app.listen(config.PORT, config.HOST)
  logger.info('MVC Blog Platform started', {
    url:          `http://${config.HOST}:${config.PORT}`,
    architecture: 'MVC',
    docs:         `http://${config.HOST}:${config.PORT}/`
  })
}

start().catch(err => {
  logger.error('Startup failed', { error: err.message })
  process.exit(1)
})