/**
 * Typed errors raised by the governance wrappers.
 *
 * Both extend axilError from @axiljs/common, so an AxilJS error handler
 * (and aiChat / aiEmbed / aiAgent) turns them into proper 4xx responses.
 */

import { axilError } from '@axiljs/common';

export type BudgetMetric = 'tokens' | 'costUsd' | 'requests';
export type BudgetWindow = 'minute' | 'hour' | 'day' | 'month';

export interface AIBudgetExceededDetails {
  // Budget scope that ran out (e.g. a tenant id, or 'global')
  scope: string;

  // Window whose limit would be exceeded
  window: BudgetWindow;

  // Which limit would be exceeded
  metric: BudgetMetric;

  // Configured limit for that metric in that window
  limit: number;

  // Amount already used in the current window (before this request)
  used: number;

  // Amount this request was estimated to need
  requested: number;

  // Milliseconds until the window resets (usable as Retry-After)
  retryAfterMs: number;

  // Model the request was evaluated against
  model: string;
}

/**
 * Thrown by withBudget() before the provider is called, when the estimated
 * cost of a request would exceed a configured limit. HTTP 429.
 */
export class AIBudgetExceededError extends axilError {
  declare readonly details: AIBudgetExceededDetails;
  readonly retryAfterMs: number;

  constructor(details: AIBudgetExceededDetails) {
    super(
      `AI budget exceeded for scope "${details.scope}": ${details.metric} limit ` +
      `${details.limit} per ${details.window} (used ${round(details.used)}, ` +
      `request needs ~${round(details.requested)})`,
      429,
      'AI_BUDGET_EXCEEDED',
      details
    );
    this.name = 'AIBudgetExceededError';
    this.retryAfterMs = details.retryAfterMs;
  }
}

export interface AIPolicyViolationDetails {
  // Detector types that matched (never the matched values)
  types: string[];

  // Where they matched, e.g. 'messages[2]' or 'system'
  locations: string[];
}

/**
 * Thrown by withRedaction({ mode: 'block' }) when outgoing content contains
 * sensitive data. The provider is never called. HTTP 422.
 */
export class AIPolicyViolationError extends axilError {
  declare readonly details: AIPolicyViolationDetails;

  constructor(details: AIPolicyViolationDetails) {
    super(
      `AI request blocked: sensitive data detected (${details.types.join(', ')})`,
      422,
      'AI_POLICY_VIOLATION',
      details
    );
    this.name = 'AIPolicyViolationError';
  }
}

/**
 * Thrown by replayProvider() in strict mode when a request has no recorded
 * response in the fixture file.
 */
export class AIReplayMissError extends Error {
  readonly code = 'AI_REPLAY_MISS';
  readonly key: string;
  readonly file: string;

  constructor(message: string, key: string, file: string) {
    super(message);
    this.name = 'AIReplayMissError';
    this.key = key;
    this.file = file;
  }
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(6).replace(/0+$/, '');
}
