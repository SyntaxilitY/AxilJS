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
import { SQLiteDriver } from './sqlite-driver';
import { PostgresDriver } from './postgres-driver';
import { MySQLDriver } from './mysql-driver';

// ─── Connection Manager ────────────────────────────────────────────────────────

export class ConnectionManager {
  // Active driver instance
  private driver: BaseDriver;

  // Registered named connections (for multi-tenant or multi-db apps)
  private static connections = new Map<string, ConnectionManager>();

  constructor(private config: ConnectionConfig) {
    this.driver = this.createDriver(config);
  }

  /**
   * Create the correct driver instance based on config.
   */
  private createDriver(config: ConnectionConfig): BaseDriver {
    switch (config.driver) {
      case 'sqlite':
        return new SQLiteDriver(config);

      case 'postgres':
        return new PostgresDriver(config);

      case 'mysql':
        return new MySQLDriver(config);

      default:
        throw new Error(
          `Unsupported database driver: '${config.driver}'.\n` +
            `Supported drivers: postgres, mysql, sqlite, mongodb`
        );
    }
  }

  /**
   * Connect to the database.
   */
  async connect(): Promise<void> {
    await this.driver.connect();
  }

  /**
   * Disconnect from the database.
   */
  async disconnect(): Promise<void> {
    await this.driver.disconnect();
  }

  /**
   * Get the underlying driver for direct queries.
   */
  getDriver(): BaseDriver {
    return this.driver;
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.driver.isConnected();
  }

  /**
   * Register a named connection for global access.
   * Useful for multiple databases in one app.
   */
  static register(name: string, manager: ConnectionManager): void {
    this.connections.set(name, manager);
  }

  /**
   * Get a registered named connection.
   */
  static get(name: string = 'default'): ConnectionManager {
    const conn = this.connections.get(name);
    if (!conn) {
      throw new Error(
        `No database connection named '${name}' found.\n` +
          `Call ConnectionManager.register('${name}', manager) first.`
      );
    }
    return conn;
  }
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
export async function createConnection(
  config: ConnectionConfig,
  name: string = 'default'
): Promise<ConnectionManager> {
  const manager = new ConnectionManager(config);
  await manager.connect();

  // Register as named connection for global access
  ConnectionManager.register(name, manager);

  return manager;
}