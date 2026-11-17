/**
 * Intent report bridge between an AxilJS app and Studio.
 *
 * `@axiljs/runtime` publishes a report function on
 * `globalThis[Symbol.for('axiljs.runtime.report')]`. Studio never imports the
 * runtime: when it shares a process with the app it reads that global
 * directly, otherwise (`axil run` starts the app as a child process) it asks
 * the app for the report over HTTP at INTENT_ENDPOINT_PATH, which the app
 * serves with `intentEndpoint()`.
 *
 * This module has no imports so an app can load it on its own
 * (`@axiljs/studio/dist/intent`) without pulling in the rest of Studio.
 */

/** Global key under which @axiljs/runtime publishes `runtimeReport()`. */
export const INTENT_REPORT_KEY = Symbol.for('axiljs.runtime.report')

/** Path the app serves the report on, and Studio fetches it from. */
export const INTENT_ENDPOINT_PATH = '/__axil/studio/intent'

export type IntentMode = 'enforce' | 'warn' | 'off'
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface IntentViolationInfo {
  decorator:  string
  target:     string
  detail:     string
  requestId?: string
  tenantId?:  string
  timestamp:  string
}

export interface SloInfo {
  target:           string
  samples:          number
  /** Percentile the latency is measured at, e.g. 99. */
  percentile:       number
  observedMs:       number
  targetMs?:        number
  /** Fraction of failed calls (0..1). */
  errorRate:        number
  /** Allowed error fraction (0..1). */
  errorBudget?:     number
  meetsLatency:     boolean
  meetsErrorBudget: boolean
}

export interface IntentReport {
  available:   true
  /** Where the report came from: Studio's own process or the app over HTTP. */
  source:      'in-process' | 'app'
  mode:        IntentMode
  enforced:    Array<{ decorator: string; order: number }>
  violations:  IntentViolationInfo[]
  slo:         SloInfo[]
  circuits:    Record<string, CircuitState | string>
  generatedAt: string
}

export interface IntentUnavailable {
  available: false
  reason:    string
}

/** GET /api/studio/intent */
export type IntentStatus = IntentReport | IntentUnavailable

const NOT_LOADED = "@axiljs/runtime is not loaded in this process. Add `import '@axiljs/runtime'` and wire(...) your services."

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

/** Coerce an untrusted report-like object into an IntentStatus. */
export function normalizeIntentReport(raw: unknown, source: IntentReport['source']): IntentStatus {
  if (!raw || typeof raw !== 'object') {
    return { available: false, reason: 'The runtime returned an empty report' }
  }
  const r = raw as Record<string, unknown>
  if (r.available === false) {
    return { available: false, reason: typeof r.reason === 'string' ? r.reason : NOT_LOADED }
  }
  const mode = r.mode === 'enforce' || r.mode === 'warn' || r.mode === 'off' ? r.mode : 'off'
  const circuits = r.circuits && typeof r.circuits === 'object' && !Array.isArray(r.circuits)
    ? { ...(r.circuits as Record<string, string>) }
    : {}
  return {
    available:   true,
    source,
    mode,
    enforced:    arr(r.enforced),
    violations:  arr(r.violations),
    slo:         arr(r.slo),
    circuits,
    generatedAt: typeof r.generatedAt === 'string' ? r.generatedAt : new Date().toISOString()
  }
}

/** Read the runtime report published in *this* process. */
export function readIntentReport(): IntentStatus {
  const fn = (globalThis as any)[INTENT_REPORT_KEY]
  if (typeof fn !== 'function') return { available: false, reason: NOT_LOADED }
  try {
    return normalizeIntentReport(fn(), 'in-process')
  } catch (err: any) {
    return { available: false, reason: `The runtime report failed: ${err?.message ?? String(err)}` }
  }
}

export interface IntentEndpointOptions {
  /** Path to answer on (default INTENT_ENDPOINT_PATH). Studio's `intentPath` must match. */
  path?:    string
  /** Serve the report (default: only when NODE_ENV is not 'production'). */
  enabled?: boolean
}

function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
}

/**
 * Dev-only handler that serves the runtime report to Studio. Works as AxilJS
 * middleware (`app.use(intentEndpoint())`) and as a plain node:http handler,
 * where it returns true when it answered the request.
 *
 * It only answers GET/HEAD on its path from a loopback address and is a no-op
 * when disabled (by default in production); everything else goes to next().
 */
export function intentEndpoint(options: IntentEndpointOptions = {}) {
  const path    = options.path ?? INTENT_ENDPOINT_PATH
  const enabled = options.enabled ?? process.env.NODE_ENV !== 'production'

  return function axilStudioIntent(req: any, res: any, next?: (err?: Error) => void): boolean {
    const rawReq   = req?.raw ?? req
    const rawRes   = res?.raw ?? res
    const method   = String(req?.method ?? rawReq?.method ?? 'GET').toUpperCase()
    const pathname = typeof req?.path === 'string' ? req.path : String(rawReq?.url ?? '').split('?')[0]

    if (!enabled || pathname !== path || (method !== 'GET' && method !== 'HEAD') ||
        !isLoopback(rawReq?.socket?.remoteAddress)) {
      if (next) next()
      return false
    }

    const body = JSON.stringify(readIntentReport())
    rawRes.writeHead(200, {
      'Content-Type':   'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control':  'no-store'
    })
    rawRes.end(method === 'HEAD' ? undefined : body)
    // Tell AxilJS' response wrapper the response is finished
    if (res && res !== rawRes && typeof res === 'object' && 'sent' in res) res.sent = true
    return true
  }
}
