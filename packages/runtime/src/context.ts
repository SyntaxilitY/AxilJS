/**
 * Request context.
 *
 * One AsyncLocalStorage store per request, so code deep in a call stack
 * (services, repositories, interceptors) can read the current request ID,
 * user and tenant without threading `req` through every function.
 *
 * Usage:
 *   app.use(requestContext())
 *   ...
 *   const ctx = getContext()      // undefined outside a request
 *   ctx?.requestId, ctx?.user, ctx?.tenantId
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { axilRequest, MiddlewareFn } from '@axiljs/common';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RequestContext {
  /** Correlation ID for this request (or job/task). */
  readonly requestId: string;

  /** `Date.now()` when the context was opened. */
  readonly startedAt: number;

  /** The request this context belongs to (absent for jobs/tasks). */
  readonly req?: axilRequest;

  /** `req.locals.user` (set by @axiljs/auth), read lazily. */
  readonly user?: { id: string | number; type?: string; tenantId?: string; [key: string]: unknown };

  /** `req.locals.tenant.id` (set by @axiljs/cloud) or `user.tenantId`, read lazily. */
  readonly tenantId?: string;

  /** Free-form per-request storage. */
  readonly bag: Map<string, unknown>;
}

export interface RequestContextOptions {
  /** Header to read an incoming request ID from (default: 'x-request-id'). */
  header?: string;

  /** Echo the request ID back in the response header (default: true). */
  echoHeader?: boolean;

  /** ID generator when none is supplied (default: crypto.randomUUID). */
  generateId?: () => string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

const storage = new AsyncLocalStorage<RequestContext>();

function createContext(init: { requestId?: string; req?: axilRequest; user?: RequestContext['user']; tenantId?: string }): RequestContext {
  const { req } = init;
  return {
    requestId: init.requestId ?? randomUUID(),
    startedAt: Date.now(),
    req,
    bag: new Map(),
    // Auth and tenancy middleware usually run after this one, so read lazily
    get user() {
      return init.user ?? (req?.locals?.user as RequestContext['user']);
    },
    get tenantId() {
      if (init.tenantId) return init.tenantId;
      const tenant = req?.locals?.tenant as { id?: string } | undefined;
      return tenant?.id ?? this.user?.tenantId;
    }
  };
}

/** The current context, or undefined outside `requestContext()` / `runWithContext()`. */
export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Run `fn` inside a fresh context. Use for queue jobs, cron tasks and tests,
 * where there is no HTTP request.
 */
export function runWithContext<T>(
  init: { requestId?: string; user?: RequestContext['user']; tenantId?: string },
  fn: () => T
): T {
  return storage.run(createContext(init), fn);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Open a context for every request. Register it early (before auth) so
 * everything downstream runs inside it.
 */
export function requestContext(options: RequestContextOptions = {}): MiddlewareFn {
  const {
    header = 'x-request-id',
    echoHeader = true,
    generateId = randomUUID
  } = options;

  return (req, res, next) => {
    const incoming = req.headers[header];
    const fromHeader = Array.isArray(incoming) ? incoming[0] : incoming;
    // Accept only sane IDs from clients; anything else gets a fresh one
    const valid = typeof fromHeader === 'string' && /^[\w.:-]{1,128}$/.test(fromHeader);

    const requestId =
      (typeof req.locals.requestId === 'string' && req.locals.requestId) ||
      (valid ? fromHeader : generateId());

    req.locals.requestId = requestId;
    if (echoHeader) res.header(header, requestId);

    // The chain calls the rest of the pipeline from inside next(), so the
    // store follows every downstream middleware and the handler.
    return storage.run(createContext({ requestId, req }), () => next());
  };
}
