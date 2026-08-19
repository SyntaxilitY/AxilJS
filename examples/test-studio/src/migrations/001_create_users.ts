/**
 * Migration: 001_create_users
 */

import { Migration } from '@axiljs/orm'

const migration: Migration = {
  async up(db) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       VARCHAR(255) NOT NULL,
        email      VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
  },

  async down(db) {
    await db.query('DROP TABLE IF EXISTS users')
  }
}

export default migration
