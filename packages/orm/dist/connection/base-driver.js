"use strict";
/**
 * Abstract base class for all database drivers.
 * Each driver (postgres, mysql, sqlite, mongodb) extends this.
 * The query builder and repository talk to this interface.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseDriver = void 0;
class BaseDriver {
    config;
    connected = false;
    constructor(config) {
        this.config = config;
    }
    /**
     * Get the connected state.
     */
    isConnected() {
        return this.connected;
    }
    /**
     * Log a query if logging is enabled.
     */
    log(sql, params) {
        if (this.config.logging) {
            console.log(`\x1b[90m[@axiljsJS ORM]\x1b[0m ${sql}`, params?.length ? params : '');
        }
    }
}
exports.BaseDriver = BaseDriver;
//# sourceMappingURL=base-driver.js.map