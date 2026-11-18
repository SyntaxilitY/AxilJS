/**
 * OpenAPI 3.x → typed TypeScript client.
 *
 * Pure: takes a parsed OpenAPI document and returns the source of one
 * dependency-free TypeScript file containing
 *   - a type for every components.schemas entry and for each operation's
 *     params / query / headers / body / response,
 *   - an ApiError class (status, code, message, body),
 *   - a client class with one typed method per operation and a
 *     create<Name>() factory.
 *
 * JSON Schema mapping: object (required / optional, additionalProperties →
 * index signature or Record), arrays and tuples, enum / const → literal
 * unions, type arrays and `nullable` → unions with null, oneOf / anyOf →
 * unions, allOf → intersections, $ref → named types, anything else → unknown.
 *
 * Output is deterministic: schemas and operations are sorted by name, so
 * regenerating from the same document produces the same file (apart from
 * the timestamp in the header, which callers may fix).
 */

export interface OpenApiDocument {
  openapi?:    string
  swagger?:    string
  info?:       { title?: string; version?: string }
  servers?:    Array<{ url?: string }>
  paths?:      Record<string, Record<string, any> | undefined>
  components?: Record<string, Record<string, any> | undefined>
  security?:   Array<Record<string, string[]>>
}

export interface GenerateClientSourceOptions {
  // Client class name (default: ApiClient); the factory is create<Name>
  name?:      string
  // Where the document came from, for the header comment
  source?:    string
  // ISO timestamp for the header (default: now); false omits the line
  timestamp?: string | false
}

export interface GeneratedClient {
  code:       string
  operations: string[]
  schemas:    string[]
  warnings:   string[]
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

// Names the generated file declares or relies on; schemas may not shadow them
const RESERVED_TYPES = new Set([
  'ApiError', 'FetchLike', 'FetchResponseLike', 'RequestOptions', 'AbortSignalLike', 'TokenProvider',
  'Array', 'Record', 'Promise', 'Error', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Map', 'Set',
  'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract', 'Symbol', 'JSON', 'Function',
  'unknown', 'never', 'any', 'object', 'string', 'number', 'boolean', 'null', 'undefined', 'void'
])

const RESERVED_METHODS = new Set(['constructor', 'request', 'baseUrl', 'token', 'headers', 'fetchFn'])

const IDENT = /^[A-Za-z_$][\w$]*$/

/** Words of an arbitrary name: "list-users_byId" → ["list", "users", "by", "Id"]. */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

export function toPascalCase(name: string): string {
  const out = words(name).map(w => w[0].toUpperCase() + w.slice(1)).join('')
  if (!out) return 'Unnamed'
  return /^\d/.test(out) ? `T${out}` : out
}

export function toCamelCase(name: string): string {
  const pascal = toPascalCase(name)
  const out = pascal[0].toLowerCase() + pascal.slice(1)
  return /^\d/.test(out) ? `op${pascal}` : out
}

function propKey(name: string): string {
  return IDENT.test(name) ? name : JSON.stringify(name)
}

function propAccess(obj: string, name: string): string {
  return IDENT.test(name) ? `${obj}.${name}` : `${obj}[${JSON.stringify(name)}]`
}

/** JSDoc block (or nothing) for a description; never closes the comment early. */
function doc(lines: Array<string | undefined>, indent: string): string {
  const text = lines
    .filter((l): l is string => typeof l === 'string' && l.trim() !== '')
    .flatMap(l => l.split(/\r?\n/))
    .map(l => l.replace(/\*\//g, '*\\/').trimEnd())
  if (text.length === 0) return ''
  if (text.length === 1) return `${indent}/** ${text[0]} */\n`
  return `${indent}/**\n${text.map(l => `${indent} *${l ? ` ${l}` : ''}`).join('\n')}\n${indent} */\n`
}

function literal(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'number' && !Number.isFinite(value) ? 'number' : JSON.stringify(value)
  }
  return 'unknown'
}

/** Split a type on a top-level operator (" | " or " & "), ignoring nested braces, brackets and strings. */
function splitTop(type: string, op: '|' | '&'): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < type.length; i++) {
    const ch = type[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if ('{[(<'.includes(ch)) depth++
    else if ('}])>'.includes(ch)) depth--
    else if (depth === 0 && ch === op && type[i - 1] === ' ' && type[i + 1] === ' ') {
      parts.push(type.slice(start, i - 1))
      start = i + 2
    }
  }
  parts.push(type.slice(start))
  return parts
}

function uniqueUnion(parts: string[]): string {
  const seen: string[] = []
  for (const p of parts.flatMap(t => splitTop(t, '|'))) if (!seen.includes(p)) seen.push(p)
  if (seen.includes('unknown')) return 'unknown'
  if (seen.length > 1 && seen.includes('never')) seen.splice(seen.indexOf('never'), 1)
  return seen.length === 0 ? 'never' : seen.join(' | ')
}

/** Parenthesize a union or intersection so it can be used as an operand of `&`. */
function group(type: string): string {
  return splitTop(type, '|').length > 1 || splitTop(type, '&').length > 1 ? `(${type})` : type
}

function arrayOf(type: string): string {
  return /^[\w$.]+$/.test(type) ? `${type}[]` : `Array<${type}>`
}

class Generator {
  private readonly doc: OpenApiDocument
  private readonly schemaNames = new Map<string, string>()   // component key → TS name
  private readonly usedTypes   = new Set<string>()
  readonly warnings: string[] = []

