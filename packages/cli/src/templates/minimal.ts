/**
 * Template: minimal
 *
 * The smallest useful AxilJS API: typed config, a handful of routes with
 * validation, CORS, one JSON error handler and tests that never open a port.
 */

import type { ProjectTemplate, TemplateContext } from './types'

export const minimalTemplate: ProjectTemplate = {
  id:       'minimal',
  title:    'Minimal API',
  summary:  'Routes, validation, CORS and tests; nothing else',
  packages: ['@axiljs/core', '@axiljs/config', '@axiljs/validation', '@axiljs/testing'],
  port:     3000,

  dependencies: ctx => ({
    '@axiljs/config':     ctx.axilRange,
    '@axiljs/core':       ctx.axilRange,
    '@axiljs/validation': ctx.axilRange
  }),

  files: (ctx: TemplateContext) => ({
    'README.md': `# ${ctx.name}

A minimal [AxilJS](https://github.com/SyntaxilitY/AxilJS) HTTP API, created with
\`axil create ${ctx.name} --template minimal\`.

It shows the core building blocks and nothing else:

- **@axiljs/core**: \`Application\`, routes with path params, CORS, the response envelope (\`res.success\`)
- **@axiljs/config**: \`.env\` loading and a typed config (\`loadEnv\` + \`defineConfig\`)
- **@axiljs/validation**: request validation with \`v.object(...)\` and \`validate({ body, params })\`, 422 on bad input
- **Errors**: one error handler that turns thrown errors (404, 405, 422, 500) into the same JSON shape
- **@axiljs/testing**: tests that drive the app without opening a port

## Run

\`\`\`bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev                 # watch mode, http://localhost:3000
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

## Endpoints

| Method | Path           | Description                         | Success | Errors   |
|--------|----------------|-------------------------------------|---------|----------|
| GET    | \`/\`            | Service name, version and endpoints | 200     |          |
| GET    | \`/health\`      | Liveness: status, uptime, timestamp | 200     |          |
| GET    | \`/hello/:name\` | Greeting; \`name\` is letters only    | 200     | 422      |
| POST   | \`/echo\`        | Echo a validated JSON body          | 200     | 422      |
| *      | anything else  | JSON error                          |         | 404, 405 |

\`POST /echo\` body:

| Field     | Type     | Rules                               |
|-----------|----------|-------------------------------------|
| \`message\` | string   | required, trimmed, 1-280 characters |
| \`repeat\`  | integer  | 1-5, default 1                      |
| \`tags\`    | string[] | up to 5 tags of 1-20 characters     |

Unknown fields are dropped (\`.strip()\`).

Successful responses use the AxilJS envelope:

\`\`\`json
{ "status": 200, "code": "HTTP_200_OK", "message": "Greeting created", "data": { "greeting": "Hello, Ada!" } }
\`\`\`

Errors share one shape:

\`\`\`json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [ { "path": "message", "code": "REQUIRED", "source": "body", "message": "message is required" } ] } }
\`\`\`

### curl

\`\`\`bash
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:3000/hello/Ada
curl -X POST http://localhost:3000/echo -H "Content-Type: application/json" -d '{"message":"hello","repeat":2,"tags":["demo"]}'
curl -X POST http://localhost:3000/echo -H "Content-Type: application/json" -d '{"message":""}'    # 422
curl http://localhost:3000/nope                                                                     # 404
\`\`\`

### PowerShell

\`curl\` is an alias for \`Invoke-WebRequest\` in Windows PowerShell, so use \`curl.exe\` or \`Invoke-RestMethod\`:

\`\`\`powershell
Invoke-RestMethod http://localhost:3000/hello/Ada
Invoke-RestMethod http://localhost:3000/echo -Method Post -ContentType 'application/json' \`
  -Body (@{ message = 'hello'; repeat = 2; tags = @('demo') } | ConvertTo-Json)
curl.exe -s http://localhost:3000/health
\`\`\`

## Configuration

| Variable      | Default       | Description                                    |
|---------------|---------------|------------------------------------------------|
| \`PORT\`        | \`3000\`        | HTTP port                                      |
| \`HOST\`        | \`127.0.0.1\`   | Bind address (\`0.0.0.0\` in containers)         |
| \`NODE_ENV\`    | \`development\` | \`development\`, \`production\` or \`test\`          |
| \`CORS_ORIGIN\` | \`*\`           | \`*\` or a comma-separated list of origins       |

## Project structure

\`\`\`
src/
  main.ts                     entry point: loadEnv, createApp, listen, graceful shutdown
  app.ts                      createApp(config): routes, validation schemas, CORS
  config.ts                   typed config (defineConfig)
  middleware/error-handler.ts thrown errors -> { error: { code, message, details } }
  app.test.ts                 tests for every route
\`\`\`

\`createApp()\` never listens, so tests build the app and call it through
\`createTestClient(app)\`; only \`main.ts\` opens a port.

## Next steps

- Add routes in \`src/app.ts\`, or move them into a \`Router\` and \`app.mount('/prefix', router)\`
- Need a database, auth and RBAC? See the \`rest-api\` template: \`axil create my-api --template rest-api\`
`,

    '.env.example': `# Server
PORT=3000
HOST=127.0.0.1
NODE_ENV=development

# CORS: "*" or a comma-separated list of origins
CORS_ORIGIN=*
`,

    'src/app.test.ts': `import { describe, it, expect, createTestClient } from '@axiljs/testing'
import { createApp, SERVICE } from './app.js'
import { loadConfig } from './config.js'

const ALLOWED_ORIGIN = 'https://app.example.com'

const app    = createApp(loadConfig({ NODE_ENV: 'test', CORS_ORIGIN: ALLOWED_ORIGIN }))
const client = createTestClient(app)

describe('GET /', () => {
  it('describes the service', async () => {
    const res = await client.get('/')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe('HTTP_200_OK')
    expect(res.body.data.service).toBe(SERVICE)
    expect(res.body.data.endpoints).toContain('POST /echo')
  })
})

describe('GET /health', () => {
  it('reports ok', async () => {
    const res = await client.get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(typeof res.body.uptime).toBe('number')
  })
})

describe('GET /hello/:name', () => {
  it('greets by name', async () => {
    const res = await client.get('/hello/Ada')
    expect(res.status).toBe(200)
    expect(res.body.data.greeting).toBe('Hello, Ada!')
  })

  it('decodes and accepts non-ASCII names', async () => {
    const res = await client.get(\`/hello/\${encodeURIComponent('José María')}\`)
    expect(res.status).toBe(200)
    expect(res.body.data.greeting).toBe('Hello, José María!')
  })

  it('rejects names with markup or digits (422)', async () => {
    const res = await client.get(\`/hello/\${encodeURIComponent('<b>x1</b>')}\`)
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details[0].source).toBe('params')
  })
})

describe('POST /echo', () => {
  it('echoes a valid body with defaults applied', async () => {
    const res = await client.post('/echo').send({ message: '  hi  ' })
    expect(res.status).toBe(200)
    expect(res.body.data.message).toBe('hi')
    expect(res.body.data.repeated).toBe('hi')
    expect(res.body.data.tags).toEqual([])
  })

  it('repeats the message and drops unknown fields', async () => {
    const res = await client.post('/echo').send({ message: 'axil', repeat: 3, tags: ['demo'], admin: true })
    expect(res.status).toBe(200)
    expect(res.body.data.repeated).toBe('axil axil axil')
    expect(res.body.data.tags).toEqual(['demo'])
    expect(res.body.data.admin).toBeUndefined()
  })

  it('returns 422 with field errors for an invalid body', async () => {
    const res = await client.post('/echo').send({ message: '', repeat: 10 })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    const paths = res.body.error.details.map((d: { path: string }) => d.path)
    expect(paths).toContain('message')
    expect(paths).toContain('repeat')
  })

  it('returns 422 when the message is missing', async () => {
    const res = await client.post('/echo').send({})
    expect(res.status).toBe(422)
    expect(res.body.error.details[0].code).toBe('REQUIRED')
  })
})

describe('errors', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await client.get('/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 405 with an Allow header for a known path', async () => {
    const res = await client.delete('/echo')
    expect(res.status).toBe(405)
    expect(res.headers['allow']).toContain('POST')
  })
})

describe('CORS', () => {
  it('allows the configured origin', async () => {
    const res = await client.get('/health').set('origin', ALLOWED_ORIGIN)
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
  })

  it('does not allow other origins', async () => {
    const res = await client.get('/health').set('origin', 'https://evil.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
`,

    'src/app.ts': `/**
 * Application factory.
 * Builds the app without listening, so tests can drive it directly.
 */

import { Application, cors } from '@axiljs/core'
import { v, validate } from '@axiljs/validation'
import type { Config } from './config.js'
import { errorHandler } from './middleware/error-handler.js'

export const SERVICE = '${ctx.name}'
export const VERSION = '1.0.0'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const HelloParams = v.object({
  // Letters (any script), spaces, apostrophes and dashes
  name: v.string().min(1).max(40).pattern(/^[\\p{L}\\p{M}' -]+$/u)
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
    res.success({ greeting: \`Hello, \${req.params.name}!\` }, 'Greeting created')
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
`,

    'src/config.ts': `/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 */

import { defineConfig } from '@axiljs/config'

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  return defineConfig({
    PORT:        { type: 'number', default: 3000, min: 0, max: 65535 },
    HOST:        { type: 'string', default: '127.0.0.1' },
    NODE_ENV:    { type: 'string', default: 'development', enum: ['development', 'production', 'test'] },
    // "*" or a comma-separated list of allowed origins
    CORS_ORIGIN: { type: 'string', default: '*' }
  }, source)
}

export type Config = ReturnType<typeof loadConfig>
`,

    'src/main.ts': `/**
 * ${ctx.name}
 * Entry point: load .env, build the app, listen.
 */

import { loadEnv } from '@axiljs/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'

loadEnv()

const config = loadConfig()
const app    = createApp(config)

await app.listen()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    process.exit(0)
  })
}
`,

    'src/middleware/error-handler.ts': `/**
 * Error handler: turns thrown errors into one JSON shape.
 *
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
 *
 * axilError subclasses (NotFoundError, ValidationError, ...) keep their status
 * and code; anything else is a 500 whose message is hidden in production.
 */

import { axilError } from '@axiljs/core'
import type { ErrorMiddlewareFn } from '@axiljs/core'

export function errorHandler(env: string): ErrorMiddlewareFn {
  // Four parameters: that is how Application.use() recognises an error handler
  return (err, req, res, _next) => {
    const known  = err instanceof axilError
    const status = known ? err.statusCode : 500

    if (status >= 500) console.error(\`[\${req.method} \${req.path}]\`, err)

    res.status(status).json({
      error: {
        code:    known ? err.code : 'INTERNAL_ERROR',
        message: status >= 500 && env === 'production' ? 'Internal server error' : err.message,
        ...(known && err.details !== undefined ? { details: err.details } : {})
      }
    })
  }
}
`
  }),

  nextSteps: () => [
    ['npm test', 'Runs the route tests (no server needed)'],
    ['Edit src/app.ts', 'Add your own routes and schemas']
  ]
}
