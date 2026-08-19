/**
 * Collects route information from AxilJS app source files.
 * Scans src/ directory for route definitions.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import type { RouteInfo, WebSocketInfo, SSEInfo } from '../types.js'

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

export class RouteCollector {
  private cwd: string

  constructor(cwd: string) {
    this.cwd = cwd
  }

  collect(): {
    routes:     RouteInfo[]
    websockets: WebSocketInfo[]
    sse:        SSEInfo[]
  } {
    const routes:     RouteInfo[]     = []
    const websockets: WebSocketInfo[] = []
    const sse:        SSEInfo[]       = []

    const srcDir = join(this.cwd, 'src')
    if (!existsSync(srcDir)) {
      return { routes, websockets, sse }
    }

    const files = this.scanFiles(srcDir)

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8')
        this.extractRoutes(content, routes)
        this.extractWebSockets(content, websockets)
        this.extractSSE(content, sse)
      } catch {
        // Skip unreadable files
      }
    }

    // Deduplicate routes
    const seen = new Set<string>()
    return {
      routes: routes.filter(r => {
        const key = `${r.method}:${r.path}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }),
      websockets,
      sse
    }
  }

  private scanFiles(dir: string): string[] {
    const results: string[] = []

    try {
      const items = readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (item.name === 'node_modules') continue
        const full = join(dir, item.name)
        if (item.isDirectory()) {
          results.push(...this.scanFiles(full))
        } else if (item.name.endsWith('.ts') || item.name.endsWith('.js')) {
          results.push(full)
        }
      }
    } catch {
      // Skip
    }

    return results
  }

  private extractRoutes(content: string, routes: RouteInfo[]): void {
    // Match: app.get('/path', handler)
    // Match: router.post('/path', middleware, handler)
    // Match: this.register(app) patterns
    const pattern = new RegExp(
      `(?:app|router|this)\\.(${HTTP_METHODS.join('|')})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      'gi'
    )

    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      const method = match[1].toUpperCase()
      const path   = match[2]

      // Skip obviously wrong matches
      if (path.length > 200) continue
      if (!path.startsWith('/')) continue

      routes.push({
        method,
        path,
        handler:    this.extractHandlerName(content, match.index),
        middleware: this.extractMiddleware(content, match.index)
      })
    }
  }

  private extractWebSockets(content: string, websockets: WebSocketInfo[]): void {
    // Match: new WSServer(httpServer, { path: '/ws' })
    const pathPattern = /WSServer\s*\([^)]+path\s*:\s*['"`]([^'"`]+)['"`]/g
    let match: RegExpExecArray | null

    while ((match = pathPattern.exec(content)) !== null) {
      const existing = websockets.find(w => w.path === match![1])
      if (!existing) {
        websockets.push({
          path:   match[1],
          events: this.extractWSEvents(content)
        })
      }
    }
  }

  private extractWSEvents(content: string): string[] {
    const events: string[] = []
    // Match: wss.on('connection') or client.on('message')
    const pattern = /\.on\s*\(\s*['"`]([^'"`]+)['"`]/g
    let match: RegExpExecArray | null

    while ((match = pattern.exec(content)) !== null) {
      if (!events.includes(match[1])) {
        events.push(match[1])
      }
    }

    return events
  }

  private extractSSE(content: string, sse: SSEInfo[]): void {
    // Match: res.sse() or text/event-stream
    if (
      content.includes('text/event-stream') ||
      content.includes('res.sse') ||
      content.includes('SSEStream')
    ) {
      // Try to find path
      const pathPattern = /['"`](\/[^'"`]*(?:stream|sse|events)[^'"`]*)['"`]/gi
      let match: RegExpExecArray | null

      while ((match = pathPattern.exec(content)) !== null) {
        if (!sse.find(s => s.path === match![1])) {
          sse.push({ path: match[1], events: ['message', 'error', 'close'] })
        }
      }
    }
  }

  private extractHandlerName(content: string, index: number): string {
    // Try to find the function name after the route path
    const slice = content.slice(index, index + 300)
    const match = slice.match(/,\s*(?:async\s+)?(?:(?:\w+\s*,\s*)*)((?:\w+\.)*\w+)\s*(?:\)|as)/)
    return match ? match[1] : 'anonymous'
  }

  private extractMiddleware(content: string, index: number): string[] {
    const middleware: string[] = []
    const slice = content.slice(index, index + 300)

    if (slice.includes('authenticate') || slice.includes('auth')) {
      middleware.push('authenticate')
    }
    if (slice.includes('validate') || slice.includes('Validate')) {
      middleware.push('validate')
    }
    if (slice.includes('rateLimit') || slice.includes('throttle')) {
      middleware.push('rateLimit')
    }
    if (slice.includes('cors')) {
      middleware.push('cors')
    }

    return middleware
  }
}