  constructor(document: OpenApiDocument) {
    this.doc = document
    const schemas = Object.keys(document.components?.schemas ?? {}).sort()
    for (const key of schemas) this.schemaNames.set(key, this.claimType(toPascalCase(key)))
  }

  /** Reserve a unique exported type name. */
  claimType(base: string): string {
    let name = RESERVED_TYPES.has(base) ? `${base}Schema` : base
    let i = 2
    while (this.usedTypes.has(name) || RESERVED_TYPES.has(name)) name = `${base}${i++}`
    this.usedTypes.add(name)
    return name
  }

  /** Follow a local JSON pointer ("#/components/parameters/Id"). */
  resolvePointer(ref: string): any {
    if (!ref.startsWith('#/')) {
      this.warn(`External reference "${ref}" is not supported; typed as unknown.`)
      return undefined
    }
    let node: any = this.doc
    for (const raw of ref.slice(2).split('/')) {
      const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~')
      node = node && typeof node === 'object' ? node[key] : undefined
    }
    if (node === undefined) this.warn(`Unresolved reference "${ref}"; typed as unknown.`)
    return node
  }

  /** Resolve a `$ref` object (parameter, requestBody, response) to its target, following chains. */
  deref<T = any>(value: any): T {
    let node = value
    for (let i = 0; i < 20 && node && typeof node === 'object' && typeof node.$ref === 'string'; i++) {
      node = this.resolvePointer(node.$ref)
    }
    return node as T
  }

  warn(message: string): void {
    if (!this.warnings.includes(message)) this.warnings.push(message)
  }

  get schemaKeys(): string[] {
    return [...this.schemaNames.keys()]
  }

  schemaName(key: string): string {
    return this.schemaNames.get(key) as string
  }

  // ------------------------------------------------------------------------
  // JSON Schema → TypeScript
  // ------------------------------------------------------------------------

  type(schema: any, indent = ''): string {
    if (schema === true || schema === undefined || schema === null) return 'unknown'
    if (schema === false) return 'never'
    if (typeof schema !== 'object') return 'unknown'

    if (typeof schema.$ref === 'string') {
      const m = /^#\/components\/schemas\/(.+)$/.exec(schema.$ref)
      const key = m ? decodeURIComponent(m[1]).replace(/~1/g, '/').replace(/~0/g, '~') : undefined
      const base = key !== undefined && this.schemaNames.has(key)
        ? this.schemaName(key)
        : this.type(this.resolvePointer(schema.$ref), indent)
      return schema.nullable === true ? uniqueUnion([base, 'null']) : base
    }

    const nullable = schema.nullable === true
    const withNull = (t: string): string => nullable ? uniqueUnion([t, 'null']) : t

    if ('const' in schema) return withNull(literal(schema.const))

    if (Array.isArray(schema.enum)) {
      return withNull(uniqueUnion(schema.enum.map(literal)))
    }

    // Intersection members: the schema's own shape, each allOf entry, each oneOf/anyOf union
    const composed: string[] = []
    if (Array.isArray(schema.allOf)) {
      for (const s of schema.allOf) composed.push(this.type(s, indent))
    }
    for (const key of ['oneOf', 'anyOf'] as const) {
      if (Array.isArray(schema[key]) && schema[key].length) {
        composed.push(uniqueUnion(schema[key].map((s: any) => this.type(s, indent))))
      }
    }

    const own = this.ownType(schema, indent)
    const parts = [
      // A bare `type: object` adds nothing next to composition keywords
      ...(own !== null && !(composed.length && (own === 'Record<string, unknown>' || own === 'unknown')) ? [own] : []),
      ...composed
    ].filter(p => !(p === 'unknown' && composed.length > 0))

    if (parts.length === 0) return withNull('unknown')
    return withNull(parts.length === 1 ? parts[0] : parts.map(group).join(' & '))
  }

