/**
 * AxilORM — Model Metadata Bridge
 * Re-exports from decorators/entity.ts — single registry.
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 */
export { getEntityMetadata as getEntityMeta, getAllEntities, entityRegistry } from '../decorators/entity';
export type { ColumnType, ColumnMeta, RelationMeta, IndexMeta, EntityMeta } from '../decorators/entity';
import type { EntityMeta } from '../decorators/entity';
type Constructor = new (...args: any[]) => any;
export declare function getOrCreateMeta(target: Constructor): EntityMeta;
//# sourceMappingURL=model-metadata.d.ts.map