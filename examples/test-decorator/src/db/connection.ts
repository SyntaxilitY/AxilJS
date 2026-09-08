/**
 * Minimal in-memory "connection" stand-in for the decorator example.
 * In a real AxilJS app this would be `createConnection()` from '@axiljs/orm',
 * and the @tDatabase / @tTransaction / @tEntity decorators declared throughout
 * this example would be consumed by VacuumORM instead of these Maps.
 */

export interface Row {
  id: number
  [key: string]: unknown
}

export interface DB {
  users: Map<number, Row>
  posts: Map<number, Row>
  categories: Map<number, Row>
  comments: Map<number, Row>
  tags: Map<number, Row>
  uploads: Map<number, Row>
  notifications: Map<number, Row>
  apiKeys: Map<number, Row>
  auditLog: Row[]
  nextId: Record<string, number>
}

export async function connectDB(): Promise<DB> {
  return {
    users: new Map(),
    posts: new Map(),
    categories: new Map(),
    comments: new Map(),
    tags: new Map(),
    uploads: new Map(),
    notifications: new Map(),
    apiKeys: new Map(),
    auditLog: [],
    nextId: {
      users: 1, posts: 1, categories: 1,
      comments: 1, tags: 1, uploads: 1,
      notifications: 1, apiKeys: 1
    }
  }
}

export function nextId(db: DB, table: keyof DB['nextId']): number {
  const id = db.nextId[table]
  db.nextId[table] = id + 1
  return id
}