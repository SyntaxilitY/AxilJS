// src/db/schema.ts

/**
 * Database schema — creates all tables, indexes, and views.
 * Designed to exercise every Studio feature:
 *   - Multiple tables with varied column types
 *   - Primary keys, unique constraints, nullable columns, defaults
 *   - Foreign key relationships
 *   - Indexes (unique and non-unique, single and composite)
 *   - Views
 *   - Enough variety to test schema display, data grid, pagination
 */

import type { ConnectionManager } from '@axiljs/orm'

export async function createSchema(db: ConnectionManager): Promise<void> {
  const driver = (db as any).driver ?? (db as any).connection ?? db

  async function run(sql: string): Promise<void> {
    if (typeof driver.exec === 'function') {
      await driver.exec(sql)
    } else if (typeof driver.query === 'function') {
      await driver.query(sql)
    } else if (typeof driver.run === 'function') {
      await driver.run(sql)
    } else {
      throw new Error('Cannot execute SQL — no exec/query/run method found on driver')
    }
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      name          TEXT    NOT NULL,
      avatar_url    TEXT    DEFAULT NULL,
      role          TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('admin','editor','user','viewer')),
      is_active     INTEGER NOT NULL DEFAULT 1,
      email_verified INTEGER NOT NULL DEFAULT 0,
      login_count   INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT    DEFAULT NULL,
      bio           TEXT    DEFAULT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ── Categories ─────────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      slug        TEXT    NOT NULL UNIQUE,
      description TEXT    DEFAULT NULL,
      color       TEXT    NOT NULL DEFAULT '#6b7385',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_visible  INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ── Tags ───────────────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS tags (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      slug       TEXT    NOT NULL UNIQUE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ── Posts ──────────────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS posts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id  INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
      title        TEXT    NOT NULL,
      slug         TEXT    NOT NULL UNIQUE,
      excerpt      TEXT    DEFAULT NULL,
      content      TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published','archived')),
      is_featured  INTEGER NOT NULL DEFAULT 0,
      view_count   INTEGER NOT NULL DEFAULT 0,
      published_at TEXT    DEFAULT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ── Post-Tags (many-to-many junction) ──────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS post_tags (
      post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      tag_id     INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (post_id, tag_id)
    )
  `)

  // ── Comments ───────────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id  INTEGER DEFAULT NULL REFERENCES comments(id) ON DELETE CASCADE,
      body       TEXT    NOT NULL,
      is_edited  INTEGER NOT NULL DEFAULT 0,
      likes      INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ── Sessions ───────────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT    PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT    NOT NULL UNIQUE,
      ip_address  TEXT    DEFAULT NULL,
      user_agent  TEXT    DEFAULT NULL,
      expires_at  TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ── Audit Log ──────────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
      action      TEXT    NOT NULL,
      entity_type TEXT    NOT NULL,
      entity_id   TEXT    DEFAULT NULL,
      old_values  TEXT    DEFAULT NULL,
      new_values  TEXT    DEFAULT NULL,
      ip_address  TEXT    DEFAULT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ── Settings (key-value store) ─────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'string' CHECK(type IN ('string','number','boolean','json')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ── File Uploads ───────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS uploads (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename     TEXT    NOT NULL,
      original_name TEXT   NOT NULL,
      mime_type    TEXT    NOT NULL,
      size_bytes   INTEGER NOT NULL,
      storage_path TEXT    NOT NULL,
      is_public    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ── Notifications ──────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT    NOT NULL,
      title      TEXT    NOT NULL,
      body       TEXT    DEFAULT NULL,
      is_read    INTEGER NOT NULL DEFAULT 0,
      read_at    TEXT    DEFAULT NULL,
      data       TEXT    DEFAULT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ── API Keys ───────────────────────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      key_hash    TEXT    NOT NULL UNIQUE,
      prefix      TEXT    NOT NULL,
      permissions TEXT    NOT NULL DEFAULT '[]',
      last_used   TEXT    DEFAULT NULL,
      expires_at  TEXT    DEFAULT NULL,
      is_revoked  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // ════════════════════════════════════════════════════════════════════════════
  // INDEXES
  // ════════════════════════════════════════════════════════════════════════════

  // Users
  await run(`CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_users_is_active   ON users(is_active)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_users_created_at  ON users(created_at)`)

  // Posts
  await run(`CREATE INDEX IF NOT EXISTS idx_posts_author_id   ON posts(author_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_posts_category_id ON posts(category_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_posts_status      ON posts(status)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_posts_published   ON posts(published_at)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_posts_featured    ON posts(is_featured, status)`)

  // Comments
  await run(`CREATE INDEX IF NOT EXISTS idx_comments_post_id  ON comments(post_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_comments_user_id  ON comments(user_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_comments_parent   ON comments(parent_id)`)

  // Sessions
  await run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id  ON sessions(user_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires  ON sessions(expires_at)`)

  // Audit log
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_user_id     ON audit_log(user_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_action      ON audit_log(action)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_entity      ON audit_log(entity_type, entity_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_created     ON audit_log(created_at)`)

  // Uploads
  await run(`CREATE INDEX IF NOT EXISTS idx_uploads_user_id   ON uploads(user_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_uploads_mime      ON uploads(mime_type)`)

  // Notifications
  await run(`CREATE INDEX IF NOT EXISTS idx_notif_user_id     ON notifications(user_id)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_notif_unread      ON notifications(user_id, is_read)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_notif_type        ON notifications(type)`)

  // API Keys
  await run(`CREATE INDEX IF NOT EXISTS idx_apikeys_user_id   ON api_keys(user_id)`)

  // Post tags
  await run(`CREATE INDEX IF NOT EXISTS idx_post_tags_tag_id  ON post_tags(tag_id)`)

  // ════════════════════════════════════════════════════════════════════════════
  // VIEWS
  // ════════════════════════════════════════════════════════════════════════════

  await run(`
    CREATE VIEW IF NOT EXISTS v_published_posts AS
    SELECT
      p.id,
      p.title,
      p.slug,
      p.excerpt,
      p.status,
      p.view_count,
      p.is_featured,
      p.published_at,
      p.created_at,
      u.name   AS author_name,
      u.email  AS author_email,
      c.name   AS category_name,
      c.slug   AS category_slug
    FROM posts p
    JOIN users u      ON u.id = p.author_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'published'
    ORDER BY p.published_at DESC
  `)

  await run(`
    CREATE VIEW IF NOT EXISTS v_user_stats AS
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.is_active,
      u.login_count,
      u.created_at,
      COUNT(DISTINCT p.id)  AS post_count,
      COUNT(DISTINCT cm.id) AS comment_count
    FROM users u
    LEFT JOIN posts p    ON p.author_id = u.id
    LEFT JOIN comments cm ON cm.user_id = u.id
    GROUP BY u.id
  `)

  await run(`
    CREATE VIEW IF NOT EXISTS v_post_details AS
    SELECT
      p.id,
      p.title,
      p.slug,
      p.status,
      p.view_count,
      p.created_at,
      p.published_at,
      u.name AS author_name,
      c.name AS category_name,
      COUNT(DISTINCT cm.id) AS comment_count,
      GROUP_CONCAT(DISTINCT t.name) AS tag_names
    FROM posts p
    JOIN users u           ON u.id = p.author_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN comments cm  ON cm.post_id = p.id
    LEFT JOIN post_tags pt ON pt.post_id = p.id
    LEFT JOIN tags t       ON t.id = pt.tag_id
    GROUP BY p.id
  `)
}