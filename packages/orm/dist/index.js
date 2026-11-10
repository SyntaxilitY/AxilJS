"use strict";
/**
 * @axiljs/orm — Public API
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationRunner = exports.ProcedureManager = exports.ViewManager = exports.TransactionScope = exports.Transaction = exports.TableBuilder = exports.Schema = exports.getOrCreateMeta = exports.getEntityMeta = exports.BaseModel = exports.BaseRepository = exports.eagerLoad = exports.UnsafeIdentifierError = exports.assertSortDirection = exports.isSafeIdentifier = exports.assertSafeIdentifier = exports.QueryBuilder = exports.ModelQueryBuilder = exports.entityRegistry = exports.getAllEntities = exports.getEntityMetadata = exports.CompositeIndex = exports.Index = exports.ManyToMany = exports.BelongsTo = exports.HasMany = exports.HasOne = exports.DeletedAt = exports.UpdatedAt = exports.CreatedAt = exports.Column = exports.PrimaryKey = exports.Entity = exports.MySQLDriver = exports.PostgresDriver = exports.SQLiteDriver = exports.BaseDriver = exports.createConnection = exports.ConnectionManager = void 0;
// ── Connection ────────────────────────────────────────────────────────────
var connection_manager_1 = require("./connection/connection-manager");
Object.defineProperty(exports, "ConnectionManager", { enumerable: true, get: function () { return connection_manager_1.ConnectionManager; } });
Object.defineProperty(exports, "createConnection", { enumerable: true, get: function () { return connection_manager_1.createConnection; } });
var base_driver_1 = require("./connection/base-driver");
Object.defineProperty(exports, "BaseDriver", { enumerable: true, get: function () { return base_driver_1.BaseDriver; } });
// ── Drivers ───────────────────────────────────────────────────────────────
var sqlite_driver_1 = require("./connection/sqlite-driver");
Object.defineProperty(exports, "SQLiteDriver", { enumerable: true, get: function () { return sqlite_driver_1.SQLiteDriver; } });
var postgres_driver_1 = require("./connection/postgres-driver");
Object.defineProperty(exports, "PostgresDriver", { enumerable: true, get: function () { return postgres_driver_1.PostgresDriver; } });
var mysql_driver_1 = require("./connection/mysql-driver");
Object.defineProperty(exports, "MySQLDriver", { enumerable: true, get: function () { return mysql_driver_1.MySQLDriver; } });
// ── Decorators ────────────────────────────────────────────────────────────
// Single source — everything from entity.ts
var entity_1 = require("./decorators/entity");
Object.defineProperty(exports, "Entity", { enumerable: true, get: function () { return entity_1.Entity; } });
Object.defineProperty(exports, "PrimaryKey", { enumerable: true, get: function () { return entity_1.PrimaryKey; } });
Object.defineProperty(exports, "Column", { enumerable: true, get: function () { return entity_1.Column; } });
Object.defineProperty(exports, "CreatedAt", { enumerable: true, get: function () { return entity_1.CreatedAt; } });
Object.defineProperty(exports, "UpdatedAt", { enumerable: true, get: function () { return entity_1.UpdatedAt; } });
Object.defineProperty(exports, "DeletedAt", { enumerable: true, get: function () { return entity_1.DeletedAt; } });
Object.defineProperty(exports, "HasOne", { enumerable: true, get: function () { return entity_1.HasOne; } });
Object.defineProperty(exports, "HasMany", { enumerable: true, get: function () { return entity_1.HasMany; } });
Object.defineProperty(exports, "BelongsTo", { enumerable: true, get: function () { return entity_1.BelongsTo; } });
Object.defineProperty(exports, "ManyToMany", { enumerable: true, get: function () { return entity_1.ManyToMany; } });
Object.defineProperty(exports, "Index", { enumerable: true, get: function () { return entity_1.Index; } });
Object.defineProperty(exports, "CompositeIndex", { enumerable: true, get: function () { return entity_1.CompositeIndex; } });
Object.defineProperty(exports, "getEntityMetadata", { enumerable: true, get: function () { return entity_1.getEntityMetadata; } });
Object.defineProperty(exports, "getAllEntities", { enumerable: true, get: function () { return entity_1.getAllEntities; } });
Object.defineProperty(exports, "entityRegistry", { enumerable: true, get: function () { return entity_1.entityRegistry; } });
// ── Query Builder (new — used by BaseModel) ───────────────────────────────
var query_builder_1 = require("./query/query-builder");
Object.defineProperty(exports, "ModelQueryBuilder", { enumerable: true, get: function () { return query_builder_1.QueryBuilder; } });
// ── Query Builder (original — used by BaseRepository) ────────────────────
var query_builder_2 = require("./query-builder/query-builder");
Object.defineProperty(exports, "QueryBuilder", { enumerable: true, get: function () { return query_builder_2.QueryBuilder; } });
// ── Identifier safety (orderBy / where column validation) ────────────────
var identifier_1 = require("./query/identifier");
Object.defineProperty(exports, "assertSafeIdentifier", { enumerable: true, get: function () { return identifier_1.assertSafeIdentifier; } });
Object.defineProperty(exports, "isSafeIdentifier", { enumerable: true, get: function () { return identifier_1.isSafeIdentifier; } });
Object.defineProperty(exports, "assertSortDirection", { enumerable: true, get: function () { return identifier_1.assertSortDirection; } });
Object.defineProperty(exports, "UnsafeIdentifierError", { enumerable: true, get: function () { return identifier_1.UnsafeIdentifierError; } });
// ── Relations (eager loading) ─────────────────────────────────────────────
var eager_loader_1 = require("./relations/eager-loader");
Object.defineProperty(exports, "eagerLoad", { enumerable: true, get: function () { return eager_loader_1.eagerLoad; } });
// ── Repository ────────────────────────────────────────────────────────────
var base_repository_1 = require("./repository/base-repository");
Object.defineProperty(exports, "BaseRepository", { enumerable: true, get: function () { return base_repository_1.BaseRepository; } });
// ── BaseModel (new class-based ORM) ──────────────────────────────────────
var base_model_1 = require("./model/base-model");
Object.defineProperty(exports, "BaseModel", { enumerable: true, get: function () { return base_model_1.BaseModel; } });
var model_metadata_1 = require("./model/model-metadata");
Object.defineProperty(exports, "getEntityMeta", { enumerable: true, get: function () { return model_metadata_1.getEntityMeta; } });
Object.defineProperty(exports, "getOrCreateMeta", { enumerable: true, get: function () { return model_metadata_1.getOrCreateMeta; } });
// ── Schema Builder ────────────────────────────────────────────────────────
var schema_builder_1 = require("./schema/schema-builder");
Object.defineProperty(exports, "Schema", { enumerable: true, get: function () { return schema_builder_1.Schema; } });
Object.defineProperty(exports, "TableBuilder", { enumerable: true, get: function () { return schema_builder_1.TableBuilder; } });
// ── Transaction ───────────────────────────────────────────────────────────
var transaction_manager_1 = require("./transaction/transaction-manager");
Object.defineProperty(exports, "Transaction", { enumerable: true, get: function () { return transaction_manager_1.Transaction; } });
Object.defineProperty(exports, "TransactionScope", { enumerable: true, get: function () { return transaction_manager_1.TransactionScope; } });
// ── Views ─────────────────────────────────────────────────────────────────
var view_manager_1 = require("./views/view-manager");
Object.defineProperty(exports, "ViewManager", { enumerable: true, get: function () { return view_manager_1.ViewManager; } });
// ── Procedures ────────────────────────────────────────────────────────────
var procedure_manager_1 = require("./procedures/procedure-manager");
Object.defineProperty(exports, "ProcedureManager", { enumerable: true, get: function () { return procedure_manager_1.ProcedureManager; } });
// ── Migrations ────────────────────────────────────────────────────────────
var migration_runner_1 = require("./migrations/migration-runner");
Object.defineProperty(exports, "MigrationRunner", { enumerable: true, get: function () { return migration_runner_1.MigrationRunner; } });
// ── Types ─────────────────────────────────────────────────────────────────
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map