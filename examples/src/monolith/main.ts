/**
 * AxilJS Monolith Example — E-Commerce API
 *
 * Architecture: Monolith with Service Layer
 * Database:     PostgreSQL via @axil/orm
 * Auth:         JWT via @axil/auth
 * Validation:   Schema via @axil/validation
 * Response:     SyntaxilitY built-in manager
 *
 * Run:
 *   1. Create database: createdb axil_shop
 *   2. npx ts-node src/monolith/main.ts
 */

import { Application, cors }     from '@axil/core'
import { helmet, rateLimit }     from '@axil/security'
import { JWT }                   from '@axil/auth'
import { MigrationRunner }       from '@axil/orm'
import { Logger }                from '@axil/observability'
import { config }                from './config'
import { connectDB }             from './db'
import { registerAuthRoutes }    from './routes/auth'
import { registerProductRoutes } from './routes/products'
import { registerCartRoutes }    from './routes/cart'
import { registerOrderRoutes }   from './routes/orders'
import path from 'path'


const logger = new Logger({ name: 'Shop' })
const jwt    = new JWT(config.JWT_SECRET)
const app    = new Application({
  server: { port: config.PORT, host: config.HOST },
  env:    config.NODE_ENV
})

// Global middleware
app.use(helmet())
app.use(cors({ origin: '*' }))
app.use(rateLimit({ max: 200, windowMs: 60000 }))

// Register routes
registerAuthRoutes(app, jwt)
registerProductRoutes(app, jwt)
registerCartRoutes(app, jwt)
registerOrderRoutes(app, jwt)

// Info endpoint
app.get('/', (req: any, res: any) => {
  res.success({
    name:         'AxilJS Monolith — E-Commerce API',
    architecture: 'Monolith + Service Layer',
    database:     'PostgreSQL',
    endpoints: {
      auth: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'GET  /api/auth/me [auth]'
      ],
      products: [
        'GET    /api/products',
        'GET    /api/products/:id',
        'POST   /api/products [admin]',
        'PUT    /api/products/:id [admin]',
        'DELETE /api/products/:id [admin]'
      ],
      cart: [
        'GET    /api/cart [auth]',
        'POST   /api/cart/add [auth]',
        'DELETE /api/cart/remove/:productId [auth]',
        'DELETE /api/cart/clear [auth]'
      ],
      orders: [
        'POST  /api/orders/checkout [auth]',
        'GET   /api/orders [auth]',
        'GET   /api/orders/:id [auth]',
        'PATCH /api/orders/:id/status [admin]'
      ]
    },
    quickStart: [
      '1. POST /api/auth/register { name, email, password, role: "admin" }',
      '2. POST /api/auth/login { email, password }',
      '3. POST /api/products { name, price, stock } [admin token]',
      '4. POST /api/cart/add { productId: 1, quantity: 2 } [customer token]',
      '5. POST /api/orders/checkout { address: "..." } [customer token]'
    ]
  }, 'E-Commerce API ready')
})

// Bootstrap
async function start() {
  // Connect to PostgreSQL
  const db = await connectDB()
  logger.info('PostgreSQL connected')

  const runner = new MigrationRunner(
    db.getDriver(),
    path.join(__dirname, 'migrations')
  )
  await runner.up()
  
  logger.info('Migrations complete')

  // Start server
  await app.listen(config.PORT, config.HOST)
  logger.info('E-Commerce API started', {
    url:  `http://${config.HOST}:${config.PORT}`,
    db:   'PostgreSQL',
    arch: 'Monolith'
  })
}

start().catch(err => {
  logger.error('Startup failed', { error: err.message })
  process.exit(1)
})