"use strict";
/**
 * Migration: 001_create_users
 * Creates the users table.
 *
 * Run:  rest migrate
 * Roll back: rest migrate:rollback
 */
Object.defineProperty(exports, "__esModule", { value: true });
const migration = {
    async up(db) {
        // Create users table
        await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       VARCHAR(255) NOT NULL,
        email      VARCHAR(255) NOT NULL UNIQUE,
        password   VARCHAR(255) NOT NULL,
        role       VARCHAR(50)  NOT NULL DEFAULT 'user',
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);
        // Index on email for fast lookups
        await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);
        console.log('  Created table: users');
    },
    async down(db) {
        await db.query(`DROP TABLE IF EXISTS users`);
        console.log('  Dropped table: users');
    }
};
module.exports = migration;
//# sourceMappingURL=001_create_users.js.map