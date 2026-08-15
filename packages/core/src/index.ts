/**
 * @axil/core - Public API
 * Everything a developer needs to build with @axilJS.
 */

// Main application class
export { Application } from './application';

// Router for modular route definitions
export { Router } from './router/router';

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

export * from '@axil/common';
