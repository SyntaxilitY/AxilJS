/**
 * Application configuration types.
 * Used when creating a new AxilJS application.
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

  // Request body size limit, e.g. '1mb', '500kb', '1024' (default: '1mb')
  bodyLimit?: string;

  // Time allowed to receive a whole request, in milliseconds. Maps to Node's
  // server.requestTimeout (clients that are too slow get 408). Unset = Node's
  // default; 0 disables it.
  timeout?: number;

  // Answer HEAD requests with the GET route when no HEAD route exists
  // (headers only, no body). Default: true
  headFallback?: boolean;

  // Reply 405 Method Not Allowed (with an Allow header) instead of 404 when
  // the path matches a route but not the method. Default: false
  methodNotAllowed?: boolean;

  // Which proxies to trust when deriving req.ip from X-Forwarded-For.
  //   true   - use the left-most X-Forwarded-For entry (default)
  //   false  - ignore X-Forwarded-For, use the socket address
  //   number - trust that many proxy hops in front of the server
  //   fn     - (address, hop) => boolean, called from the socket address
  //            outwards; the first untrusted address is the client
  trustProxy?: TrustProxy;
}

// ─── Trust Proxy ──────────────────────────────────────────────────────────────

export type TrustProxy =
  | boolean
  | number
  | ((address: string, hop: number) => boolean);

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