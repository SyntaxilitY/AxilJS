/**
 * Interceptor registry and `wire()`.
 *
 * An interceptor turns one decorator's metadata into behaviour around a
 * method call. `wire(Class)` reads the metadata recorded by
 * @axiljs/decorator and wraps every decorated method with the interceptors
 * that apply to it, ordered by `order` (lower = outer).
 *
 * Usage:
 *   class Payments {
 *     @tAudit({ action: 'payment.charged' })
 *     @tRetry({ attempts: 3, backoff: 'exponential' })
 *     @tTimeout(2000)
 *     async charge(id: string) { ... }
 *   }
 *   wire(Payments)
 *
 * Wired methods always return a Promise.
 */

import { getAllEntries, getAllMetadata, getDecoratedMethods } from '@axiljs/decorator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Invocation {
  /** The instance (or the class, for static methods). */
  readonly target: object;
  readonly className: string;
  readonly method: string;
  readonly args: unknown[];
}

export interface Interceptor<O = any> {
  /** Decorator whose metadata activates this interceptor, e.g. 'tRetry'. */
  decorator: string;

  /** Position in the wrapper stack; lower runs outside higher. */
  order: number;

  /** Run around the call. Call `proceed()` (any number of times) to continue. */
  intercept(invocation: Invocation, options: O, proceed: () => Promise<unknown>): Promise<unknown>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, Interceptor>();

/**
 * Register (or replace) the interceptor for a decorator.
 * Only affects methods wired afterwards.
 */
export function registerInterceptor(interceptor: Interceptor): void {
  registry.set(interceptor.decorator, interceptor);
}

export function unregisterInterceptor(decorator: string): boolean {
  return registry.delete(decorator);
}

export function listInterceptors(): Interceptor[] {
  return [...registry.values()].sort((a, b) => a.order - b.order);
}

// ─── Wiring ───────────────────────────────────────────────────────────────────

const ORIGINAL = Symbol('axiljs.runtime.original');
const SIGNATURE = Symbol('axiljs.runtime.signature');

type Wrapped = ((...args: unknown[]) => Promise<unknown>) & {
  [ORIGINAL]: (...args: unknown[]) => unknown;
  [SIGNATURE]: string;
};

function wireHolder(holder: object, className: string): number {
  let count = 0;

  for (const method of getDecoratedMethods(holder)) {
    const metadata = getAllMetadata(holder, method);
    const active = listInterceptors().filter(i => metadata[i.decorator] !== undefined);
    if (active.length === 0) continue;

    const current = (holder as any)[method];
    if (typeof current !== 'function') continue; // property metadata (tRedact, tSensitive…)

    const signature = active.map(i => i.decorator).join(',');
    if (Object.prototype.hasOwnProperty.call(holder, method) && current[SIGNATURE] === signature) {
      continue; // already wired with the same stack
    }

    // A subclass inherits the parent's wrapper; rewrap the real method
    // so interceptors never run twice.
    const original: (...args: unknown[]) => unknown = current[ORIGINAL] ?? current;

    const wrapped = function (this: object, ...args: unknown[]): Promise<unknown> {
      const invocation: Invocation = { target: this, className, method, args };
      const innermost = (): Promise<unknown> => {
        try {
          return Promise.resolve(original.apply(this, args));
        } catch (err) {
          return Promise.reject(err);
        }
      };
      const chain = active.reduceRight<() => Promise<unknown>>(
        (proceed, interceptor) => () =>
          interceptor.intercept(invocation, metadata[interceptor.decorator], proceed),
        innermost
      );
      return chain();
    } as Wrapped;

    wrapped[ORIGINAL] = original;
    wrapped[SIGNATURE] = signature;
    Object.defineProperty(wrapped, 'name', { value: original.name });

    Object.defineProperty(holder, method, {
      value: wrapped,
      writable: true,
      configurable: true,
      enumerable: false
    });
    count++;
  }

  return count;
}

/**
 * Wire a class (instance and static methods) or a single prototype.
 * Safe to call more than once. Returns the class for chaining.
 */
export function wire<T extends object>(target: T): T {
  if (typeof target === 'function') {
    const name = (target as Function).name || 'anonymous';
    wireHolder((target as Function).prototype, name);
    wireHolder(target, name);
  } else {
    wireHolder(target, (target as any).constructor?.name ?? 'anonymous');
  }
  return target;
}

/**
 * Wire every class that has method metadata registered so far.
 * Call once at startup, after your modules are imported.
 * Returns the number of methods newly wired.
 */
export function wireAll(): number {
  const holders = new Set<object>();
  for (const entry of getAllEntries()) {
    if (entry.propertyKey !== undefined && entry.parameterIndex === undefined) {
      holders.add(entry.target);
    }
  }

  let count = 0;
  for (const holder of holders) {
    const name = typeof holder === 'function'
      ? (holder as Function).name
      : (holder as any).constructor?.name;
    count += wireHolder(holder, name || 'anonymous');
  }
  return count;
}

/** The undecorated method behind a wired one (for tests and debugging). */
export function unwrap<F extends Function>(fn: F): F {
  return ((fn as any)[ORIGINAL] ?? fn) as F;
}
