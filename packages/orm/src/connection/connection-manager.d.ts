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
import { ConnectionConfig } from '../types';
import { BaseDriver } from './base-driver';
export declare class ConnectionManager {
    private config;
    private driver;
    private static connections;
    constructor(config: ConnectionConfig);
    /**
     * Create the correct driver instance based on config.
     */
    private createDriver;
    /**
     * Connect to the database.
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the database.
     */
    disconnect(): Promise<void>;
    /**
     * Get the underlying driver for direct queries.
     */
    getDriver(): BaseDriver;
    /**
     * Check if connected.
     */
    isConnected(): boolean;
    /**
     * Register a named connection for global access.
     * Useful for multiple databases in one app.
     */
    static register(name: string, manager: ConnectionManager): void;
    /**
     * Get a registered named connection.
     */
    static get(name?: string): ConnectionManager;
}
/**
 * Convenience function to create and connect in one call.
 *
 * Usage:
 *   const db = await createConnection({
 *     driver: 'postgres',
 *     url: process.env.DATABASE_URL
 *   })
 */
export declare function createConnection(config: ConnectionConfig, name?: string): Promise<ConnectionManager>;
//# sourceMappingURL=connection-manager.d.ts.map