  /** The schema's own `type` / properties / items, without composition keywords. */
  private ownType(schema: any, indent: string): string | null {
    let types: string[] | undefined
    if (Array.isArray(schema.type)) types = schema.type
    else if (typeof schema.type === 'string') types = [schema.type]
    else if (schema.properties || schema.additionalProperties !== undefined || schema.required) types = ['object']
    else if (schema.items || schema.prefixItems) types = ['array']

    if (!types) return null
    return uniqueUnion(types.map(t => this.primitive(t, schema, indent)))
  }

  private primitive(type: string, schema: any, indent: string): string {
    switch (type) {
      case 'string':  return 'string'
      case 'integer':
      case 'number':  return 'number'
      case 'boolean': return 'boolean'
      case 'null':    return 'null'
      case 'array':   return this.arrayType(schema, indent)
      case 'object':  return this.objectType(schema, indent)
      default:        return 'unknown'
    }
  }

  private arrayType(schema: any, indent: string): string {
    if (Array.isArray(schema.prefixItems)) {
      const items = schema.prefixItems.map((s: any) => this.type(s, indent))
      const rest  = schema.items === false ? '' : `, ...${arrayOf(this.type(schema.items, indent))}`
      return `[${items.join(', ')}${schema.items === undefined ? `, ...unknown[]` : rest}]`
    }
    return arrayOf(this.type(schema.items, indent))
  }

  objectType(schema: any, indent: string): string {
    const props: Record<string, any> = schema.properties && typeof schema.properties === 'object' ? schema.properties : {}
    const required = new Set<string>(Array.isArray(schema.required) ? schema.required : [])
    const keys = Object.keys(props)
    const extra = schema.additionalProperties

    if (keys.length === 0) {
      if (extra === false) return 'Record<string, never>'
      if (extra && typeof extra === 'object') return `Record<string, ${this.type(extra, indent)}>`
      return 'Record<string, unknown>'
    }

    const inner = `${indent}  `
    const lines: string[] = []
    for (const key of keys) {
      const prop = props[key]
      lines.push(
        doc([prop?.description, prop?.deprecated ? '@deprecated' : undefined], inner) +
        `${inner}${propKey(key)}${required.has(key) ? '' : '?'}: ${this.type(prop, inner)};`
      )
    }
    if (extra === true || (extra && typeof extra === 'object')) {
      // Declared properties must stay assignable to the index signature
      lines.push(`${inner}[key: string]: unknown;`)
    }
    return `{\n${lines.join('\n')}\n${indent}}`
  }

