/**
 * AxilJS Studio Server
 * Runs alongside the dev server on port+1.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { URL } from 'url'

import { RouteCollector }              from './collectors/route-collector.js'
import { DbCollector, StudioInputError } from './collectors/db-collector.js'
import { generatePostmanCollection }   from './generators/postman.js'
import { generateInsomniaCollection }  from './generators/insomnia.js'
import { generateHTML }                from './ui/template.js'
import { INTENT_ENDPOINT_PATH, normalizeIntentReport, readIntentReport } from './intent.js'
import type { IntentStatus }           from './intent.js'
import type { StudioConfig, StudioData, RowFilter, RowQuery } from './types.js'

const PROXY_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

/** Headers the proxy never forwards. */
const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade', 'proxy-authorization', 'te', 'trailer', 'expect'])

async function generateQR(text: string): Promise<string> {
  try {
    const qrcode = await import('qrcode')
    return await qrcode.toDataURL(text, {
      width: 300, margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    })
  } catch {
    return ''
  }
}

export class StudioServer {
  private server:       ReturnType<typeof createServer> | null = null
  private config:       StudioConfig
  private dbCollector:  DbCollector | null = null
  private dbDriver:     any = null
  private cachedData:   StudioData | null = null
  private lastRefresh:  number = 0
  private cwd:          string
  // Single in-flight connection attempt + throttle, so table requests made
  // while the database is unreachable don't each open a new pool
  private connecting:   Promise<void> | null = null
  private lastConnectAttempt: number = 0
  private dbClose:      (() => unknown) | null = null

  constructor(config: StudioConfig) {
    this.config = config
    this.cwd    = config.cwd ?? process.cwd()
  }

  setDriver(driver: any, driverType: string): void {
    this.dbDriver    = driver
    this.dbCollector = new DbCollector(driver, driverType)
  }

  /** Port Studio is listening on (useful with `port: 0`). */
  getPort(): number {
    const address = this.server?.address()
    return address && typeof address === 'object' ? address.port : this.config.port
  }

