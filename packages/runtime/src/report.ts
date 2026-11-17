/**
 * Which decorators the runtime enforces, for tooling (CLI, Studio) and tests.
 */

import { listInterceptors } from './interceptors';

/** Decorator names that have a registered interceptor, outermost first. */
export function enforcedDecorators(): Array<{ decorator: string; order: number }> {
  return listInterceptors().map(i => ({ decorator: i.decorator, order: i.order }));
}
