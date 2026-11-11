/**
 * Axil ORM Studio — Shared Types
 */

export interface RouteInfo {
  method:      string
  path:        string
  handler:     string
  middleware:  string[]
  description?: string
}

export interface WebSocketInfo {
  path:   string
  events: string[]
}

export interface SSEInfo {
  path:    string
  events:  string[]
}

export interface TableInfo {
  name:    string
  columns: ColumnInfo[]
  rowCount: number
}

export interface ColumnInfo {
  name:       string
  type:       string
  nullable:   boolean
  primary:    boolean
  unique:     boolean
  default?:   unknown
}

export interface ForeignKeyInfo {
  column:    string
  refTable:  string
  refColumn: string
}

export interface IndexInfo {
  name:    string
  columns: string[]
  unique:  boolean
}

/** A table with its constraints (GET /api/studio/schema). */
export interface TableSchema extends TableInfo {
  foreignKeys: ForeignKeyInfo[]
  indexes:     IndexInfo[]
}

/** One filter chip in the data grid: GET /api/studio/table/:name?filter=[...] */
export interface RowFilter {
  column: string
  op:     'eq' | 'neq' | 'contains' | 'starts' | 'gt' | 'gte' | 'lt' | 'lte' | 'null' | 'notnull'
  value?: unknown
}

export interface RowQuery {
  limit?:   number
  offset?:  number
  sort?:    string
  dir?:     'asc' | 'desc'
  /** Case-insensitive "contains" across every column. */
  search?:  string
  filters?: RowFilter[]
}

export interface TableRow {
  [key: string]: unknown
}

export interface StudioConfig {
  port:        number
  host:        string
  appPort:     number
  appName:     string
  dbDriver?:   string
  dbFile?:     string
  dbUrl?:      string
  enableQR:    boolean
  /**
   * Extra Host header values (hostname only, no port) Studio answers to.
   * localhost, 127.0.0.1, [::1] and `host` are always allowed; any other
   * Host is rejected with 403 (DNS-rebinding protection).
   */
  allowedHosts?: string[]
  /** Maximum POST body size in bytes (default 1 MB); larger bodies get 413. */
  maxBodyBytes?: number
  /** Open the Studio URL in the default browser on start (default true). */
  openBrowser?:  boolean
  /** Project directory scanned for routes / used to resolve dbFile (default process.cwd()). */
  cwd?:          string
}

export interface StudioData {
  appName:    string
  appUrl:     string
  studioUrl:  string
  dbDriver:   string | null
  routes:     RouteInfo[]
  websockets: WebSocketInfo[]
  sse:        SSEInfo[]
  tables:     TableInfo[]
  startedAt:  string
}