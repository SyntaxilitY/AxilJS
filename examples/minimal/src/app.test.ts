import { describe, it, expect, createTestClient } from '@axiljs/testing'
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
    const res = await client.get(`/hello/${encodeURIComponent('José María')}`)
    expect(res.status).toBe(200)
    expect(res.body.data.greeting).toBe('Hello, José María!')
  })

  it('rejects names with markup or digits (422)', async () => {
    const res = await client.get(`/hello/${encodeURIComponent('<b>x1</b>')}`)
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
