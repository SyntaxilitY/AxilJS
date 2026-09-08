/**
 * The HTTP bridge — the reference consumer for `tHttp` metadata.
 *
 * This is the proof that AxilJS decorators are not framework glue:
 * this file is ~150 lines and it is the ONLY thing that knows how
 * to turn `@tHttp` + friends into real routes on `@axiljs/core`.
 * Nothing about `@axiljs/decorator` itself depends on this file.
 */

import type { Application } from '@axiljs/core'
import {
  getMetadata,
  getParamMetadata,
  getDecoratedMethods,
  validateComposition,
  type THttpOptions,
  type TAuthOptions,
  type TRateLimitOptions,
  type TCacheOptions,
  type TAuditOptions,
  type TPaginatedOptions
} from '@axiljs/decorator'

import { consumeRateLimit } from './rate-limiter.js'
import { readCache, writeCache, singleFlight } from './cache-store.js'
import { recordAudit } from './audit-log.js'
import { emitIfDeclared } from './event-bus.js'
import type { DB } from '../db/connection.js'

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head'

interface BridgeContext {
  app: Application
  db: DB
}

/**
 * Registers every `@tHttp`-decorated method of a controller instance
 * onto the AxilJS `Application`.
 */
export function registerController(ctx: BridgeContext, instance: object): void {
  const proto = Object.getPrototypeOf(instance)
  const methodNames = getDecoratedMethods(proto)

  for (const methodName of methodNames) {
    const httpMeta = getMetadata<THttpOptions>('tHttp', proto, methodName)
    if (!httpMeta) continue // not an HTTP endpoint — e.g. an @tOnEvent handler

    const composition = validateComposition(proto, methodName)
    if (!composition.valid) {
      console.error(
        `[axiljs/decorator] Invalid composition on ${instance.constructor.name}.${methodName}:`
      )
      composition.errors.forEach(e => console.error(`  ✗ ${e}`))
      throw new Error(`Refusing to register invalid route: ${methodName}`)
    }

    const path = httpMeta.version ? `/v${httpMeta.version}${httpMeta.path}` : httpMeta.path
    const method = httpMeta.method.toLowerCase() as HttpMethod
    const handler = buildHandler(ctx, instance, proto, methodName)

    ;(ctx.app as any)[method](path, handler)

    console.log(`[http-bridge] ${httpMeta.method.padEnd(6)} ${path}  →  ${instance.constructor.name}.${methodName}`)
  }
}

