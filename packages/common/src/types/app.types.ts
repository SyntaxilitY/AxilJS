/**
 * Application configuration types.
 * Used when creating a new @axiljsJS application.
 */

// ─── Server Config ────────────────────────────────────────────────────────────

export interface ServerConfig {
  // Port to listen on (default: 3000)
  port?: number;

  // Host to bind to (default: '0.0.0.0')
  host?: string;

  // Enable HTTP/2 (default: false - requires SSL)
  http2?: boolean;

  // SSL configuration for HTTPS
  ssl?: {
    key: string;   // Path to private key file
    cert: string;  // Path to certificate file
  };

  // Request body size limit (default: '1mb')
  bodyLimit?: string;

  // Request timeout in milliseconds (default: 30000)
  timeout?: number;
}

// ─── App Config ───────────────────────────────────────────────────────────────

export interface AppConfig {
  // Server settings
  server?: ServerConfig;

  // Environment: 'development' | 'production' | 'test'
  env?: string;

  // Enable pretty printing of JSON in development
  prettyJson?: boolean;

  // Global route prefix e.g. '/api/v1'
  prefix?: string;

  // Enable built-in request logging (default: true)
  logging?: boolean;
}

// ─── Route Definition ─────────────────────────────────────────────────────────

export interface RouteDefinition {
  // HTTP method
  method: string;

  // Route path pattern e.g. '/users/:id'
  path: string;

  // Name for identification/debugging
  name?: string;
}