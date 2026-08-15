/**
 * Migration: Create all e-commerce tables
 *
 * Tables: users, products, orders, order_items
 */

import { Migration } from '@axiljs/orm'

const migration: Migration = {
  async up(db) {
    // Users
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100)  NOT NULL,
        email       VARCHAR(255)  NOT NULL UNIQUE,
        password    VARCHAR(255)  NOT NULL,
        role        VARCHAR(20)   NOT NULL DEFAULT 'customer',
        created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
      )
    `)

    // Products
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(200)  NOT NULL,
        description TEXT,
        price       DECIMAL(10,2) NOT NULL CHECK (price >= 0),
        stock       INTEGER       NOT NULL DEFAULT 0 CHECK (stock >= 0),
        category    VARCHAR(100),
        active      BOOLEAN       NOT NULL DEFAULT true,
        created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP     NOT NULL DEFAULT NOW()
      )
    `)

    // Orders
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER       NOT NULL REFERENCES users(id),
        status      VARCHAR(20)   NOT NULL DEFAULT 'pending',
        total       DECIMAL(10,2) NOT NULL DEFAULT 0,
        address     TEXT,
        created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP     NOT NULL DEFAULT NOW()
      )
    `)

    // Order Items
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id          SERIAL PRIMARY KEY,
        order_id    INTEGER       NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id  INTEGER       NOT NULL REFERENCES products(id),
        quantity    INTEGER       NOT NULL CHECK (quantity > 0),
        price       DECIMAL(10,2) NOT NULL,
        created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
      )
    `)

    // Indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`)
  },

  async down(db) {
    await db.query(`DROP TABLE IF EXISTS order_items`)
    await db.query(`DROP TABLE IF EXISTS orders`)
    await db.query(`DROP TABLE IF EXISTS products`)
    await db.query(`DROP TABLE IF EXISTS users`)
  }
}

module.exports = migration