  /** `export interface X {…}` for plain objects, `export type X = …` otherwise. */
  declaration(name: string, schema: any, description?: string): string {
    const comment = doc([description ?? schema?.description, schema?.deprecated ? '@deprecated' : undefined], '')
    const plainObject = schema && typeof schema === 'object' && !schema.$ref && !schema.allOf && !schema.oneOf &&
      !schema.anyOf && !schema.enum && !('const' in schema) && schema.nullable !== true &&
      (schema.type === 'object' || (schema.type === undefined && schema.properties)) &&
      schema.properties && Object.keys(schema.properties).length > 0
    if (plainObject) return `${comment}export interface ${name} ${this.objectType(schema, '')}\n`
    return `${comment}export type ${name} = ${this.type(schema, '')};\n`
  }
}

// ==========================================================================
// OPERATIONS
// ==========================================================================

interface ParamInfo {
  name:     string
  in:       'path' | 'query' | 'header' | 'cookie'
  required: boolean
  schema:   any
  description?: string
}

interface Operation {
  method:      string
  path:        string
  methodName:  string
  typeBase:    string
  summary?:    string
  description?: string
  deprecated:  boolean
  params:      ParamInfo[]
  body?:       { required: boolean; mediaType: string; schema: any; description?: string }
  response:    { schema: any; mediaType?: string; status?: string; description?: string }
  auth:        boolean
}

function pickMedia(content: Record<string, any> | undefined): { mediaType: string; schema: any } | undefined {
  if (!content || typeof content !== 'object') return undefined
  const types = Object.keys(content)
  if (types.length === 0) return undefined
  const json = types.find(t => /^application\/json\b/i.test(t)) ??
    types.find(t => /[/+]json\b/i.test(t)) ??
    types.sort()[0]
  return { mediaType: json, schema: content[json]?.schema }
}

function collectOperations(g: Generator, document: OpenApiDocument): Operation[] {
  const ops: Operation[] = []
  const paths = document.paths ?? {}

  for (const path of Object.keys(paths).sort()) {
    const item = g.deref(paths[path]) ?? {}
    for (const method of HTTP_METHODS) {
      const op = item[method]
      if (!op || typeof op !== 'object') continue

      // Path-level parameters, overridden by operation-level ones (same name + in)
      const params = new Map<string, ParamInfo>()
      for (const raw of [...(item.parameters ?? []), ...(op.parameters ?? [])]) {
        const p = g.deref(raw)
        if (!p || typeof p.name !== 'string' || !['path', 'query', 'header', 'cookie'].includes(p.in)) continue
        const schema = p.schema ?? pickMedia(p.content)?.schema
        params.set(`${p.in}:${p.name}`, {
          name: p.name, in: p.in, required: p.in === 'path' ? true : p.required === true, schema, description: p.description
        })
      }
      // Path placeholders that were never declared still need a value
      for (const m of path.matchAll(/\{([^}]+)\}/g)) {
        if (!params.has(`path:${m[1]}`)) {
          params.set(`path:${m[1]}`, { name: m[1], in: 'path', required: true, schema: { type: 'string' } })
        }
      }

      let body: Operation['body']
      if (op.requestBody) {
        const rb = g.deref(op.requestBody)
        const media = pickMedia(rb?.content)
        if (media) body = { required: rb.required === true, mediaType: media.mediaType, schema: media.schema, description: rb.description }
      }

      const responses: Record<string, any> = op.responses ?? {}
      const statuses = Object.keys(responses)
      const success = statuses.filter(s => /^2\d\d$/.test(s)).sort()[0] ??
        statuses.find(s => /^2XX$/i.test(s)) ??
        statuses.find(s => s === 'default')
      let response: Operation['response'] = { schema: undefined }
      if (success) {
        const r = g.deref(responses[success])
        const media = pickMedia(r?.content)
        response = media
          ? { schema: media.schema, mediaType: media.mediaType, status: success, description: r?.description }
          : { schema: undefined, status: success, description: r?.description }
      }

      const security = op.security ?? document.security
      const auth = Array.isArray(security) && security.some(req => req && Object.keys(req).length > 0)

      const id = typeof op.operationId === 'string' && op.operationId.trim()
        ? op.operationId
        : `${method} ${path.replace(/\{([^}]+)\}/g, 'by $1')}`

      ops.push({
        method: method.toUpperCase(),
        path,
        methodName: toCamelCase(id),
        typeBase: toPascalCase(id),
        summary: op.summary,
        description: op.description,
        deprecated: op.deprecated === true,
        params: [...params.values()],
        body,
        response,
        auth
      })
    }
  }

  // Unique, sorted method names
  ops.sort((a, b) => a.methodName.localeCompare(b.methodName) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
  const seen = new Set<string>()
  for (const op of ops) {
    let name = RESERVED_METHODS.has(op.methodName) ? `${op.methodName}Operation` : op.methodName
    const base = name
    for (let i = 2; seen.has(name); i++) name = `${base}${i}`
    if (name !== op.methodName) {
      g.warn(`Operation ${op.method} ${op.path} was renamed to ${name} (name clash).`)
      op.typeBase = toPascalCase(name)
    }
    op.methodName = name
    seen.add(name)
  }
  return ops
}

function paramsObject(g: Generator, params: ParamInfo[], indent: string): string {
  const inner = `${indent}  `
  const lines = params
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => doc([p.description], inner) + `${inner}${propKey(p.name)}${p.required ? '' : '?'}: ${g.type(p.schema, inner)};`)
  return `{\n${lines.join('\n')}\n${indent}}`
}