  /**
   * Connect to the database independently using .env config.
   * This is needed because the app runs in a child process
   * and Studio cannot share its driver instance.
   */
  private connectToDatabase(): Promise<void> {
    if (this.dbCollector) return Promise.resolve()
    if (this.connecting)  return this.connecting
    this.lastConnectAttempt = Date.now()
    this.connecting = this.doConnectToDatabase().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private async doConnectToDatabase(): Promise<void> {
    const driverType = this.config.dbDriver
    if (!driverType) return

    try {
      if (driverType === 'sqlite') {
        const filename = this.config.dbFile || './dev.db'
        // resolve() (not join) so an absolute dbFile is honoured
        const resolvedPath = resolve(this.cwd, filename)

        if (!existsSync(resolvedPath)) {
          console.log(`\x1b[33m[Studio]\x1b[0m SQLite file not found: ${resolvedPath} — waiting for app to create it`)
          return
        }

        try {
          const Database = require('better-sqlite3')
          const db = new Database(resolvedPath, { readonly: true })
          try {
            // Changing journal mode is a write — fails on a readonly
            // handle when the file is not already in WAL mode
            db.pragma('journal_mode = WAL')
          } catch {
            // Read-only browsing works without WAL
          }

          // Create a minimal driver wrapper that DbCollector can use
          const sqliteDriver = {
            query: async function(sql: string, params?: unknown[]) {
              try {
                const trimmed = sql.trim().toUpperCase()
                if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('WITH')) {
                  const rows = db.prepare(sql).all(...(params || []))
                  return { rows, affectedRows: 0 }
                } else {
                  const result = db.prepare(sql).run(...(params || []))
                  return { rows: [], affectedRows: result.changes }
                }
              } catch (err: any) {
                throw new Error(`SQLite query error: ${err.message}\nSQL: ${sql}`)
              }
            }
          }

          this.dbDriver    = sqliteDriver
          this.dbCollector = new DbCollector(sqliteDriver, 'sqlite')
          this.dbClose     = () => db.close()
          console.log(`\x1b[32m[Studio]\x1b[0m Connected to SQLite: ${resolvedPath}`)
        } catch (err: any) {
          if (err.code === 'MODULE_NOT_FOUND') {
            console.log(`\x1b[33m[Studio]\x1b[0m better-sqlite3 not installed — database browser disabled`)
          } else {
            console.log(`\x1b[33m[Studio]\x1b[0m SQLite connection failed: ${err.message}`)
          }
        }
      } else if (driverType === 'postgres') {
        const url = this.config.dbUrl
        if (!url) return

        try {
          const { Pool } = require('pg')
          const pool = new Pool({ connectionString: url, max: 2 })

          // Test connection — end the pool if it fails, otherwise every
          // retry would leak another pool
          try {
            const client = await pool.connect()
            client.release()
          } catch (err) {
            await pool.end().catch(() => {})
            throw err
          }

          const pgDriver = {
            query: async function(sql: string, params?: unknown[]) {
              const result = await pool.query(sql, params)
              return { rows: result.rows, affectedRows: result.rowCount || 0 }
            },
            // Used by the SQL console: a READ ONLY transaction blocks writes
            // (incl. data-modifying CTEs) and the extended protocol rejects
            // stacked statements such as "SELECT 1; DROP TABLE x"
            queryReadOnly: async function(sql: string) {
              const client = await pool.connect()
              try {
                await client.query('BEGIN TRANSACTION READ ONLY')
                const result = await client.query({ text: sql, values: [], queryMode: 'extended' })
                return { rows: result.rows, affectedRows: result.rowCount || 0 }
              } finally {
                await client.query('ROLLBACK').catch(() => {})
                client.release()
              }
            }
          }

          this.dbDriver    = pgDriver
          this.dbCollector = new DbCollector(pgDriver, 'postgres')
          this.dbClose     = () => pool.end()
          console.log(`\x1b[32m[Studio]\x1b[0m Connected to PostgreSQL`)
        } catch (err: any) {
          if (err.code === 'MODULE_NOT_FOUND') {
            console.log(`\x1b[33m[Studio]\x1b[0m pg not installed — database browser disabled`)
          } else {
            console.log(`\x1b[33m[Studio]\x1b[0m PostgreSQL connection failed: ${err.message}`)
          }
        }
      } else if (driverType === 'mysql') {
        const url = this.config.dbUrl
        if (!url) return

        try {
          const mysql = require('mysql2/promise')
          const pool  = mysql.createPool(url)

          const mysqlDriver = {
            query: async function(sql: string, params?: unknown[]) {
              const [rows] = await pool.execute(sql, params)
              if (Array.isArray(rows)) {
                return { rows, affectedRows: 0 }
              }
              return { rows: [], affectedRows: (rows as any).affectedRows || 0 }
            },
            // Used by the SQL console: a READ ONLY transaction blocks table
            // writes; INTO OUTFILE / DUMPFILE is rejected before we get here
            queryReadOnly: async function(sql: string) {
              const conn = await pool.getConnection()
              try {
                await conn.query('START TRANSACTION READ ONLY')
                const [rows] = await conn.query(sql)
                return Array.isArray(rows)
                  ? { rows, affectedRows: 0 }
                  : { rows: [], affectedRows: (rows as any).affectedRows || 0 }
              } finally {
                await conn.query('ROLLBACK').catch(() => {})
                conn.release()
              }
            }
          }

          // createPool() is lazy — test the connection like the pg branch does
          try {
            const conn = await pool.getConnection()
            conn.release()
          } catch (err) {
            await pool.end().catch(() => {})
            throw err
          }

          this.dbDriver    = mysqlDriver
          this.dbCollector = new DbCollector(mysqlDriver, 'mysql')
          this.dbClose     = () => pool.end()
          console.log(`\x1b[32m[Studio]\x1b[0m Connected to MySQL`)
        } catch (err: any) {
          if (err.code === 'MODULE_NOT_FOUND') {
            console.log(`\x1b[33m[Studio]\x1b[0m mysql2 not installed — database browser disabled`)
          } else {
            console.log(`\x1b[33m[Studio]\x1b[0m MySQL connection failed: ${err.message}`)
          }
        }
      }
    } catch (err: any) {
      console.log(`\x1b[33m[Studio]\x1b[0m Database connection failed: ${err.message}`)
    }
  }

