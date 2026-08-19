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