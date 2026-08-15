/**
 * Database connection using @axiljs/orm
 * Configured for NeonDB (PostgreSQL with SSL)
 */

import { createConnection, ConnectionManager } from '@axiljs/orm'
import { config } from './config'

let db: ConnectionManager

export async function connectDB(): Promise<ConnectionManager> {
  db = await createConnection({
    driver:  'postgres',
    url:     config.DATABASE_URL,
    logging: config.NODE_ENV === 'development',
    ssl:     { rejectUnauthorized: false },
    pool:    { min: 1, max: 5 }
  })

  return db
}

export function getDB(): ConnectionManager {
  if (!db) throw new Error('Database not connected. Call connectDB() first.')
  return db
}