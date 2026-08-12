"use strict";
/**
 * Connection Manager.
 * Creates the correct driver based on config and manages the lifecycle.
 * This is the entry point for all database operations.
 *
 * Usage:
 *   const db = await createConnection({ driver: 'sqlite', filename: './dev.db' })
 *   const users = await db.query('SELECT * FROM users')
 *   await db.disconnect()
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
exports.createConnection = createConnection;
const sqlite_driver_1 = require("./sqlite-driver");
const postgres_driver_1 = require("./postgres-driver");
const mysql_driver_1 = require("./mysql-driver");
// ─── Connection Manager ────────────────────────────────────────────────────────
class ConnectionManager {
    config;
    // Active driver instance
    driver;
    // Registered named connections (for multi-tenant or multi-db apps)
    static connections = new Map();
    constructor(config) {
        this.config = config;
        this.driver = this.createDriver(config);
    }
    /**
     * Create the correct driver instance based on config.
     */
    createDriver(config) {
        switch (config.driver) {
            case 'sqlite':
                return new sqlite_driver_1.SQLiteDriver(config);
            case 'postgres':
                return new postgres_driver_1.PostgresDriver(config);
            case 'mysql':
                return new mysql_driver_1.MySQLDriver(config);
            default:
                throw new Error(`Unsupported database driver: '${config.driver}'.\n` +
                    `Supported drivers: postgres, mysql, sqlite, mongodb`);
        }
    }
    /**
     * Connect to the database.
     */
    async connect() {
        await this.driver.connect();
    }
    /**
     * Disconnect from the database.
     */
    async disconnect() {
        await this.driver.disconnect();
    }
    /**
     * Get the underlying driver for direct queries.
     */
    getDriver() {
        return this.driver;
    }
    /**
     * Check if connected.
     */
    isConnected() {
        return this.driver.isConnected();
    }
    /**
     * Register a named connection for global access.
     * Useful for multiple databases in one app.
     */
    static register(name, manager) {
        this.connections.set(name, manager);
    }
    /**
     * Get a registered named connection.
     */
    static get(name = 'default') {
        const conn = this.connections.get(name);
        if (!conn) {
            throw new Error(`No database connection named '${name}' found.\n` +
                `Call ConnectionManager.register('${name}', manager) first.`);
        }
        return conn;
    }
}
exports.ConnectionManager = ConnectionManager;
/**
 * Convenience function to create and connect in one call.
 *
 * Usage:
 *   const db = await createConnection({
 *     driver: 'postgres',
 *     url: process.env.DATABASE_URL
 *   })
 */
async function createConnection(config, name = 'default') {
    const manager = new ConnectionManager(config);
    await manager.connect();
    // Register as named connection for global access
    ConnectionManager.register(name, manager);
    return manager;
}
//# sourceMappingURL=connection-manager.js.map