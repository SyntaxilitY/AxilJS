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

      // Arguments of THIS call only: (path, ...middleware, handler)
      const args = callArguments(content, content.indexOf('(', match.index))
      const rest = args.slice(1)
      routes.push({
        method,
        path,
        handler:    rest.length ? handlerName(rest[rest.length - 1]) : 'anonymous',
        middleware: rest.slice(0, -1).map(middlewareName).filter((m): m is string => m !== null)
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

}

// ─── Call-argument parsing ────────────────────────────────────────────────────

/**
 * Top-level arguments of the call whose "(" is at `open`, as source text.
 * Tracks (), [], {} nesting and skips strings, template literals and
 * comments, so `app.get('/', (req, res) => res.json({ a: [1, 2] }))`
 * yields ["'/'", "(req, res) => res.json({ a: [1, 2] })"].
 */
export function callArguments(src: string, open: number): string[] {
  if (open < 0 || src[open] !== '(') return []
  const args: string[] = []
  // Argument text without comments ("//" after ":" is a URL, not a comment)
  const clean = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1').trim()
  let depth = 0
  let start = open + 1
  for (let i = open; i < src.length && i < open + 20_000; i++) {
    const ch = src[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      // Skip the string (template ${} nesting is rare in route args; good enough)
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++
      continue
    }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i++; continue }
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      if (depth === 0) {
        const last = clean(src.slice(start, i))
        if (last) args.push(last)
        return args
      }
    } else if (ch === ',' && depth === 1) {
      args.push(clean(src.slice(start, i)))
      start = i + 1
    }
  }
  return args
}

/** "listUsers" / "users.list" for references; "anonymous" for inline functions. */
export function handlerName(arg: string): string {
  const named = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(arg)
  if (named) return named[1]
  if (/^(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(arg)) return 'anonymous'
  const ref = /^((?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*)(?:\.bind\(.*\))?\s*(?:as\s+\w+)?$/.exec(arg)
  return ref ? ref[1] : 'anonymous'
}

/** "authenticate()" → "authenticate", "validate({ body })" → "validate", "auth.required" → "auth.required". */
export function middlewareName(arg: string): string | null {
  if (/^(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(arg)) return 'inline'
  const m = /^((?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*)/.exec(arg)
  return m ? m[1] : null
}