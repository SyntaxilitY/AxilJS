/**
 * Built-in interceptors.
 *
 *   order 100  tAudit    one audit event per logical call (after all retries)
 *   order 200  tRetry    @axiljs/circuit retry()
 *   order 300  tTimeout  per-attempt deadline
 *
 * Intent verification (./intent) and resilience (./resilience) interceptors
 * are registered here too; see those files for their order numbers.
 *
 * Events go to the global @axiljs/events bus:
 *   'audit.log'      same AuditEvent shape as @axiljs/cloud's auditLog()
 *   'runtime.retry'  { target, attempt, delayMs, error }
 */

import { retry } from '@axiljs/circuit';
import type { TAuditOptions, TRetryOptions } from '@axiljs/decorator';
import { getContext } from './context';
import { redact } from './redact';
import { emitSafe } from './emit';
import { label } from './keys';
import { registerInterceptor } from './interceptors';
import type { Interceptor } from './interceptors';
import { registerIntentInterceptors } from './intent';
import { registerResilienceInterceptors } from './resilience';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export class TimeoutError extends Error {
  readonly code = 'ETIMEDOUT';

  constructor(public readonly target: string, public readonly timeoutMs: number) {
    super(`${target} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

// ─── tTimeout ─────────────────────────────────────────────────────────────────

export const timeoutInterceptor: Interceptor<{ ms: number }> = {
  decorator: 'tTimeout',
  order: 300,
  intercept(inv, { ms }, proceed) {
    if (!Number.isFinite(ms) || ms <= 0) return proceed();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new TimeoutError(label(inv), ms)), ms);
      timer.unref?.();
      proceed().then(
        value => { clearTimeout(timer); resolve(value); },
        error => { clearTimeout(timer); reject(error); }
      );
    });
  }
};

// ─── tRetry ───────────────────────────────────────────────────────────────────

export const retryInterceptor: Interceptor<TRetryOptions> = {
  decorator: 'tRetry',
  order: 200,
  intercept(inv, options, proceed) {
    const retryOn = options.retryOn;
    return retry(proceed, {
      attempts: options.attempts,
      delay: options.delay,
      backoff: options.backoff,
      maxDelay: options.maxDelay,
      // Match by error name ('TimeoutError') or code ('ECONNRESET')
      retryIf: retryOn?.length
        ? err => retryOn.includes(err.name) || retryOn.includes((err as any).code)
        : undefined,
      onRetry: (attempt, error, delayMs) =>
        emitSafe('runtime.retry', { target: label(inv), attempt, delayMs, error: error.message })
    });
  }
};

// ─── tAudit ───────────────────────────────────────────────────────────────────

export const auditInterceptor: Interceptor<TAuditOptions> = {
  decorator: 'tAudit',
  order: 100,
  async intercept(inv, options, proceed) {
    const started = Date.now();
    let result: unknown;
    let failure: unknown;

    try {
      result = await proceed();
      return result;
    } catch (err) {
      failure = err;
      throw err;
    } finally {
      const ctx = getContext();
      const user = ctx?.user;
      const req = ctx?.req;
      const metadata: Record<string, unknown> = {
        target: label(inv),
        durationMs: Date.now() - started
      };
      if (options.compliance?.length) metadata.compliance = options.compliance;
      if (options.sensitivity) metadata.sensitivity = options.sensitivity;
      if (options.includeRequest) metadata.args = redact(inv.args);
      if (options.includeResponse && failure === undefined) metadata.result = redact(result);

      emitSafe('audit.log', {
        action: options.action,
        actor: user
          ? { id: user.id, type: user.type ?? 'user' }
          : { id: 'system', type: 'system' },
        tenantId: ctx?.tenantId,
        requestId: ctx?.requestId,
        metadata,
        ip: req?.ip,
        userAgent: req?.headers?.['user-agent'] as string | undefined,
        success: failure === undefined,
        error: failure === undefined
          ? undefined
          : failure instanceof Error ? failure.message : String(failure),
        timestamp: new Date().toISOString()
      });
    }
  }
};

/** Register the built-ins. Called on import of the package entry. */
export function registerBuiltins(): void {
  registerInterceptor(auditInterceptor);
  registerInterceptor(retryInterceptor);
  registerInterceptor(timeoutInterceptor);
  registerIntentInterceptors();
  registerResilienceInterceptors();
}
