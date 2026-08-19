"use strict";
/**
 * AxilORM — View Manager
 *
 * Create and query database views.
 *
 * Usage:
 *   await ViewManager.create('active_users', `
 *     SELECT * FROM users WHERE is_active = true
 *   `, db)
 *
 *   const users = await ViewManager.query('active_users', driver, driverType)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewManager = void 0;
const query_builder_1 = require("../query/query-builder");
class ViewManager {
    static async create(name, selectSQL, db, replace = true) {
        const keyword = replace ? 'CREATE OR REPLACE VIEW' : 'CREATE VIEW IF NOT EXISTS';
        await db.query(`${keyword} ${name} AS ${selectSQL}`);
    }
    static async drop(name, db) {
        await db.query(`DROP VIEW IF EXISTS ${name}`);
    }
    static query(name, driver, driverType) {
        return new query_builder_1.QueryBuilder(driver, driverType).from(name);
    }
}
exports.ViewManager = ViewManager;
//# sourceMappingURL=view-manager.js.map