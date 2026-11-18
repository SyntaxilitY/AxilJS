/**
 * @axiljs/core - Public API
 * Everything a developer needs to build with AxilJS.
 */

// Main application class
export { Application } from './application';

// Router for modular route definitions
export { Router } from './router/router';
export type { RouteInfo } from './router/router';

// OpenAPI 3.1 generation (also app.openapi() / app.serveOpenAPI())
export {
  generateOpenAPI,
  excludeFromOpenAPI,
  isAuthMiddleware,
  OPENAPI_VERSION,
  OPENAPI_SCHEMA_DIALECT,
  AUTH_MIDDLEWARE,
  OPENAPI_EXCLUDE
} from './openapi';
export type {
  OpenAPIOptions,
  OpenAPIDocument,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIResponse,
  OpenAPIReference,
  OpenAPIServer,
  OpenAPISchema,
  OpenAPISource
} from './openapi';

// HTTP request/response (for type usage)
export { Request } from './http/request';
export { Response } from './http/response';

// Built-in middleware
export { bodyParser } from './middleware/body-parser';
export { requestLogger } from './middleware/logger';
export { cors } from './middleware/cors';
export type { CorsOptions } from './middleware/cors';

export { serveStatic } from './middleware/static';
export type { StaticOptions } from './middleware/static';

export { createSSE, sseHeartbeat } from './middleware/sse';
export type { SSEEvent, SSEConnection } from './middleware/sse';

export * from '@axiljs/common';
