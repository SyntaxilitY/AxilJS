/**
 * OpenAPI 3.1 generation from a running AxilJS application.
 *
 * Usage:
 *   const doc = generateOpenAPI(app, { title: 'Shop API', version: '1.0.0' })
 *   // or app.openapi({...}) / app.serveOpenAPI('/openapi.json', {...})
 *
 * What it reads (core has no dependency on @axiljs/validation; everything
 * is duck-typed):
 *   - Routes: app.routes() - method, path (mount prefixes applied) and the
 *     middleware chain. Routes registered with all() and wildcard (*)
 *     routes are skipped (no single OpenAPI operation describes them), as
 *     are handlers marked with excludeFromOpenAPI().
 *   - Schemas: any middleware carrying `fn[Symbol.for('axiljs.validation.schemas')]`
 *     or `fn.schemas` shaped `{ body?, params?, query? }`. Each schema is
 *     converted with its toJSONSchema() method (validate() from
 *     @axiljs/validation provides both); a plain JSON Schema object is used
 *     as-is. With several validation middleware, a later one wins per location.
 *   - Auth: a route is marked with the bearer security requirement when a
 *     middleware in its chain has `fn[Symbol.for('axiljs.auth')]` set, or -
 *     HEURISTIC - its function name contains authenticate, requireAuth,
 *     requireRole, requirePermission or requireOwnership. Middleware
 *     returned by factories are usually anonymous arrow functions, so give
 *     them a name or the marker, or pass `isAuthMiddleware`.
 *
 * Document shape (stable; client generators may rely on it):
 *   - openapi '3.1.0', jsonSchemaDialect JSON Schema 2020-12.
 *   - Paths: ':id' becomes '{id}'; each path param is a required 'path'
 *     parameter whose schema comes from the params schema (default string).
 *     Routes of the same shape (/users/:id, /users/:userId) share the param
 *     names of the first one, since OpenAPI treats them as one path.
 *   - Query params: one 'query' parameter per property of the query schema,
 *     required per its `required` list.
 *   - Request body: 'application/json', schema stored as
 *     components.schemas.<OperationId>Body and referenced with $ref;
 *     required unless the body schema accepts undefined.
 *   - operationId: lower-case method + PascalCase path segments, ':param'
 *     segments as 'By<Param>' (GET /users/:id -> getUsersById, GET / ->
 *     getRoot); a numeric suffix (2, 3, …) keeps them unique.
 *   - Success: 201 for POST, 200 otherwise (HEAD: no content), content
 *     components.schemas.Envelope ({ status, code, message, data }); `data`
 *     is unconstrained because handler output is not introspectable.
 *   - Errors: components.responses.Error -> components.schemas.ErrorResponse
 *     ({ error: { code, message } }) for '422' (routes with validation),
 *     '401' + '403' (routes with auth), '404' (routes with path params),
 *     and always '4XX' + '5XX'.
 *   - Security: components.securitySchemes.bearerAuth (HTTP bearer, JWT),
 *     present only when at least one route requires it.
 */

import { RouteHandler } from '@axiljs/common';
import { RouteInfo } from './router/router';

// ─── Constants ────────────────────────────────────────────────────────────────

export const OPENAPI_VERSION = '3.1.0';

/** JSON Schema 2020-12 - the default dialect of OpenAPI 3.1. */
export const OPENAPI_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** Key validate() (@axiljs/validation) uses to expose its schemas. */
const VALIDATION_SCHEMAS = Symbol.for('axiljs.validation.schemas');

/** Set (truthy) on a middleware function to mark it as authentication. */
export const AUTH_MIDDLEWARE = Symbol.for('axiljs.auth');

/** Set (truthy) on a route handler to leave the route out of the document. */
export const OPENAPI_EXCLUDE = Symbol.for('axiljs.openapi.exclude');

const AUTH_NAME = /authenticate|requireAuth|requireRole|requirePermission|requireOwnership/i;

const LOCATIONS = ['body', 'params', 'query'] as const;
type Location = typeof LOCATIONS[number];

// ─── Types ────────────────────────────────────────────────────────────────────

/** A JSON Schema 2020-12 object (as embedded in OpenAPI 3.1). */
export type OpenAPISchema = { [keyword: string]: unknown };

export interface OpenAPIServer {
  url: string;
  description?: string;
}

export interface OpenAPIOptions {
  // info.title
  title: string;

  // info.version (the API's version, not AxilJS's)
  version: string;

  // info.description
  description?: string;

  // Top-level servers, e.g. [{ url: 'http://localhost:3000' }]
  servers?: OpenAPIServer[];

  // Replaces the default auth detection (see isAuthMiddleware())
  isAuthMiddleware?: (fn: Function) => boolean;
}

export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  schema: OpenAPISchema;
}

export interface OpenAPIReference {
  $ref: string;
}

export interface OpenAPIResponse {
  description: string;
  content?: Record<string, { schema: OpenAPISchema | OpenAPIReference }>;
}