  /**
   * Retry database connection — the app may not have created
   * the SQLite file yet when Studio first starts.
   */
  private async retryDatabaseConnection(): Promise<void> {
    if (this.dbCollector) return  // Already connected

    const maxRetries = 5
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      if (!this.server) return  // stopped
      await this.connectToDatabase()
      if (this.dbCollector) return
    }
  }

  async start(): Promise<void> {
    // Connect to database independently
    await this.connectToDatabase()

    // If no connection yet (e.g. SQLite file doesn't exist), retry in background
    if (!this.dbCollector && this.config.dbDriver) {
      this.retryDatabaseConnection().catch(() => {})
    }

    await this.refreshData()

    this.server = createServer((req, res) => this.handleRequest(req, res))

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => resolve())
      this.server!.on('error', reject)
    })

    const studioUrl = `http://${this.config.host}:${this.getPort()}`
    console.log(
      `\x1b[36m[AxilJS Studio]\x1b[0m \x1b[1m${studioUrl}\x1b[0m`
    )

    if (this.config.openBrowser !== false) this.openBrowser(studioUrl)
  }

  async stop(): Promise<void> {
    if (this.server) {
      const server = this.server
      this.server = null
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
    // Release the database handle / pool Studio opened itself
    if (this.dbClose) {
      const close = this.dbClose
      this.dbClose     = null
      this.dbCollector = null
      this.dbDriver    = null
      try { await close() } catch { /* already closed */ }
    }
  }

  /**
   * Host names Studio answers to. Anything else is a DNS-rebinding attempt
   * (a public domain resolving to 127.0.0.1) and is rejected.
   */
  private isAllowedHost(hostname: string): boolean {
    const name    = hostname.toLowerCase()
    const allowed = ['localhost', '127.0.0.1', '[::1]', ...(this.config.allowedHosts ?? [])]
    if (this.config.host) {
      allowed.push(this.config.host.includes(':') && !this.config.host.startsWith('[')
        ? `[${this.config.host}]`
        : this.config.host)
    }
    return allowed.some(h => h.toLowerCase() === name)
  }

  private hostnameOf(value: string, withScheme: boolean): string | null {
    try {
      return new URL(withScheme ? value : `http://${value}`).hostname
    } catch {
      return null
    }
  }

  /** Read a request body, or null when it exceeds `limit` bytes. */
  private readBody(req: IncomingMessage, limit: number): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length'])
      if (Number.isFinite(declared) && declared > limit) {
        resolve(null)
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      let done = false
      req.on('data', (chunk: Buffer) => {
        if (done) return
        size += chunk.length
        if (size > limit) {
          done = true
          resolve(null)
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (done) return
        done = true
        resolve(Buffer.concat(chunks).toString('utf8'))
      })
      req.on('error', err => {
        if (done) return
        done = true
        reject(err)
      })
    })
  }

  private async refreshData(): Promise<StudioData> {
    const now = Date.now()
    if (this.cachedData && now - this.lastRefresh < 5000) {
      return this.cachedData
    }

    const routeCollector = new RouteCollector(this.cwd)
    const { routes, websockets, sse } = routeCollector.collect()

    let tables: any[] = []
    if (this.dbCollector) {
      try {
        tables = await this.dbCollector.collectTables()
      } catch (err: any) {
        console.log(`\x1b[33m[Studio]\x1b[0m Table collection error: ${err.message}`)
        tables = []
      }
    }

    const appUrl    = `http://localhost:${this.config.appPort}`
    const studioUrl = `http://localhost:${this.config.port}`

    this.cachedData = {
      appName:   this.config.appName,
      appUrl,
      studioUrl,
      dbDriver:  this.config.dbDriver ?? null,
      routes,
      websockets,
      sse,
      tables,
      startedAt: new Date().toISOString()
    }

    this.lastRefresh = now
    return this.cachedData
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const url    = new URL(req.url ?? '/', `http://localhost:${this.config.port}`)
    const path   = url.pathname
    const method = req.method ?? 'GET'

    // DNS rebinding: a page on evil.example whose DNS later points at
    // 127.0.0.1 is same-origin with Studio, so CORS alone does not help —
    // only answer requests addressed to a local / configured host name.
    const hostHeader = req.headers.host
    if (hostHeader !== undefined) {
      const hostname = this.hostnameOf(hostHeader, false)
      if (!hostname || !this.isAllowedHost(hostname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Invalid Host header')
        return
      }
    }

    // Only allow cross-origin reads from local origins. A wildcard would let
    // any website the developer visits read the database through Studio.
    const origin = req.headers.origin
    if (origin) {
      const host = this.hostnameOf(origin, true)
      if (host && this.isAllowedHost(host)) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
      }
      // Malformed / foreign Origin — no CORS headers
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      // ── Studio UI ──
      if (path === '/' || path === '/studio') {
        const data  = await this.refreshData()
        const appQR = await generateQR(data.appUrl)
        const html  = generateHTML({
          appName:    data.appName,
          appUrl:     data.appUrl,
          studioPort: this.config.port,
          qrDataUrl:  appQR
        })
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
        return
      }

      // ── Data API ──
      if (path === '/api/studio/data') {
        // Force refresh on explicit data request
        this.cachedData = null
        const data = await this.refreshData()
        this.json(res, data)
        return
      }

      // ── Table rows ──
      if (path.startsWith('/api/studio/table/')) {
        const tableName = decodeURIComponent(path.replace('/api/studio/table/', ''))
        const p         = url.searchParams
        let filters: RowFilter[] | undefined
        try {
          filters = p.has('filter') ? JSON.parse(p.get('filter')!) : undefined
          if (filters !== undefined && !Array.isArray(filters)) throw new Error('not an array')
        } catch {
          this.json(res, { error: 'filter must be a JSON array of { column, op, value }', rows: [], total: 0 }, 400)
          return
        }
        const query: RowQuery = {
          limit:   Number(p.get('limit') ?? 50),
          offset:  Number(p.get('offset') ?? 0),
          sort:    p.get('sort') ?? undefined,
          dir:     (p.get('dir') ?? undefined) as RowQuery['dir'],
          search:  p.get('q') ?? undefined,
          filters
        }

        if (!this.dbCollector && Date.now() - this.lastConnectAttempt > 2000) {
          // Try connecting again — maybe the file exists now (throttled,
          // and reuses an in-flight attempt instead of opening a new pool)
          await this.connectToDatabase()
        }

        if (!this.dbCollector) {
          this.json(res, { rows: [], total: 0 })
          return
        }

        try {
          this.json(res, await this.dbCollector.getTableRows(tableName, query))
        } catch (err: any) {
          if (err instanceof StudioInputError) this.json(res, { error: err.message, rows: [], total: 0 }, 400)
          else throw err
        }
        return
      }

      // ── Schema: tables + foreign keys + indexes ──
      if (path === '/api/studio/schema') {
        if (!this.dbCollector && Date.now() - this.lastConnectAttempt > 2000) await this.connectToDatabase()
        const tables = this.dbCollector ? await this.dbCollector.collectSchema() : []
        this.json(res, { driver: this.dbCollector ? this.config.dbDriver ?? null : null, tables })
        return
      }

      // ── Intent: runtime contract report (mode, violations, SLOs, circuits) ──
      if (path === '/api/studio/intent') {
        this.json(res, await this.intentReport())
        return
      }

      // ── Request proxy: try-it calls to the app (no CORS, full response headers) ──
      if (path === '/api/studio/proxy' && method === 'POST') {
        await this.handleProxy(req, res)
        return
      }

      // ── QR generation ──
      if (path === '/api/studio/qr') {
        const targetUrl = url.searchParams.get('url') ?? `http://localhost:${this.config.port}`
        const qrDataUrl = await generateQR(targetUrl)
        this.json(res, { qrDataUrl })
        return
      }

      // ── SQL Query ──
      if (path === '/api/studio/query' && method === 'POST') {
        const body = await this.readBody(req, this.config.maxBodyBytes ?? 1024 * 1024)
        if (body === null) {
          const payload = JSON.stringify({ error: 'Request body too large', rows: [], affected: 0 })
          res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' })
          // Stop receiving the rest of an oversized upload
          res.end(payload, () => req.destroy())
          return
        }

        if (!this.dbCollector || !this.dbDriver) {
          this.json(res, { error: 'No database connected', rows: [], affected: 0 })
          return
        }

        try {
          const { sql } = JSON.parse(body)
          if (!sql || typeof sql !== 'string') {
            this.json(res, { error: 'Missing sql field', rows: [], affected: 0 })
            return
          }

          const trimmed = sql.trim().toUpperCase()
          const isReadOnly = trimmed.startsWith('SELECT') ||
                             trimmed.startsWith('SHOW') ||
                             trimmed.startsWith('DESCRIBE') ||
                             trimmed.startsWith('EXPLAIN') ||
                             trimmed.startsWith('PRAGMA') ||
                             trimmed.startsWith('WITH')

          if (!isReadOnly) {
            this.json(res, { error: 'Only SELECT queries are allowed in Studio', rows: [], affected: 0 })
            return
          }

          // MySQL: SELECT ... INTO OUTFILE / DUMPFILE writes files on the
          // database server (comments such as INTO/**/OUTFILE included)
          if (/OUTFILE|DUMPFILE/i.test(sql)) {
            this.json(res, { error: 'INTO OUTFILE / DUMPFILE is not allowed in Studio', rows: [], affected: 0 })
            return
          }

          const result = typeof this.dbDriver.queryReadOnly === 'function'
            ? await this.dbDriver.queryReadOnly(sql)
            : await this.dbDriver.query(sql)
          this.json(res, {
            rows:     result.rows ?? [],
            affected: result.affectedRows ?? 0
          })
        } catch (err: any) {
          this.json(res, { error: err.message, rows: [], affected: 0 })
        }
        return
      }

      // ── Export: Postman ──
      if (path === '/api/studio/export/postman') {
        const data       = await this.refreshData()
        const collection = generatePostmanCollection(data.appName, data.appUrl, data.routes)
        this.json(res, collection)
        return
      }

      // ── Export: Insomnia ──
      if (path === '/api/studio/export/insomnia') {
        const data       = await this.refreshData()
        const collection = generateInsomniaCollection(data.appName, data.appUrl, data.routes)
        this.json(res, collection)
        return
      }

      // ── Export: OpenAPI ──
      if (path === '/api/studio/export/openapi') {
        const data = await this.refreshData()
        const spec = this.generateOpenAPI(data)
        this.json(res, spec)
        return
      }

      // ── 404 ──
      res.writeHead(404)
      res.end('Not found')
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    }
  }

  /**
   * POST /api/studio/proxy { method, path, query?, headers?, body? }
   * Sends the request to the app (and only the app: the target origin is
   * fixed to appUrl) and returns status, headers, body, time and size.
   */
  private async handleProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // A JSON content type forces a CORS preflight, which only local origins pass
    if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      this.json(res, { error: 'Content-Type must be application/json' }, 415)
      return
    }
    const raw = await this.readBody(req, this.config.maxBodyBytes ?? 1024 * 1024)
    if (raw === null) {
      this.json(res, { error: 'Request body too large' }, 413)
      return
    }

    let input: any
    try { input = JSON.parse(raw) } catch {
      this.json(res, { error: 'Body must be JSON' }, 400)
      return
    }

    const verb = String(input?.method ?? '').toUpperCase()
    if (!PROXY_METHODS.includes(verb)) {
      this.json(res, { error: `method must be one of ${PROXY_METHODS.join(', ')}` }, 400)
      return
    }
    const target = typeof input.path === 'string' && input.path.startsWith('/') && !input.path.startsWith('//')
      ? new URL(input.path, this.appOrigin())
      : null
    if (!target || target.origin !== this.appOrigin()) {
      this.json(res, { error: 'path must be an absolute path on the app, e.g. "/users/1"' }, 400)
      return
    }
    if (input.query && typeof input.query === 'object') {
      for (const [k, v] of Object.entries(input.query)) {
        if (k) target.searchParams.append(k, String(v ?? ''))
      }
    }

    const headers: Record<string, string> = {}
    if (input.headers && typeof input.headers === 'object') {
      for (const [k, v] of Object.entries(input.headers)) {
        const name = k.trim().toLowerCase()
        if (!name || HOP_BY_HOP.has(name) || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)) continue
        headers[name] = String(v ?? '')
      }
    }
    const body = verb === 'GET' || verb === 'HEAD' || input.body === undefined || input.body === null
      ? undefined
      : String(input.body)

    const started = performance.now()
    try {
      const response = await fetch(target, {
        method:   verb,
        headers,
        body,
        redirect: 'manual',
        signal:   AbortSignal.timeout(30_000)
      })
      const buf = Buffer.from(await response.arrayBuffer())
      const limit = 5 * 1024 * 1024
      this.json(res, {
        status:     response.status,
        statusText: response.statusText,
        headers:    Object.fromEntries(response.headers.entries()),
        body:       buf.subarray(0, limit).toString('utf8'),
        truncated:  buf.length > limit,
        timeMs:     Math.round(performance.now() - started),
        size:       buf.length,
        url:        target.pathname + target.search
      })
    } catch (err: any) {
      const reason = err?.name === 'TimeoutError'
        ? 'The app did not answer within 30 s'
        : `Could not reach the app at ${this.appOrigin()} (${err?.cause?.code ?? err?.message ?? 'error'}). Is it running?`
      this.json(res, { error: reason, timeMs: Math.round(performance.now() - started) }, 502)
    }
  }

  /**
   * Runtime intent report. Read from this process when @axiljs/runtime is
   * loaded here (Studio embedded in the app); otherwise fetched from the
   * app's intentEndpoint() — under `axil run` the app is a child process.
   */
  private async intentReport(): Promise<IntentStatus> {
    const local = readIntentReport()
    if (local.available) return local

    const path = this.config.intentPath ?? INTENT_ENDPOINT_PATH
    const target = new URL(path.startsWith('/') ? path : `/${path}`, this.appOrigin())
    let response: Response
    try {
      response = await fetch(target, {
        headers:  { Accept: 'application/json' },
        redirect: 'manual',
        signal:   AbortSignal.timeout(1500)
      })
    } catch (err: any) {
      return {
        available: false,
        reason: err?.name === 'TimeoutError'
          ? `The app at ${this.appOrigin()} did not answer ${target.pathname} within 1.5 s`
          : `Could not reach the app at ${this.appOrigin()}. Is it running?`
      }
    }
    if (response.status === 404) {
      await response.body?.cancel().catch(() => {})
      return {
        available: false,
        reason: `The app does not serve ${target.pathname}. Add app.use(intentEndpoint()) from @axiljs/studio in development.`
      }
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      return { available: false, reason: `The app answered ${target.pathname} with HTTP ${response.status}` }
    }
    try {
      return normalizeIntentReport(await response.json(), 'app')
    } catch {
      return { available: false, reason: `The app answered ${target.pathname} with something other than JSON` }
    }
  }

  /** Origin of the app Studio inspects, e.g. http://localhost:3000. */
  private appOrigin(): string {
    return `http://localhost:${this.config.appPort}`
  }

  private json(res: ServerResponse, data: unknown, status = 200): void {
    const body = JSON.stringify(data)
    res.writeHead(status, {
      'Content-Type':   'application/json',
      'Content-Length':  Buffer.byteLength(body)
    })
    res.end(body)
  }

  private generateOpenAPI(data: StudioData): object {
    const paths: Record<string, Record<string, object>> = {}

    for (const route of data.routes) {
      const oaPath = route.path.replace(/:(\w+)/g, '{$1}')
      if (!paths[oaPath]) paths[oaPath] = {}

      const method = route.method.toLowerCase()
      const params = (route.path.match(/:(\w+)/g) ?? []).map(p => ({
        name: p.slice(1), in: 'path', required: true, schema: { type: 'string' }
      }))

      paths[oaPath][method] = {
        summary:    `${route.method} ${route.path}`,
        tags:       [route.path.split('/')[1] ?? 'default'],
        parameters: params,
        ...(['post', 'put', 'patch'].includes(method) ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } }
          }
        } : {}),
        responses: {
          '200': { description: 'Success' },
          '400': { description: 'Bad Request' },
          '404': { description: 'Not Found' },
          '500': { description: 'Internal Server Error' }
        }
      }
    }

    return {
      openapi: '3.0.3',
      info: {
        title:   `${data.appName} API`,
        version: '1.0.0'
      },
      servers: [{ url: data.appUrl }],
      paths
    }
  }

  private openBrowser(url: string): void {
    try {
      const { execSync } = require('child_process')
      const cmd = process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
          ? `open "${url}"`
          : `xdg-open "${url}"`
      execSync(cmd, { stdio: 'ignore' })
    } catch {
      // Best effort
    }
  }
}