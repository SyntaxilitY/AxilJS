/**
 * withBudget() - token / cost / request budgets for any AIProvider.
 *
 *   const ai = withBudget(new OpenAIProvider({ apiKey }), {
 *     limits: [
 *       { window: 'minute', requests: 60 },
 *       { window: 'month',  costUsd: 50 }
 *     ],
 *     scope: () => getContext()?.tenantId,
 *     pricing: { 'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 } }
 *   })
 *
 * Every call is checked BEFORE the provider is invoked: the prompt is
 * estimated at ~4 characters per token and the output at `maxTokens`
 * (or `defaultMaxTokens`). The estimate is reserved in the store, so
 * concurrent requests cannot jointly overrun a limit; once the provider
 * answers, the reservation is replaced by the usage it actually reported.
 */

import {
  AIProvider, CompletionOptions, CompletionResponse, CompletionStream,
  EmbeddingOptions, EmbeddingResponse, Message
} from '../types';
import { AIBudgetExceededError, BudgetMetric, BudgetWindow } from './errors';

export type { BudgetWindow, BudgetMetric } from './errors';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BudgetAmounts {
  tokens: number;
  costUsd: number;
  requests: number;
}

// One limit per window; omit a metric to leave it unlimited
export interface BudgetLimit {
  window: BudgetWindow;
  tokens?: number;
  costUsd?: number;
  requests?: number;
}

// USD per million tokens
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

// A concrete window instance, e.g. { name: 'day', start: <00:00 UTC>, end: <24:00 UTC> }
export interface BudgetWindowRef {
  name: BudgetWindow;
  start: number; // epoch ms, inclusive
  end: number;   // epoch ms, exclusive
}

/**
 * Persistence for budget counters.
 *
 * A row is identified by (scope, window.name, window.start). `add` must be
 * atomic and return the totals after the increment (amounts can be negative
 * to release a reservation). A SQL implementation is a single
 * `INSERT ... ON CONFLICT (scope, window, start) DO UPDATE SET tokens = tokens + ?, ...
 * RETURNING tokens, cost_usd, requests`; `window.end` is there for expiry.
 */
export interface BudgetStore {
  add(scope: string, window: BudgetWindowRef, amounts: BudgetAmounts): Promise<BudgetAmounts> | BudgetAmounts;
  get(scope: string, window: BudgetWindowRef): Promise<BudgetAmounts> | BudgetAmounts;
}

export interface BudgetOptions {
  // One limit or several (e.g. per-minute requests plus a monthly cost cap)
  limits: BudgetLimit | BudgetLimit[];

  // Budget scope for the current call (e.g. tenant id). Default: the
  // @axiljs/runtime request context's tenantId when available, else 'global'.
  scope?: () => string | undefined;

  // Price table keyed by model. Lookup: exact name, then the longest key that
  // prefixes the model ('gpt-4o' matches 'gpt-4o-2024-08-06'), then '*'.
  // Models without a price cost 0 USD.
  pricing?: Record<string, ModelPricing>;

  // Counter storage (default: in-memory, per process)
  store?: BudgetStore;

  // 'reject' (default) throws AIBudgetExceededError; 'fallback-model' retries
  // the estimate with `fallbackModel` and uses it if it fits.
  onExceeded?: 'reject' | 'fallback-model';
  fallbackModel?: string;

  // Output tokens to assume when a call has no maxTokens (default: 0)
  defaultMaxTokens?: number;

  // Clock, for tests (default: Date.now)
  now?: () => number;
}

export interface BudgetUsage {
  scope: string;
  window: BudgetWindow;
  start: number;
  end: number;
  used: BudgetAmounts;
  limits: Partial<BudgetAmounts>;
  remaining: Partial<BudgetAmounts>;
}

export interface BudgetedProvider extends AIProvider {
  // Current usage of `scope` (default: the scope of the current call context)
  getUsage(scope?: string): Promise<BudgetUsage[]>;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

interface MemoryEntry extends BudgetAmounts { end: number }

/**
 * Default BudgetStore: per-process counters. Expired windows are dropped
 * whenever a new window row is created.
 */
export class InMemoryBudgetStore implements BudgetStore {
  private rows = new Map<string, MemoryEntry>();

  add(scope: string, window: BudgetWindowRef, amounts: BudgetAmounts): BudgetAmounts {
    const key = rowKey(scope, window);
    let row = this.rows.get(key);
    if (!row) {
      for (const [k, r] of this.rows) if (r.end <= window.start) this.rows.delete(k);
      row = { tokens: 0, costUsd: 0, requests: 0, end: window.end };
      this.rows.set(key, row);
    }
    row.tokens += amounts.tokens;
    row.costUsd += amounts.costUsd;
    row.requests += amounts.requests;
    return { tokens: row.tokens, costUsd: row.costUsd, requests: row.requests };
  }

