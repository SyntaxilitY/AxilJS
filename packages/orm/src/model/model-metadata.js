"use strict";
/**
 * AxilORM — Model Metadata Bridge
 * Re-exports from decorators/entity.ts — single registry.
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.entityRegistry = exports.getAllEntities = exports.getEntityMeta = void 0;
exports.getOrCreateMeta = getOrCreateMeta;
var entity_1 = require("../decorators/entity");
Object.defineProperty(exports, "getEntityMeta", { enumerable: true, get: function () { return entity_1.getEntityMetadata; } });
Object.defineProperty(exports, "getAllEntities", { enumerable: true, get: function () { return entity_1.getAllEntities; } });
Object.defineProperty(exports, "entityRegistry", { enumerable: true, get: function () { return entity_1.entityRegistry; } });
// getOrCreateMeta — needed by old decorator files if any remain
const entity_2 = require("../decorators/entity");
function getOrCreateMeta(target) {
    if (!entity_2.entityRegistry.has(target)) {
        entity_2.entityRegistry.set(target, {
            tableName: '',
            primaryKey: 'id',
            columns: new Map(),
            relations: new Map(),
            indexes: []
        });
    }
    return entity_2.entityRegistry.get(target);
}
//# sourceMappingURL=model-metadata.js.map