/**
 * AxilJS Studio Server
 * Runs alongside the dev server on port+1.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { URL } from 'url'

import { RouteCollector }              from './collectors/route-collector.js'
import { DbCollector }                 from './collectors/db-collector.js'
import { generatePostmanCollection }   from './generators/postman.js'
import { generateInsomniaCollection }  from './generators/insomnia.js'
import { generateHTML }                from './ui/template.js'
import type { StudioConfig, StudioData } from './types.js'

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

  constructor(config: StudioConfig) {
    this.config = config
    this.cwd    = process.cwd()
  }

  setDriver(driver: any, driverType: string): void {
    this.dbDriver    = driver
    this.dbCollector = new DbCollector(driver, driverType)
  }

  /**
   * Connect to the database independently using .env config.
   * This is needed because the app runs in a child process
   * and Studio cannot share its driver instance.
   */
  private async connectToDatabase(): Promise<void> {
    const driverType = this.config.dbDriver
    if (!driverType) return

    try {
      if (driverType === 'sqlite') {
        const filename = this.config.dbFile || './dev.db'
        const resolvedPath = join(this.cwd, filename)

        if (!existsSync(resolvedPath)) {
          console.log(`\x1b[33m[Studio]\x1b[0m SQLite file not found: ${resolvedPath} — waiting for app to create it`)
          return
        }

        try {
          const Database = require('better-sqlite3')
          const db = new Database(resolvedPath, { readonly: true })
          db.pragma('journal_mode = WAL')

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

          // Test connection
          const client = await pool.connect()
          client.release()

          const pgDriver = {
            query: async function(sql: string, params?: unknown[]) {
              const result = await pool.query(sql, params)
              return { rows: result.rows, affectedRows: result.rowCount || 0 }
            }
          }

          this.dbDriver    = pgDriver
          this.dbCollector = new DbCollector(pgDriver, 'postgres')
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
            }
          }

          this.dbDriver    = mysqlDriver
          this.dbCollector = new DbCollector(mysqlDriver, 'mysql')
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

    const studioUrl = `http://${this.config.host}:${this.config.port}`
    console.log(
      `\x1b[36m[AxilJS Studio]\x1b[0m \x1b[1m${studioUrl}\x1b[0m`
    )

    this.openBrowser(studioUrl)
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>(resolve => this.server!.close(() => resolve()))
      this.server = null
    }
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

    res.setHeader('Access-Control-Allow-Origin',  '*')
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
        const limit     = Number(url.searchParams.get('limit') ?? 50)
        const offset    = Number(url.searchParams.get('offset') ?? 0)

        if (!this.dbCollector) {
          // Try connecting again — maybe the file exists now
          await this.connectToDatabase()
        }

        if (!this.dbCollector) {
          this.json(res, { rows: [], total: 0 })
          return
        }

        const result = await this.dbCollector.getTableRows(tableName, limit, offset)
        this.json(res, result)
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
        if (!this.dbCollector || !this.dbDriver) {
          this.json(res, { error: 'No database connected', rows: [], affected: 0 })
          return
        }

        let body = ''
        for await (const chunk of req) {
          body += chunk.toString()
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

          const result = await this.dbDriver.query(sql)
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

  private json(res: ServerResponse, data: unknown): void {
    const body = JSON.stringify(data)
    res.writeHead(200, {
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