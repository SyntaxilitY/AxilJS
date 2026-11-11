/**
 * @axiljs/runtime - Public API
 *
 * Executes the metadata recorded by @axiljs/decorator.
 */

export { requestContext, getContext, runWithContext } from './context';
export type { RequestContext, RequestContextOptions } from './context';

export {
  wire,
  wireAll,
  unwrap,
  registerInterceptor,
  unregisterInterceptor,
  listInterceptors
} from './interceptors';
export type { Interceptor, Invocation } from './interceptors';

export {
  TimeoutError,
  auditInterceptor,
  retryInterceptor,
  timeoutInterceptor,
  registerBuiltins
} from './builtins';

export { redact, redactResponses, redactingTransport } from './redact';
export type { RedactOptions, RedactRule } from './redact';

import { registerBuiltins } from './builtins';
registerBuiltins();
