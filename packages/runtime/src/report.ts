/**
 * Runtime status for tooling (CLI, Studio) and tests.
 *
 * `runtimeReport()` is also published on
 * `globalThis[Symbol.for('axiljs.runtime.report')]`, so tools running in the
 * same process (Studio) can read it without depending on this package.
 */

import { listInterceptors } from './interceptors';
import { getIntentMode, getIntentViolations, getSloReport } from './intent';
import type { IntentMode, IntentViolation, SloReport } from './intent';
import { getCircuitStates } from './resilience';

/** Decorator names that have a registered interceptor, outermost first. */
export function enforcedDecorators(): Array<{ decorator: string; order: number }> {
  return listInterceptors().map(i => ({ decorator: i.decorator, order: i.order }));
}

export interface RuntimeReport {
  mode: IntentMode;
  enforced: Array<{ decorator: string; order: number }>;
  violations: IntentViolation[];
  slo: SloReport[];
  circuits: Record<string, string>;
  generatedAt: string;
}

/** Snapshot of intent mode, enforced decorators, violations, SLOs and circuit states. */
export function runtimeReport(): RuntimeReport {
  return {
    mode: getIntentMode(),
    enforced: enforcedDecorators(),
    violations: getIntentViolations(),
    slo: getSloReport(),
    circuits: getCircuitStates(),
    generatedAt: new Date().toISOString()
  };
}

(globalThis as any)[Symbol.for('axiljs.runtime.report')] = runtimeReport;