export interface OpenAPIOperation {
  operationId: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required: boolean;
    content: Record<string, { schema: OpenAPISchema | OpenAPIReference }>;
  };
  responses: Record<string, OpenAPIResponse | OpenAPIReference>;
  security?: Array<Record<string, string[]>>;
}

export interface OpenAPIDocument {
  openapi: string;
  jsonSchemaDialect: string;
  info: { title: string; version: string; description?: string };
  servers?: OpenAPIServer[];
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components: {
    schemas: Record<string, OpenAPISchema>;
    responses: Record<string, OpenAPIResponse>;
    securitySchemes?: Record<string, OpenAPISchema>;
  };
}

/** Anything that can list its routes (an Application). */
export interface OpenAPISource {
  routes(): RouteInfo[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mark a route handler so generateOpenAPI() skips its route
 * (serveOpenAPI() marks its own handler this way).
 */
export function excludeFromOpenAPI<T extends RouteHandler>(handler: T): T {
  Object.defineProperty(handler, OPENAPI_EXCLUDE, { value: true });
  return handler;
}

/**
 * Default auth detection: the Symbol.for('axiljs.auth') marker, or a
 * function name containing authenticate / requireAuth / requireRole /
 * requirePermission / requireOwnership (heuristic).
 */
export function isAuthMiddleware(fn: Function): boolean {
  if ((fn as any)[AUTH_MIDDLEWARE]) return true;
  return typeof fn.name === 'string' && AUTH_NAME.test(fn.name);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON Schema of a validator (toJSONSchema()) or a plain schema object. */
function schemaToJSON(schema: unknown): OpenAPISchema | undefined {
  let json: unknown = schema;
  if (schema && typeof (schema as any).toJSONSchema === 'function') {
    json = (schema as any).toJSONSchema();
  } else if (typeof schema === 'function') {
    return undefined;
  }
  // Round-trip: an independent, JSON-safe copy
  return isPlainObject(json) ? JSON.parse(JSON.stringify(json)) : undefined;
}

/** Validation schemas carried by a middleware function, if any. */
function schemasOf(fn: Function): Partial<Record<Location, unknown>> | undefined {
  const holder = (fn as any)[VALIDATION_SCHEMAS] ?? (fn as any).schemas;
  if (!isPlainObject(holder)) return undefined;

  const out: Partial<Record<Location, unknown>> = {};
  for (const location of LOCATIONS) {
    const schema = holder[location];
    if (schema !== undefined && schemaToJSON(schema)) out[location] = schema;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** True if a (validator-like) body schema accepts a missing body. */
function acceptsUndefined(schema: unknown): boolean {
  if (!schema || typeof (schema as any).parse !== 'function') return false;
  try {
    return (schema as any).parse(undefined)?.success === true;
  } catch {
    return false;
  }
}

function pascal(text: string): string {
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join('');
}

/** '/users/:id' -> getUsersById (before de-duplication). */
function baseOperationId(method: string, segments: string[]): string {
  const name = segments.length === 0
    ? 'Root'
    : segments
      .map(s => (s.startsWith(':') ? 'By' + pascal(s.slice(1)) : pascal(s)))
      .join('');
  return method.toLowerCase() + (name || 'Root');
}

const ref = (path: string): OpenAPIReference => ({ $ref: path });
const ERROR_RESPONSE = '#/components/responses/Error';

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Build an OpenAPI 3.1 document from an application's routes.
 * See the file header for exactly what is emitted.
 */
export function generateOpenAPI(
  app: OpenAPISource,
  options: OpenAPIOptions
): OpenAPIDocument {
  const isAuth = options.isAuthMiddleware ?? isAuthMiddleware;

  const doc: OpenAPIDocument = {
    openapi: OPENAPI_VERSION,
    jsonSchemaDialect: OPENAPI_SCHEMA_DIALECT,
    info: {
      title: options.title,
      version: options.version,
      ...(options.description !== undefined && { description: options.description })
    },
    ...(options.servers && options.servers.length > 0 && {
      servers: options.servers.map(server => ({ ...server }))
    }),
    paths: {},
    components: {
      schemas: {
        Envelope: {
          type: 'object',
          description: 'Standard AxilJS response envelope (res.success / res.created / …).',
          properties: {
            status: { type: 'integer', description: 'HTTP status code' },
            code: { type: 'string', description: "Status name, e.g. 'HTTP_200_OK'" },
            message: { type: 'string' },
            data: { description: 'Response payload (handler-specific, not described).' }
          },
          required: ['status', 'code', 'message', 'data']
        },
        ErrorResponse: {
          type: 'object',
          description: 'AxilJS error body.',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', description: "Error code, e.g. 'NOT_FOUND'" },
                message: { type: 'string' },
                stack: { type: 'string', description: 'Outside production only.' }
              },
              required: ['code', 'message']
            }
          },
          required: ['error']
        }
      },
      responses: {
        Error: {
          description: 'Error',
          content: {
            'application/json': { schema: ref('#/components/schemas/ErrorResponse') }
          }
        }
      }
    }
  };

  const usedIds = new Set<string>();
  // Path shape ('/users/:') -> the param names first used for it: OpenAPI
  // treats '/users/{id}' and '/users/{userId}' as the same (conflicting)
  // path, so routes of one shape share the first route's names
  const shapes = new Map<string, string[]>();
  let anyAuth = false;

  for (const route of app.routes()) {
    if (route.method === '*') continue;
    if ((route.handler as any)?.[OPENAPI_EXCLUDE]) continue;

    let segments = route.path.split('/').filter(Boolean);
    if (segments.includes('*')) continue;

    const shape = segments.map(s => (s.startsWith(':') ? ':' : s)).join('/');
    const firstNames = shapes.get(shape);
    // first-used name -> this route's own name (for its params schema)
    let renamed: Map<string, string> | undefined;
    if (firstNames) {
      // Rename params positionally; keep the route's schemas reachable
      const own = segments.filter(s => s.startsWith(':')).map(s => s.slice(1));
      let i = 0;
      segments = segments.map(s => (s.startsWith(':') ? ':' + firstNames[i++] : s));
      renamed = new Map(own.map((name, j) => [firstNames[j], name]));
    } else {
      shapes.set(shape, segments.filter(s => s.startsWith(':')).map(s => s.slice(1)));
    }

    const method = route.method.toLowerCase();
    const openapiPath = '/' + segments
      .map(s => (s.startsWith(':') ? `{${s.slice(1)}}` : s))
      .join('/');

    // Unique operationId
    const baseId = baseOperationId(method, segments);
    let operationId = baseId;
    for (let n = 2; usedIds.has(operationId); n++) operationId = baseId + n;
    usedIds.add(operationId);

    // Validation schemas (later middleware wins per location)
    const schemas: Partial<Record<Location, unknown>> = {};
    for (const fn of route.middleware) {
      if (typeof fn !== 'function') continue;
      Object.assign(schemas, schemasOf(fn));
    }
    const json: Partial<Record<Location, OpenAPISchema>> = {};
    for (const location of LOCATIONS) {
      if (schemas[location] !== undefined) json[location] = schemaToJSON(schemas[location]);
    }

    const operation: OpenAPIOperation = { operationId, responses: {} };

    // Parameters: path, then query
    const parameters: OpenAPIParameter[] = [];
    const pathParams = segments.filter(s => s.startsWith(':')).map(s => s.slice(1));
    const paramProps = isPlainObject(json.params?.properties)
      ? (json.params!.properties as Record<string, OpenAPISchema>)
      : {};
    for (const name of pathParams) {
      parameters.push({
        name,
        in: 'path',
        required: true,
        schema: isPlainObject(paramProps[renamed?.get(name) ?? name])
          ? paramProps[renamed?.get(name) ?? name]
          : { type: 'string' }
      });
    }

    const queryProps = isPlainObject(json.query?.properties)
      ? (json.query!.properties as Record<string, OpenAPISchema>)
      : {};
    const queryRequired = Array.isArray(json.query?.required)
      ? (json.query!.required as string[])
      : [];
    for (const [name, schema] of Object.entries(queryProps)) {
      parameters.push({
        name,
        in: 'query',
        required: queryRequired.includes(name),
        schema: isPlainObject(schema) ? schema : {}
      });
    }
    if (parameters.length > 0) operation.parameters = parameters;

    // Request body -> named component
    if (json.body) {
      const name = pascal(operationId) + 'Body';
      doc.components.schemas[name] = json.body;
      operation.requestBody = {
        required: !acceptsUndefined(schemas.body),
        content: {
          'application/json': { schema: ref(`#/components/schemas/${name}`) }
        }
      };
    }

    // Responses
    if (method === 'head') {
      operation.responses['200'] = { description: 'Successful response (headers only)' };
    } else {
      operation.responses[method === 'post' ? '201' : '200'] = {
        description: method === 'post' ? 'Created' : 'Successful response',
        content: {
          'application/json': { schema: ref('#/components/schemas/Envelope') }
        }
      };
    }

    const auth = route.middleware.some(fn => typeof fn === 'function' && isAuth(fn));
    if (auth) {
      anyAuth = true;
      operation.security = [{ bearerAuth: [] }];
      operation.responses['401'] = ref(ERROR_RESPONSE);
      operation.responses['403'] = ref(ERROR_RESPONSE);
    }
    if (pathParams.length > 0) operation.responses['404'] = ref(ERROR_RESPONSE);
    if (Object.keys(json).length > 0) operation.responses['422'] = ref(ERROR_RESPONSE);
    operation.responses['4XX'] = ref(ERROR_RESPONSE);
    operation.responses['5XX'] = ref(ERROR_RESPONSE);

    (doc.paths[openapiPath] ??= {})[method] = operation;
  }

  if (anyAuth) {
    doc.components.securitySchemes = {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    };
  }

  return doc;
}
