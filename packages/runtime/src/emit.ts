/**
 * Emit a runtime event on the global @axiljs/events bus without letting a
 * failing subscriber break the business call.
 */

import { getGlobalEventBus } from '@axiljs/events';

export function emitSafe(type: string, payload: unknown): void {
  try {
    getGlobalEventBus()
      .emit(type, payload)
      .catch(err => process.emitWarning(`[@axiljs/runtime] '${type}' subscriber failed: ${err?.message ?? err}`));
  } catch (err: any) {
    process.emitWarning(`[@axiljs/runtime] could not emit '${type}': ${err?.message ?? err}`);
  }
}
