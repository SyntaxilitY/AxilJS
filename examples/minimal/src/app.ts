/**
 * Application factory.
 * Builds the app without listening, so tests can drive it directly.
 */

import { Application, cors } from '@axiljs/core'
import { v, validate } from '@axiljs/validation'
import type { Config } from './config.js'
import { errorHandler } from './middleware/error-handler.js'

export const SERVICE = 'minimal'
export const VERSION = '1.0.0'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const HelloParams = v.object({
  // Letters (any script), spaces, apostrophes and dashes
  name: v.string().min(1).max(40).pattern(/^[\p{L}\p{M}' -]+$/u)
})

const EchoBody = v.object({
  message: v.string().trim().min(1).max(280),
  repeat:  v.number().integer().min(1).max(5).default(1),
  tags:    v.array(v.string().min(1).max(20)).max(5).default([])
}).strip()

interface EchoInput {
  message: string
  repeat:  number
  tags:    string[]
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function createApp(config: Config): Application {
  const app = new Application({
    server:  { port: config.PORT, host: config.HOST, methodNotAllowed: true },
    env:     config.NODE_ENV,
    logging: config.NODE_ENV !== 'test'
  })

  app.use(cors({ origin: parseOrigins(config.CORS_ORIGIN) }))

  app.get('/', (_req, res) => {
    res.success({
      service: SERVICE,
      version: VERSION,
      endpoints: [
        'GET  /',
        'GET  /health',
        'GET  /hello/:name',
        'POST /echo'
      ]
    }, 'Service info')
  })

  app.get('/health', (_req, res) => {
    res.json({
      status:    'ok',
      uptime:    Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    })
  })

  app.get('/hello/:name', validate({ params: HelloParams }), (req, res) => {
    res.success({ greeting: `Hello, ${req.params.name}!` }, 'Greeting created')
  })

  app.post('/echo', validate({ body: EchoBody }), (req, res) => {
    const { message, repeat, tags } = req.body as EchoInput
    res.success({
      message,
      repeated:   Array.from({ length: repeat }, () => message).join(' '),
      length:     message.length,
      tags,
      receivedAt: new Date().toISOString()
    }, 'Echo')
  })

  // Unknown routes throw NotFoundError (404), a known path with the wrong
  // method throws 405; both end up here, like every other thrown error.
  app.use(errorHandler(config.NODE_ENV))

  return app
}

function parseOrigins(value: string): string | string[] {
  if (value.trim() === '*') return '*'
  return value.split(',').map(o => o.trim()).filter(Boolean)
}
