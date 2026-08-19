// src/db/setup.ts

/**
 * Database setup — creates schema and seeds data.
 * Call this once during application startup.
 */

import type { ConnectionManager } from '@axiljs/orm'
import { createSchema }  from './schema.js'
import { seedDatabase }  from './seed.js'

export async function setupDatabase(db: ConnectionManager): Promise<void> {
  await createSchema(db)
  await seedDatabase(db)
}