function buildHandler(
  ctx: BridgeContext,
  instance: any,
  proto: object,
  methodName: string
) {
  return async function axilDecoratorHandler(req: any, res: any) {
    const startedAt = performance.now()

    try {
      // ── tAuth ──────────────────────────────────────────────────
      const authMeta = getMetadata<TAuthOptions>('tAuth', proto, methodName)
      if (authMeta?.required) {
        const header = req.headers['authorization']
        if (!header) return res.unauthorized('Authentication required')
        req.locals = req.locals ?? {}
        req.locals.user = req.locals.user ?? decodeFakeToken(header)
      }

      // ── tRole ──────────────────────────────────────────────────
      const roleMeta = getMetadata<{ roles: string[] }>('tRole', proto, methodName)
      if (roleMeta) {
        const role = req.locals?.user?.role ?? req.headers['x-user-role']
        if (!role || !roleMeta.roles.includes(role)) {
          return res.forbidden(`Requires role: ${roleMeta.roles.join(' or ')}`)
        }
      }

      // ── tRateLimit ─────────────────────────────────────────────
      const rateLimitMeta = getMetadata<TRateLimitOptions>('tRateLimit', proto, methodName)
      if (rateLimitMeta) {
        const clientKey = req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown'
        const scopeKey = `${instance.constructor.name}.${methodName}`
        const result = consumeRateLimit(scopeKey, clientKey, rateLimitMeta)
        res.setHeader?.('X-RateLimit-Limit', rateLimitMeta.limit)
        res.setHeader?.('X-RateLimit-Remaining', result.remaining)
        if (!result.allowed) return res.tooManyRequests('Rate limit exceeded')
      }

      // ── tCache (read) ────────────────────────────────────────────
      const cacheMeta = getMetadata<TCacheOptions>('tCache', proto, methodName)
      const cacheKey = cacheMeta ? resolveCacheKey(cacheMeta.key, req) : undefined

      if (cacheMeta && cacheKey) {
        const cached = readCache(cacheKey)
        if (cached !== undefined) {
          res.setHeader?.('X-Cache', 'HIT')
          return respond(res, proto, methodName, cached)
        }
      }

      // ── Parameter binding (tParam/tQuery/tBody/tHeader/tCookie) ──
      const boundArgs = resolveArguments(proto, methodName, req)

      // ── Invoke controller method ─────────────────────────────────
      const invoke = () =>
        boundArgs ? instance[methodName](...boundArgs) : instance[methodName](req, res)

      const stampedeMeta = getMetadata('tCacheStampede', proto, methodName)
      const result =
        stampedeMeta && cacheKey
          ? await singleFlight(cacheKey, invoke)
          : await invoke()

      // ── tCache (write) ────────────────────────────────────────────
      if (cacheMeta && cacheKey && result !== undefined) {
        writeCache(cacheKey, result, cacheMeta.ttl, cacheMeta.tags ?? [])
      }

      // ── tEmit / tOutbox ───────────────────────────────────────────
      await emitIfDeclared(proto, methodName, result)

      // ── tAudit ────────────────────────────────────────────────────
      const auditMeta = getMetadata<TAuditOptions>('tAudit', proto, methodName)
      if (auditMeta) {
        recordAudit(ctx.db, auditMeta, {
          actorId: req.locals?.user?.id,
          ip: req.socket?.remoteAddress,
          method: req.method,
          path: req.path ?? req.url
        })
      }

      // ── tLog ──────────────────────────────────────────────────────
      const logMeta = getMetadata<{ level: string }>('tLog', proto, methodName)
      if (logMeta) {
        const durationMs = +(performance.now() - startedAt).toFixed(2)
        console.log(`[log:${logMeta.level}] ${instance.constructor.name}.${methodName} (${durationMs}ms)`)
      }

      if (res.headersSent) return
      return respond(res, proto, methodName, result)
    } catch (err) {
      console.error(`[http-bridge] ${instance.constructor.name}.${methodName} failed:`, err)
      if (!res.headersSent) res.serverError((err as Error).message)
    }
  }
}

/** Applies `tRedirect` / `tPaginated` / `tStatus` to shape the final response. */
function respond(res: any, proto: object, methodName: string, result: unknown) {
  const redirectMeta = getMetadata<{ url: string; status?: number }>('tRedirect', proto, methodName)
  if (redirectMeta) return res.redirect(redirectMeta.status ?? 302, redirectMeta.url)

  const paginatedMeta = getMetadata<TPaginatedOptions>('tPaginated', proto, methodName)
  if (paginatedMeta && result && typeof result === 'object' && 'items' in (result as any)) {
    const { items, total, page, limit } = result as any
    return res.paginated(items, total, page, limit, 'OK')
  }

  const statusMeta = getMetadata<{ code: number }>('tStatus', proto, methodName)
  if (statusMeta?.code === 201) return res.created(result, 'Created')
  if (statusMeta?.code) {
    res.status(statusMeta.code)
    return res.success(result, 'OK')
  }

  return res.success(result, 'OK')
}

/** Builds handler arguments from `tParam`/`tQuery`/`tBody`/`tHeader`/`tCookie`. */
function resolveArguments(proto: object, methodName: string, req: any): unknown[] | null {
  const sources = ['tParam', 'tQuery', 'tBody', 'tHeader', 'tCookie'] as const
  const bindings: Array<{ index: number; source: string; key?: string }> = []

  for (const source of sources) {
    for (const entry of getParamMetadata(source, proto, methodName)) {
      bindings.push({ index: entry.index, source, key: (entry.value as any)?.key })
    }
  }

  if (bindings.length === 0) return null

  const maxIndex = Math.max(...bindings.map(b => b.index))
  const args = new Array(maxIndex + 1).fill(undefined)

  for (const b of bindings) {
    const bucket =
      b.source === 'tParam' ? req.params :
      b.source === 'tQuery' ? req.query :
      b.source === 'tBody' ? req.body :
      b.source === 'tHeader' ? req.headers :
      req.cookies

    args[b.index] = b.key ? bucket?.[b.key] : bucket
  }

  return args
}

function resolveCacheKey(key: TCacheOptions['key'], req: any): string {
  return typeof key === 'function' ? key(req.params?.id ?? req.path) : key
}

function decodeFakeToken(header: string): { id: number; role: string } {
  // Demo only — a real app delegates to `@axiljs/auth` JWT verification.
  void header
  return { id: 1, role: 'admin' }
}