/** Template literal for the request path: `/users/${encodePath(input.params.id)}`. */
function pathExpression(path: string): string {
  const escape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  let out = ''
  let last = 0
  for (const m of path.matchAll(/\{([^}]+)\}/g)) {
    out += escape(path.slice(last, m.index))
    out += `\${encodePath(${propAccess('input.params', m[1])})}`
    last = (m.index ?? 0) + m[0].length
  }
  out += escape(path.slice(last))
  return `\`${out}\``
}

const ENCODE_PATH = `function encodePath(value: unknown): string {
  return encodeURIComponent(String(value));
}

`

// ==========================================================================
// RUNTIME (emitted verbatim)
// ==========================================================================

function runtime(className: string, defaultBaseUrl: string, pathParams: boolean): string {
  return `// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/** Minimal fetch signature, so this file needs neither DOM nor Node typings. */
export type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignalLike;
}) => Promise<FetchResponseLike>;

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface AbortSignalLike {
  readonly aborted: boolean;
}

export type TokenProvider = string | null | undefined | (() => string | null | undefined | Promise<string | null | undefined>);

export interface ${className}Options {
  /** Base URL of the API, without a trailing slash${defaultBaseUrl ? ` (default: ${JSON.stringify(defaultBaseUrl)})` : ''} */
  baseUrl?: string;
  /** Bearer token (or a function returning one) for operations that require authentication */
  token?: TokenProvider;
  /** fetch implementation (default: globalThis.fetch) */
  fetch?: FetchLike;
  /** Headers sent with every request */
  headers?: Record<string, string>;
}

export interface RequestOptions {
  signal?: AbortSignalLike;
  headers?: Record<string, string>;
}

/** Thrown for every non-2xx response. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;

  constructor(status: number, code: string, message: string, body?: unknown) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function errorFromResponse(status: number, statusText: string, body: unknown): ApiError {
  let code = \`HTTP_\${status}\`;
  let message = statusText || \`Request failed with status \${status}\`;
  if (body !== null && typeof body === 'object') {
    const root = body as Record<string, unknown>;
    const err = root.error !== null && typeof root.error === 'object' ? root.error as Record<string, unknown> : root;
    if (typeof err.code === 'string' || typeof err.code === 'number') code = String(err.code);
    if (typeof err.message === 'string' && err.message) message = err.message;
    else if (typeof root.error === 'string' && root.error) message = root.error;
  } else if (typeof body === 'string' && body.trim()) {
    message = body.trim().slice(0, 500);
  }
  return new ApiError(status, code, message, body);
}

${pathParams ? ENCODE_PATH : ''}function encodeQuery(query: object | undefined): string {
  if (!query) return '';
  const parts: string[] = [];
  const add = (key: string, value: unknown): void => {
    if (value === undefined || value === null) return;
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    parts.push(\`\${encodeURIComponent(key)}=\${encodeURIComponent(text)}\`);
  };
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (Array.isArray(value)) for (const item of value) add(key, item);
    else add(key, value);
  }
  return parts.join('&');
}

interface RequestSpec {
  query?: object;
  headers?: object;
  body?: unknown;
  mediaType?: string;
  auth: boolean;
}

export class ${className} {
  private readonly baseUrl: string;
  private readonly token: TokenProvider;
  private readonly headers: Record<string, string>;
  private readonly fetchFn: FetchLike;

  constructor(options: ${className}Options = {}) {
    this.baseUrl = (options.baseUrl ?? ${JSON.stringify(defaultBaseUrl)}).replace(/\\/+$/, '');
    this.token = options.token;
    this.headers = { ...options.headers };
    const fetchImpl = options.fetch ?? (globalThis as unknown as { fetch?: FetchLike }).fetch;
    if (!fetchImpl) throw new Error('No fetch implementation available: pass options.fetch');
    this.fetchFn = (url, init) => fetchImpl.call(globalThis, url, init);
  }

  private async request<T>(method: string, path: string, spec: RequestSpec, options?: RequestOptions): Promise<T> {
    let url = this.baseUrl + path;
    const qs = encodeQuery(spec.query);
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;

    const headers: Record<string, string> = { accept: 'application/json', ...this.headers };
    if (spec.headers) {
      for (const [key, value] of Object.entries(spec.headers as Record<string, unknown>)) {
        if (value !== undefined && value !== null) headers[key] = String(value);
      }
    }
    if (spec.auth) {
      const token = typeof this.token === 'function' ? await this.token() : this.token;
      if (token) headers.authorization = \`Bearer \${token}\`;
    }

    let body: string | undefined;
    if (spec.body !== undefined) {
      const mediaType = spec.mediaType ?? 'application/json';
      if (/json/i.test(mediaType)) body = JSON.stringify(spec.body);
      else if (/x-www-form-urlencoded/i.test(mediaType)) body = encodeQuery(spec.body as object);
      else body = typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body);
      headers['content-type'] = mediaType;
    }
    if (options?.headers) Object.assign(headers, options.headers);

    const res = await this.fetchFn(url, { method, headers, body, signal: options?.signal });
    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
      const type = res.headers.get('content-type') ?? '';
      if (!type || /json/i.test(type)) {
        try { data = JSON.parse(text); } catch { data = text; }
      } else {
        data = text;
      }
    }
    if (!res.ok) throw errorFromResponse(res.status, res.statusText, data);
    return data as T;
  }
`
}