  get(scope: string, window: BudgetWindowRef): BudgetAmounts {
    const row = this.rows.get(rowKey(scope, window));
    return row
      ? { tokens: row.tokens, costUsd: row.costUsd, requests: row.requests }
      : { tokens: 0, costUsd: 0, requests: 0 };
  }

  clear(): void {
    this.rows.clear();
  }
}

function rowKey(scope: string, window: BudgetWindowRef): string {
  return `${scope}\u0000${window.name}\u0000${window.start}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** UTC-aligned window containing `now`. */
export function windowFor(name: BudgetWindow, now: number): BudgetWindowRef {
  const d = new Date(now);
  switch (name) {
    case 'minute': {
      const start = Math.floor(now / 60_000) * 60_000;
      return { name, start, end: start + 60_000 };
    }
    case 'hour': {
      const start = Math.floor(now / 3_600_000) * 3_600_000;
      return { name, start, end: start + 3_600_000 };
    }
    case 'day': {
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      return { name, start, end: start + 86_400_000 };
    }
    case 'month': {
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      return { name, start, end };
    }
    default:
      throw new Error(`Unknown budget window: ${String(name)}`);
  }
}

/** Rough token estimate: ~4 characters per token. */
export function estimateTokens(text: string): number {
  return text ? Math.ceil(text.length / 4) : 0;
}

function estimatePromptTokens(options: CompletionOptions): number {
  let chars = options.system?.length ?? 0;
  for (const m of options.messages as Message[]) {
    chars += m.content?.length ?? 0;
    if (m.toolCalls?.length) chars += JSON.stringify(m.toolCalls).length;
  }
  if (options.tools?.length) chars += JSON.stringify(options.tools).length;
  return Math.ceil(chars / 4);
}

export function priceFor(pricing: Record<string, ModelPricing> | undefined, model: string): ModelPricing | undefined {
  if (!pricing) return undefined;
  if (pricing[model]) return pricing[model];
  let best: string | undefined;
  for (const key of Object.keys(pricing)) {
    if (key !== '*' && model.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? pricing[best] : pricing['*'];
}

function costOf(pricing: Record<string, ModelPricing> | undefined, model: string, input: number, output: number): number {
  const p = priceFor(pricing, model);
  if (!p) return 0;
  return (input * p.inputPerMTok + output * p.outputPerMTok) / 1_000_000;
}

// Lazily resolved @axiljs/runtime (optional; ai does not depend on it)
let runtimeLookup: { getContext?: () => { tenantId?: string } | undefined } | null | undefined;

/**
 * Tenant id from @axiljs/runtime's request context, if that package is
 * installed and a request context is active. Resolved with a lazy require()
 * inside try/catch, so @axiljs/ai has no dependency on @axiljs/runtime.
 */
export function runtimeTenantId(): string | undefined {
  if (runtimeLookup === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      runtimeLookup = require('@axiljs/runtime');
    } catch {
      runtimeLookup = null;
    }
  }
  try {
    return runtimeLookup?.getContext?.()?.tenantId ?? undefined;
  } catch {
    return undefined;
  }
}

const ZERO: BudgetAmounts = { tokens: 0, costUsd: 0, requests: 0 };
const METRICS: BudgetMetric[] = ['requests', 'tokens', 'costUsd'];

function negate(a: BudgetAmounts): BudgetAmounts {
  return { tokens: -a.tokens, costUsd: -a.costUsd, requests: -a.requests };
}

function diff(a: BudgetAmounts, b: BudgetAmounts): BudgetAmounts {
  return { tokens: a.tokens - b.tokens, costUsd: a.costUsd - b.costUsd, requests: a.requests - b.requests };
}

// ─── withBudget ───────────────────────────────────────────────────────────────

interface Reservation {
  scope: string;
  windows: BudgetWindowRef[];
  amounts: BudgetAmounts;
}

/**
 * Wrap a provider with budget enforcement. The result implements AIProvider
 * and can be wrapped again (withRedaction, recordingProvider, ...).
 */
export function withBudget(provider: AIProvider, options: BudgetOptions): BudgetedProvider {
  const limits = Array.isArray(options.limits) ? options.limits : [options.limits];
  if (!limits.length) throw new Error('withBudget: at least one limit is required');
  if (options.onExceeded === 'fallback-model' && !options.fallbackModel) {
    throw new Error("withBudget: onExceeded 'fallback-model' requires fallbackModel");
  }
  const store = options.store ?? new InMemoryBudgetStore();
  const now = options.now ?? Date.now;

  const resolveScope = (): string => options.scope?.() ?? runtimeTenantId() ?? 'global';

  // Atomically reserve `amounts` in every window; roll back and throw if any limit breaks
  async function reserve(scope: string, model: string, amounts: BudgetAmounts): Promise<Reservation> {
    const t = now();
    const done: BudgetWindowRef[] = [];
    for (const limit of limits) {
      const win = windowFor(limit.window, t);
      const totals = await store.add(scope, win, amounts);
      done.push(win);
      for (const metric of METRICS) {
        const max = limit[metric];
        if (max === undefined || totals[metric] <= max) continue;
        for (const w of done) await store.add(scope, w, negate(amounts));
        throw new AIBudgetExceededError({
          scope, window: limit.window, metric, limit: max, model,
          used: Math.max(0, totals[metric] - amounts[metric]),
          requested: amounts[metric],
          retryAfterMs: Math.max(0, win.end - t)
        });
      }
    }
    return { scope, windows: done, amounts };
  }

  // Replace a reservation with the actual amounts (null = release entirely)
  async function settle(r: Reservation, actual: BudgetAmounts | null): Promise<void> {
    const delta = actual ? diff(actual, r.amounts) : negate(r.amounts);
    if (!delta.tokens && !delta.costUsd && !delta.requests) return;
    for (const w of r.windows) await store.add(r.scope, w, delta);
  }

  function estimate(model: string, input: number, output: number): BudgetAmounts {
    return { tokens: input + output, costUsd: costOf(options.pricing, model, input, output), requests: 1 };
  }

  // Pre-check a completion; may switch to the fallback model
  async function admit(opts: CompletionOptions): Promise<{ opts: CompletionOptions; reservation: Reservation }> {
    const scope = resolveScope();
    const model = opts.model ?? provider.defaultModel;
    const input = estimatePromptTokens(opts);
    const output = opts.maxTokens ?? options.defaultMaxTokens ?? 0;
    try {
      return { opts, reservation: await reserve(scope, model, estimate(model, input, output)) };
    } catch (err) {
      if (!(err instanceof AIBudgetExceededError) || options.onExceeded !== 'fallback-model') throw err;
      const fallback = options.fallbackModel as string;
      if (fallback === model) throw err;
      const reservation = await reserve(scope, fallback, estimate(fallback, input, output));
      return { opts: { ...opts, model: fallback }, reservation };
    }
  }

  function actualFor(res: CompletionResponse, fallbackModel: string): BudgetAmounts {
    const input = res.usage?.promptTokens ?? 0;
    const output = res.usage?.completionTokens ?? 0;
    const total = res.usage?.totalTokens || input + output;
    return { tokens: total, costUsd: costOf(options.pricing, res.model || fallbackModel, input, output), requests: 1 };
  }

  const wrapped: BudgetedProvider = {
    name: provider.name,
    defaultModel: provider.defaultModel,

    async complete(opts: CompletionOptions): Promise<CompletionResponse> {
      const { opts: call, reservation } = await admit(opts);
      let res: CompletionResponse;
      try {
        res = await provider.complete(call);
      } catch (err) {
        await settle(reservation, null);
        throw err;
      }
      await settle(reservation, actualFor(res, call.model ?? provider.defaultModel));
      return res;
    },

    async *stream(opts: CompletionOptions): CompletionStream {
      const { opts: call, reservation } = await admit(opts);
      let actual: BudgetAmounts | undefined;
      let failed = false;
      try {
        for await (const chunk of provider.stream(call)) {
          if (chunk.done && chunk.response) actual = actualFor(chunk.response, call.model ?? provider.defaultModel);
          yield chunk;
        }
      } catch (err) {
        failed = true;
        throw err;
      } finally {
        // Completed: actual usage. Failed: release. Abandoned by the consumer
        // mid-stream: keep the estimate (tokens were likely generated).
        if (actual) await settle(reservation, actual);
        else if (failed) await settle(reservation, null);
      }
    },

    async embed(opts: EmbeddingOptions): Promise<EmbeddingResponse> {
      const scope = resolveScope();
      const model = opts.model ?? provider.defaultModel;
      const inputs = Array.isArray(opts.input) ? opts.input : [opts.input];
      const input = inputs.reduce((n, s) => n + estimateTokens(s), 0);
      const reservation = await reserve(scope, model, estimate(model, input, 0));
      let res: EmbeddingResponse;
      try {
        res = await provider.embed(opts);
      } catch (err) {
        await settle(reservation, null);
        throw err;
      }
      const tokens = res.usage?.totalTokens ?? 0;
      await settle(reservation, { tokens, costUsd: costOf(options.pricing, res.model || model, tokens, 0), requests: 1 });
      return res;
    },

    async getUsage(scope?: string): Promise<BudgetUsage[]> {
      const s = scope ?? resolveScope();
      const t = now();
      const out: BudgetUsage[] = [];
      for (const limit of limits) {
        const win = windowFor(limit.window, t);
        const used = { ...ZERO, ...(await store.get(s, win)) };
        const lim: Partial<BudgetAmounts> = {};
        const remaining: Partial<BudgetAmounts> = {};
        for (const metric of METRICS) {
          const max = limit[metric];
          if (max === undefined) continue;
          lim[metric] = max;
          remaining[metric] = Math.max(0, max - used[metric]);
        }
        out.push({ scope: s, window: limit.window, start: win.start, end: win.end, used, limits: lim, remaining });
      }
      return out;
    }
  };

  return wrapped;
}
