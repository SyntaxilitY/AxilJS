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
    const sources: string[] = []
    for (const file of files) {
      try {
        sources.push(readFileSync(file, 'utf-8'))
      } catch {
        // Skip unreadable files
      }
    }

    // app.mount('/auth', authRoutes(...)) anywhere in src/ puts every route
    // of authRoutes / authRouter under /auth, so collect the mounts first
    const mounts = collectMounts(sources)

    for (const content of sources) {
      this.extractRoutes(content, routes, mounts)
      this.extractWebSockets(content, websockets)
      this.extractSSE(content, sse)
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

  private extractRoutes(content: string, routes: RouteInfo[], mounts: Map<string, string[]> = new Map()): void {
    // Match: app.get('/path', handler)
    // Match: router.post('/path', middleware, handler)  (also usersRouter, api, …Routes)
    // Match: this.register(app) patterns
    const pattern = new RegExp(
      `\\b(app|this|api|(?:[A-Za-z_$][\\w$]*)?[Rr]outer|(?:[A-Za-z_$][\\w$]*)?[Rr]outes?)\\.(${HTTP_METHODS.join('|')})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`,
      'g'
    )

    // Routers created with the prefix built in: const r = new Router('/users')
    const baked = new Map<string, string>()
    for (const m of content.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Router\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
      baked.set(m[1], m[2])
    }

    // Declarations in this file that something mounts (function authRoutes / const usersRouter)
    const owners = declarationsOf(content, mounts)

    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      const receiver = match[1]
      const method   = match[2].toUpperCase()
      const path     = match[3]

      // Skip obviously wrong matches
      if (path.length > 200) continue
      if (!path.startsWith('/')) continue

      // Arguments of THIS call only: (path, ...middleware, handler)
      const args = callArguments(content, content.indexOf('(', match.index))
      const rest = args.slice(1)
      const info = {
        method,
        handler:    rest.length ? handlerName(rest[rest.length - 1]) : 'anonymous',
        middleware: rest.slice(0, -1).map(middlewareName).filter((m): m is string => m !== null)
      }

      for (const prefix of prefixesFor(receiver, match.index, baked, mounts, owners)) {
        routes.push({ ...info, path: joinPath(prefix, path) })
      }
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

// ─── Mount prefixes ───────────────────────────────────────────────────────────

/**
 * `app.mount('/auth', authRoutes(deps))` and `app.mount('/users', usersRouter)`
 * across all sources → { authRoutes: ['/auth'], usersRouter: ['/users'] }.
 * A router mounted twice gets both prefixes.
 */
export function collectMounts(sources: string[]): Map<string, string[]> {
  const mounts = new Map<string, string[]>()
  const pattern = /\.mount\s*\(\s*['"`]([^'"`]*)['"`]\s*,\s*([A-Za-z_$][\w$]*)/g
  for (const src of sources) {
    for (const m of src.matchAll(pattern)) {
      const list = mounts.get(m[2]) ?? []
      if (!list.includes(m[1])) list.push(m[1])
      mounts.set(m[2], list)
    }
  }
  return mounts
}

/** Positions of declarations in `src` whose names are mounted somewhere. */
function declarationsOf(src: string, mounts: Map<string, string[]>): Array<{ name: string; at: number }> {
  const found: Array<{ name: string; at: number }> = []
  const pattern = /(?:function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=])/g
  for (const m of src.matchAll(pattern)) {
    const name = m[1] ?? m[2]
    if (mounts.has(name)) found.push({ name, at: m.index ?? 0 })
  }
  return found
}

/**
 * Prefixes a route registered on `receiver` at position `at` is served under:
 * - a router created with a prefix (new Router('/x')) → that prefix only
 * - a router variable that is mounted directly → its mount prefixes
 * - otherwise the nearest preceding mounted declaration (the factory function
 *   that creates the router, e.g. authRoutes) → its mount prefixes
 * - nothing mounted → served as written ('')
 */
function prefixesFor(
  receiver: string,
  at: number,
  baked: Map<string, string>,
  mounts: Map<string, string[]>,
  owners: Array<{ name: string; at: number }>
): string[] {
  if (receiver === 'app' || receiver === 'this') return ['']
  const own = baked.get(receiver)
  const direct = mounts.get(receiver)
  if (own !== undefined) {
    // Core matches the path relative to the mount point first, then the full
    // path, so mount('/users', new Router('/users')) serves /users/…, and
    // mount('/v1', new Router('/admin')) serves /v1/admin/…
    if (!direct) return [own]
    return direct.map(mount => (joinPath(mount, '/') === joinPath(own, '/') ? own : joinPath(mount, own)))
  }
  if (direct) return direct
  let owner: { name: string; at: number } | undefined
  for (const d of owners) if (d.at < at && (!owner || d.at > owner.at)) owner = d
  return owner ? mounts.get(owner.name)! : ['']
}

/** joinPath('/auth', '/register') → '/auth/register'; joinPath('/products', '/') → '/products'. */
export function joinPath(prefix: string, path: string): string {
  const base = prefix.replace(/\/+$/, '')
  if (!base) return path
  if (path === '/' || path === '') return base
  return base + (path.startsWith('/') ? path : `/${path}`)
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