// ==========================================================================
// ENTRY POINT
// ==========================================================================

export function generateClientSource(document: OpenApiDocument, options: GenerateClientSourceOptions = {}): GeneratedClient {
  if (!document || typeof document !== 'object') throw new Error('The OpenAPI document must be a JSON object.')
  if (document.swagger) throw new Error(`Swagger ${document.swagger} documents are not supported; use OpenAPI 3.x.`)
  if (typeof document.openapi !== 'string' || !/^3\./.test(document.openapi)) {
    throw new Error(`Not an OpenAPI 3.x document (openapi: ${JSON.stringify(document.openapi)}).`)
  }

  const className = options.name ?? 'ApiClient'
  if (!IDENT.test(className) || RESERVED_TYPES.has(className)) {
    throw new Error(`Invalid client name "${className}": use a TypeScript identifier such as ApiClient.`)
  }

  const g = new Generator(document)
  // Names the runtime section declares
  for (const n of [className, `${className}Options`, 'RequestSpec']) g.claimType(n)

  const ops = collectOperations(g, document)
  const out: string[] = []

  // Header
  const title = [document.info?.title, document.info?.version ? `v${document.info.version}` : undefined].filter(Boolean).join(' ')
  const timestamp = options.timestamp === false ? undefined : (options.timestamp ?? new Date().toISOString())
  out.push([
    '/* eslint-disable */',
    '// Generated by axil generate client. Do not edit: regenerate instead.',
    ...(options.source ? [`// Source: ${options.source.replace(/[\r\n]/g, ' ')}`] : []),
    ...(title ? [`// API: ${title.replace(/[\r\n]/g, ' ')} (OpenAPI ${document.openapi})`] : []),
    ...(timestamp ? [`// Generated at: ${timestamp}`] : []),
    ''
  ].join('\n'))

  // Component schemas
  const schemas = document.components?.schemas ?? {}
  if (g.schemaKeys.length) {
    out.push('// ---------------------------------------------------------------------------\n// Schemas\n// ---------------------------------------------------------------------------\n')
    for (const key of g.schemaKeys) out.push(g.declaration(g.schemaName(key), schemas[key]))
  }

  // Operation types
  interface OpTypes { input?: string; inputOptional: boolean; response: string; hasPath: boolean; hasQuery: boolean; hasHeaders: boolean; hasBody: boolean }
  const opTypes = new Map<Operation, OpTypes>()
  if (ops.length) {
    out.push('// ---------------------------------------------------------------------------\n// Operations\n// ---------------------------------------------------------------------------\n')
  }
  for (const op of ops) {
    const path    = op.params.filter(p => p.in === 'path')
    const query   = op.params.filter(p => p.in === 'query')
    const headers = op.params.filter(p => p.in === 'header')
    const cookies = op.params.filter(p => p.in === 'cookie')
    if (cookies.length) g.warn(`${op.methodName}: cookie parameters are not supported and were skipped.`)

    const fields: string[] = []
    let requiredInput = false
    const decls: string[] = []

    if (path.length) {
      const name = g.claimType(`${op.typeBase}Params`)
      decls.push(`export interface ${name} ${paramsObject(g, path, '')}\n`)
      fields.push(`  params: ${name};`)
      requiredInput = true
    }
    if (query.length) {
      const name = g.claimType(`${op.typeBase}Query`)
      const required = query.some(p => p.required)
      decls.push(`export interface ${name} ${paramsObject(g, query, '')}\n`)
      fields.push(`  query${required ? '' : '?'}: ${name};`)
      requiredInput = requiredInput || required
    }
    if (headers.length) {
      const name = g.claimType(`${op.typeBase}Headers`)
      const required = headers.some(p => p.required)
      decls.push(`export interface ${name} ${paramsObject(g, headers, '')}\n`)
      fields.push(`  headers${required ? '' : '?'}: ${name};`)
      requiredInput = requiredInput || required
    }
    if (op.body) {
      const name = g.claimType(`${op.typeBase}Body`)
      const bodyType = /json|x-www-form-urlencoded/i.test(op.body.mediaType) ? op.body.schema : { type: 'string' }
      decls.push(g.declaration(name, bodyType, op.body.description))
      fields.push(`  body${op.body.required ? '' : '?'}: ${name};`)
      requiredInput = requiredInput || op.body.required
    }

    const responseName = g.claimType(`${op.typeBase}Response`)
    const responseSchema = op.response.schema === undefined
      ? undefined
      : op.response.mediaType && !/json/i.test(op.response.mediaType) ? { type: 'string' } : op.response.schema
    decls.push(responseSchema === undefined
      ? `${doc([op.response.description], '')}export type ${responseName} = void;\n`
      : g.declaration(responseName, responseSchema, op.response.description))

    let inputName: string | undefined
    if (fields.length) {
      inputName = g.claimType(`${op.typeBase}Input`)
      decls.push(`export interface ${inputName} {\n${fields.join('\n')}\n}\n`)
    }

    out.push(decls.join('\n'))
    opTypes.set(op, {
      input: inputName,
      inputOptional: !requiredInput,
      response: responseName,
      hasPath: path.length > 0,
      hasQuery: query.length > 0,
      hasHeaders: headers.length > 0,
      hasBody: !!op.body
    })
  }

  // Runtime + client
  const server = document.servers?.[0]?.url ?? ''
  const defaultBaseUrl = /\{[^}]+\}/.test(server) ? '' : server.replace(/\/+$/, '')
  if (/\{[^}]+\}/.test(server)) g.warn(`Server URL ${server} has variables; pass baseUrl explicitly.`)
  out.push(runtime(className, defaultBaseUrl, ops.some(o => o.params.some(p => p.in === 'path'))))

  for (const op of ops) {
    const t = opTypes.get(op) as OpTypes
    const comment = doc([
      `${op.method} ${op.path}`,
      op.summary,
      op.description && op.description !== op.summary ? op.description : undefined,
      op.auth ? 'Requires a bearer token.' : undefined,
      op.deprecated ? '@deprecated' : undefined
    ], '  ')
    const args = t.input
      ? `input: ${t.input}${t.inputOptional ? ' = {}' : ''}, options?: RequestOptions`
      : 'options?: RequestOptions'
    const spec = [
      ...(t.hasQuery ? ['query: input.query'] : []),
      ...(t.hasHeaders ? ['headers: input.headers'] : []),
      ...(t.hasBody ? ['body: input.body', `mediaType: ${JSON.stringify(op.body?.mediaType)}`] : []),
      `auth: ${op.auth}`
    ]
    const pathExpr = t.hasPath ? pathExpression(op.path) : JSON.stringify(op.path)
    out.push(
      `\n${comment}` +
      `  ${op.methodName}(${args}): Promise<${t.response}> {\n` +
      `    return this.request<${t.response}>(${JSON.stringify(op.method)}, ${pathExpr}, { ${spec.join(', ')} }, options);\n` +
      '  }\n'
    )
  }
  out[out.length - 1] += '}\n'

  out.push(
    `\n/** Factory for ${className}: create${className}({ baseUrl, token }). */\n` +
    `export function create${className}(options: ${className}Options = {}): ${className} {\n` +
    `  return new ${className}(options);\n` +
    '}\n'
  )

  return {
    code: out.join('\n').replace(/\n{3,}/g, '\n\n'),
    operations: ops.map(o => o.methodName),
    schemas: g.schemaKeys.map(k => g.schemaName(k)),
    warnings: g.warnings
  }
}

/** True when `source` was written by this generator (safe to overwrite). */
export function isGeneratedClient(source: string): boolean {
  return /^\/\* eslint-disable \*\/\r?\n\/\/ Generated by axil generate client\./.test(source)
}
