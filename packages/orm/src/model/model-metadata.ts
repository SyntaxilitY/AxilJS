/**
 * AxilORM — Model Metadata Bridge
 * Re-exports from decorators/entity.ts — single registry.
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 */

export {
  getEntityMetadata  as getEntityMeta,
  getAllEntities,
  entityRegistry
} from '../decorators/entity'

export type {
  ColumnType,
  ColumnMeta,
  RelationMeta,
  IndexMeta,
  EntityMeta
} from '../decorators/entity'

// getOrCreateMeta — needed by old decorator files if any remain
import { entityRegistry } from '../decorators/entity'
import type { EntityMeta } from '../decorators/entity'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor = new (...args: any[]) => any

export function getOrCreateMeta(target: Constructor): EntityMeta {
  if (!entityRegistry.has(target)) {
    entityRegistry.set(target, {
      tableName:  '',
      primaryKey: 'id',
      columns:    new Map(),
      relations:  new Map(),
      indexes:    []
    })
  }
  return entityRegistry.get(target)!
}