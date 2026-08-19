// src/db/seed.ts

/**
 * Database seeder — populates all tables with realistic test data.
 * Generates enough rows to test pagination (100+ users, 200+ posts).
 * All data is deterministic (no Math.random) so results are reproducible.
 */

import type { ConnectionManager } from '@axiljs/orm'

export async function seedDatabase(db: ConnectionManager): Promise<void> {
  const driver = (db as any).driver ?? (db as any).connection ?? db

  async function run(sql: string, params?: unknown[]): Promise<void> {
    if (typeof driver.run === 'function') {
      await driver.run(sql, params)
    } else if (typeof driver.query === 'function') {
      await driver.query(sql, params)
    } else if (typeof driver.exec === 'function') {
      await driver.exec(sql)
    } else {
      throw new Error('Cannot execute SQL — no run/query/exec method found on driver')
    }
  }

  async function get(sql: string): Promise<any[]> {
    if (typeof driver.query === 'function') {
      const result = await driver.query(sql)
      return result.rows ?? result
    }
    return []
  }

  // ── Check if already seeded ────────────────────────────────────────────────
  const existing = await get(`SELECT COUNT(*) AS cnt FROM users`)
  const count = Number(existing[0]?.cnt ?? 0)
  if (count > 0) {
    console.log('[Seed] Database already seeded (' + count + ' users). Skipping.')
    return
  }

  console.log('[Seed] Seeding database with test data...')

  // ── Helpers ────────────────────────────────────────────────────────────────
  function date(daysAgo: number, hours = 12): string {
    const d = new Date('2025-06-15T00:00:00Z')
    d.setDate(d.getDate() - daysAgo)
    d.setHours(hours, (daysAgo * 7) % 60, (daysAgo * 13) % 60)
    return d.toISOString().replace('T', ' ').slice(0, 19)
  }

  function slug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  function hash(s: string): string {
    // Simulated hash — not real bcrypt, just for test data
    return '$2b$10$' + Buffer.from(s + 'salt-studio-test').toString('base64').slice(0, 53)
  }

  // ── Users (120) ────────────────────────────────────────────────────────────
  const firstNames = [
    'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
    'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Lisa', 'Daniel', 'Nancy',
    'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
    'Steven', 'Dorothy', 'Andrew', 'Kimberly', 'Paul', 'Emily', 'Joshua', 'Donna',
    'Kenneth', 'Michelle', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa',
    'Timothy', 'Deborah', 'Ronald', 'Stephanie', 'Edward', 'Rebecca', 'Jason', 'Sharon',
    'Jeffrey', 'Laura', 'Ryan', 'Cynthia'
  ]

  const lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
    'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
    'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
    'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
    'Cruz', 'Edwards', 'Collins', 'Reyes'
  ]

  const roles   = ['admin', 'admin', 'editor', 'editor', 'editor', 'user', 'user', 'user', 'user', 'viewer']
  const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'proton.me', 'company.io', 'dev.org']
  const bios    = [
    'Full-stack developer passionate about clean architecture.',
    'Technical writer and documentation enthusiast.',
    'Backend engineer focused on performance and scalability.',
    'UX designer who codes. Building better interfaces.',
    'DevOps engineer automating everything.',
    'Open source contributor and TypeScript advocate.',
    'Data scientist exploring machine learning applications.',
    'Mobile developer building cross-platform apps.',
    'Security researcher and penetration tester.',
    'Product manager bridging business and technology.',
    null, null, null  // Some users have no bio
  ]

  for (let i = 0; i < 120; i++) {
    const first    = firstNames[i % firstNames.length]
    const last     = lastNames[i % lastNames.length]
    const name     = first + ' ' + last
    const domain   = domains[i % domains.length]
    const email    = first.toLowerCase() + '.' + last.toLowerCase() + (i > 59 ? String(i) : '') + '@' + domain
    const role     = roles[i % roles.length]
    const isActive = i < 110 ? 1 : 0   // Last 10 are inactive
    const verified = i < 100 ? 1 : 0   // Last 20 are unverified
    const logins   = (i * 17 + 3) % 200
    const bio      = bios[i % bios.length]
    const created  = date(120 - i, 9 + (i % 12))
    const lastLogin = i < 100 ? date((i * 3) % 30) : null

    await run(
      `INSERT INTO users (email, password_hash, name, role, is_active, email_verified, login_count, last_login_at, bio, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, hash(email), name, role, isActive, verified, logins, lastLogin, bio, created, created]
    )
  }

  // ── Categories (12) ────────────────────────────────────────────────────────
  const categories = [
    { name: 'Technology',      color: '#1565c0', desc: 'Software, hardware, and digital innovation' },
    { name: 'Science',         color: '#2e7d32', desc: 'Research, discoveries, and scientific methods' },
    { name: 'Design',          color: '#7c3aed', desc: 'UI/UX, graphic design, and visual arts' },
    { name: 'Business',        color: '#e65100', desc: 'Startups, management, and entrepreneurship' },
    { name: 'Programming',     color: '#00838f', desc: 'Coding tutorials, best practices, and tips' },
    { name: 'DevOps',          color: '#4a148c', desc: 'CI/CD, infrastructure, and deployment' },
    { name: 'Security',        color: '#b71c1c', desc: 'Cybersecurity, privacy, and data protection' },
    { name: 'Data Science',    color: '#1b5e20', desc: 'Analytics, ML, and data engineering' },
    { name: 'Mobile',          color: '#f57f17', desc: 'iOS, Android, and cross-platform development' },
    { name: 'Web Development', color: '#0d47a1', desc: 'Frontend, backend, and full-stack web' },
    { name: 'Cloud',           color: '#006064', desc: 'AWS, Azure, GCP, and cloud architecture' },
    { name: 'Career',          color: '#37474f', desc: 'Job hunting, interviews, and professional growth' },
  ]

  for (let i = 0; i < categories.length; i++) {
    const c = categories[i]
    await run(
      `INSERT INTO categories (name, slug, description, color, sort_order, is_visible, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [c.name, slug(c.name), c.desc, c.color, i, 1, date(180)]
    )
  }

  // ── Tags (25) ──────────────────────────────────────────────────────────────
  const tagNames = [
    'javascript', 'typescript', 'python', 'rust', 'go', 'react', 'vue', 'angular',
    'nodejs', 'docker', 'kubernetes', 'aws', 'postgresql', 'mongodb', 'redis',
    'graphql', 'rest-api', 'testing', 'performance', 'security', 'open-source',
    'tutorial', 'beginner', 'advanced', 'architecture'
  ]

  for (const t of tagNames) {
    await run(
      `INSERT INTO tags (name, slug, created_at) VALUES (?, ?, ?)`,
      [t, t, date(200)]
    )
  }

  // ── Posts (220) ────────────────────────────────────────────────────────────
  const postTitles = [
    'Getting Started with TypeScript in 2025',
    'Building REST APIs with AxilJS',
    'Understanding Database Indexing Strategies',
    'A Complete Guide to JWT Authentication',
    'Docker Best Practices for Node.js',
    'Introduction to WebSocket Programming',
    'Server-Sent Events vs WebSockets',
    'Advanced SQL Query Optimization',
    'Implementing Role-Based Access Control',
    'Testing Strategies for Backend Applications',
    'Migrating from Express to AxilJS',
    'Understanding CORS and Security Headers',
    'Building Real-Time Dashboards',
    'Database Migration Patterns',
    'API Versioning Strategies',
    'Error Handling Best Practices',
    'Logging and Monitoring in Production',
    'Caching Strategies for Web APIs',
    'GraphQL vs REST: A Practical Comparison',
    'Deploying Node.js Apps with Docker Compose',
    'Introduction to Event-Driven Architecture',
    'Building a Plugin System in TypeScript',
    'Understanding Connection Pooling',
    'Rate Limiting and Throttling APIs',
    'Implementing File Upload with Streaming',
    'Writing Clean and Maintainable Code',
    'Database Backup and Recovery Strategies',
    'Building CLI Tools with TypeScript',
    'Understanding TypeScript Generics',
    'Implementing Search with Full-Text Indexes',
    'Microservices Communication Patterns',
    'Building Webhooks Infrastructure',
    'Understanding HTTP Caching',
    'Working with JSON in SQLite',
    'Implementing Pagination Correctly',
    'Building Email Notification Systems',
    'Understanding Node.js Event Loop',
    'Implementing OAuth 2.0 Flow',
    'Database Schema Design Principles',
    'Building Health Check Endpoints',
    'Understanding Memory Leaks in Node.js',
    'Implementing Soft Deletes',
    'Building Multi-Tenant Applications',
    'Understanding Middleware Patterns',
  ]

  const statuses = ['draft', 'review', 'published', 'published', 'published', 'published', 'published', 'archived']

  const loremParagraphs = [
    'Modern web development requires a solid understanding of both frontend and backend technologies. In this article, we explore the fundamental concepts and best practices that every developer should know.',
    'Performance optimization is not just about writing fast code. It involves understanding the entire request lifecycle, from DNS resolution to final rendering. Let us examine each stage in detail.',
    'Security should never be an afterthought. By implementing proper authentication, authorization, and input validation from the start, you can prevent the most common vulnerabilities.',
    'Testing is an investment in code quality. Unit tests, integration tests, and end-to-end tests each serve a different purpose, and a well-balanced testing strategy uses all three.',
    'Database design decisions made early in a project have long-lasting consequences. Normalization, indexing, and query optimization are skills every backend developer needs.',
    'Containerization has transformed how we deploy and manage applications. Docker and Kubernetes provide the tools needed to build scalable, resilient infrastructure.',
    'API design is both an art and a science. Good APIs are intuitive, consistent, well-documented, and follow established conventions that developers expect.',
    'Event-driven architectures enable loose coupling between services. By communicating through events rather than direct calls, systems become more resilient and scalable.',
  ]

  for (let i = 0; i < 220; i++) {
    const titleBase   = postTitles[i % postTitles.length]
    const title       = i < postTitles.length ? titleBase : titleBase + ' — Part ' + Math.ceil((i + 1) / postTitles.length)
    const postSlug    = slug(title) + (i >= postTitles.length ? '-' + i : '')
    const authorId    = (i % 40) + 1  // First 40 users are authors
    const categoryId  = (i % 12) + 1
    const status      = statuses[i % statuses.length]
    const isFeatured  = i % 15 === 0 ? 1 : 0
    const views       = (i * 47 + 13) % 5000
    const content     = loremParagraphs[i % loremParagraphs.length] + '\n\n' +
                        loremParagraphs[(i + 3) % loremParagraphs.length] + '\n\n' +
                        loremParagraphs[(i + 5) % loremParagraphs.length]
    const excerpt     = content.slice(0, 150) + '...'
    const created     = date(200 - i, 10 + (i % 10))
    const published   = status === 'published' ? date(190 - i, 14) : null

    await run(
      `INSERT INTO posts (author_id, category_id, title, slug, excerpt, content, status, is_featured, view_count, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [authorId, categoryId, title, postSlug, excerpt, content, status, isFeatured, views, published, created, created]
    )
  }

  // ── Post-Tags (many-to-many, ~500 associations) ────────────────────────────
  for (let i = 0; i < 220; i++) {
    const postId = i + 1
    // Each post gets 2-3 tags
    const tagOffset = i % 25
    const tag1 = tagOffset + 1
    const tag2 = ((tagOffset + 7) % 25) + 1
    const tag3 = ((tagOffset + 13) % 25) + 1

    await run(`INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`, [postId, tag1])
    await run(`INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`, [postId, tag2])
    if (i % 3 === 0) {
      await run(`INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`, [postId, tag3])
    }
  }

  // ── Comments (350) ─────────────────────────────────────────────────────────
  const commentBodies = [
    'Great article! This really helped me understand the concept.',
    'Thanks for sharing. I have been looking for a clear explanation like this.',
    'Could you elaborate on the performance implications of this approach?',
    'I have been using this pattern in production for months and it works well.',
    'Interesting perspective. Have you considered the trade-offs with alternative approaches?',
    'This is exactly what our team needed. Bookmarked for reference.',
    'Well written. One small correction: the example on line 15 should use async/await.',
    'How does this compare to the approach described in the official documentation?',
    'We implemented this last quarter and saw a 30% improvement in response times.',
    'Would love to see a follow-up article covering more advanced use cases.',
    'Excellent breakdown of the fundamentals. Perfect for onboarding new team members.',
    'The code examples are clean and easy to follow. Great work.',
    'I ran into an issue when applying this to our legacy codebase. Any suggestions?',
    'This saved me hours of debugging. Thank you!',
    'Looking forward to the next part of this series.',
  ]

  for (let i = 0; i < 350; i++) {
    const postId   = (i % 150) + 1  // Spread across first 150 posts
    const userId   = (i % 80) + 1   // First 80 users comment
    const parentId = (i > 50 && i % 5 === 0) ? (i - (i % 7) - 1) : null  // Some are replies
    const validParent = parentId && parentId > 0 && parentId < i + 1 ? parentId : null
    const body     = commentBodies[i % commentBodies.length]
    const isEdited = i % 12 === 0 ? 1 : 0
    const likes    = (i * 11 + 2) % 50
    const created  = date(180 - (i % 180), 8 + (i % 14))

    await run(
      `INSERT INTO comments (post_id, user_id, parent_id, body, is_edited, likes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [postId, userId, validParent, body, isEdited, likes, created, created]
    )
  }

  // ── Sessions (40 active) ───────────────────────────────────────────────────
  for (let i = 0; i < 40; i++) {
    const id       = 'sess_' + String(i).padStart(4, '0') + '_' + Buffer.from('session-' + i).toString('hex').slice(0, 16)
    const userId   = (i % 30) + 1
    const tokenHash = hash('token-' + i + '-' + userId)
    const ip       = '192.168.' + (i % 5) + '.' + ((i * 7) % 255)
    const ua       = i % 2 === 0
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    const created  = date(i % 10)
    const expires  = date(-30)  // 30 days in the future

    await run(
      `INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, tokenHash, ip, ua, expires, created]
    )
  }

  // ── Audit Log (200 entries) ────────────────────────────────────────────────
  const auditActions = [
    'user.login', 'user.logout', 'user.register', 'user.update_profile',
    'post.create', 'post.update', 'post.publish', 'post.delete',
    'comment.create', 'comment.delete',
    'settings.update', 'api_key.create', 'api_key.revoke',
    'session.create', 'session.expire'
  ]

  const entityTypes = [
    'user', 'user', 'user', 'user',
    'post', 'post', 'post', 'post',
    'comment', 'comment',
    'settings', 'api_key', 'api_key',
    'session', 'session'
  ]

  for (let i = 0; i < 200; i++) {
    const actionIdx  = i % auditActions.length
    const userId     = (i % 50) + 1
    const action     = auditActions[actionIdx]
    const entityType = entityTypes[actionIdx]
    const entityId   = String((i % 100) + 1)
    const ip         = '10.0.' + (i % 3) + '.' + ((i * 11) % 255)
    const created    = date(100 - (i % 100), 6 + (i % 16))

    const oldValues  = action.includes('update')
      ? JSON.stringify({ modified: true, field: 'name' })
      : null

    const newValues  = action.includes('update') || action.includes('create')
      ? JSON.stringify({ modified: true, field: 'name', value: 'Updated Value ' + i })
      : null

    await run(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, action, entityType, entityId, oldValues, newValues, ip, created]
    )
  }

  // ── Settings (15 entries) ──────────────────────────────────────────────────
  const settings: Array<[string, string, string]> = [
    ['app.name',              'Test Studio App',            'string'],
    ['app.description',       'A test application for Axil ORM Studio', 'string'],
    ['app.version',           '1.0.0',                     'string'],
    ['app.maintenance_mode',  'false',                     'boolean'],
    ['app.max_upload_size',   '10485760',                  'number'],
    ['mail.from_address',     'noreply@example.com',       'string'],
    ['mail.from_name',        'Test Studio',               'string'],
    ['auth.session_ttl',      '86400',                     'number'],
    ['auth.max_login_attempts','5',                        'number'],
    ['auth.lockout_duration', '900',                       'number'],
    ['pagination.default_size','25',                       'number'],
    ['pagination.max_size',   '100',                       'number'],
    ['features.comments',     'true',                      'boolean'],
    ['features.registration', 'true',                      'boolean'],
    ['features.api_keys',     'true',                      'boolean'],
  ]

  for (const [key, value, type] of settings) {
    await run(
      `INSERT INTO settings (key, value, type, updated_at) VALUES (?, ?, ?, ?)`,
      [key, value, type, date(30)]
    )
  }

  // ── Uploads (60) ───────────────────────────────────────────────────────────
  const mimeTypes = [
    'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml',
    'application/pdf', 'text/plain', 'text/csv',
    'application/json', 'application/zip'
  ]

  const fileExtensions: Record<string, string> = {
    'image/jpeg':        '.jpg',
    'image/png':         '.png',
    'image/webp':        '.webp',
    'image/svg+xml':     '.svg',
    'application/pdf':   '.pdf',
    'text/plain':        '.txt',
    'text/csv':          '.csv',
    'application/json':  '.json',
    'application/zip':   '.zip',
  }

  for (let i = 0; i < 60; i++) {
    const userId    = (i % 30) + 1
    const mime      = mimeTypes[i % mimeTypes.length]
    const ext       = fileExtensions[mime]
    const origName  = 'document-' + (i + 1) + ext
    const filename  = 'upload_' + String(i).padStart(4, '0') + '_' + Date.now().toString(36) + ext
    const size      = ((i + 1) * 15000) + (i * 3271 % 500000)
    const path      = '/uploads/' + filename
    const isPublic  = i % 3 === 0 ? 1 : 0
    const created   = date(60 - i)

    await run(
      `INSERT INTO uploads (user_id, filename, original_name, mime_type, size_bytes, storage_path, is_public, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, filename, origName, mime, size, path, isPublic, created]
    )
  }

  // ── Notifications (180) ────────────────────────────────────────────────────
  const notifTypes = ['comment', 'mention', 'follow', 'like', 'system', 'post_published']
  const notifTitles: Record<string, string[]> = {
    comment:        ['New comment on your post', 'Someone replied to your comment'],
    mention:        ['You were mentioned in a comment', 'You were mentioned in a post'],
    follow:         ['New follower', 'Someone started following you'],
    like:           ['Your post was liked', 'Your comment was liked'],
    system:         ['System maintenance scheduled', 'Your account was updated'],
    post_published: ['Your post has been published', 'A post you follow was updated'],
  }

  for (let i = 0; i < 180; i++) {
    const userId  = (i % 60) + 1
    const type    = notifTypes[i % notifTypes.length]
    const titles  = notifTitles[type]
    const title   = titles[i % titles.length]
    const body    = 'Notification details for event #' + (i + 1) + '. Please review.'
    const isRead  = i < 120 ? 1 : 0
    const readAt  = isRead ? date((i % 20) + 1) : null
    const data    = JSON.stringify({ event_id: i + 1, entity_type: 'post', entity_id: (i % 100) + 1 })
    const created = date(90 - (i % 90), 7 + (i % 15))

    await run(
      `INSERT INTO notifications (user_id, type, title, body, is_read, read_at, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, title, body, isRead, readAt, data, created]
    )
  }

  // ── API Keys (15) ──────────────────────────────────────────────────────────
  const permissions = [
    '["read"]',
    '["read","write"]',
    '["read","write","delete"]',
    '["admin"]',
    '["read","export"]',
  ]

  for (let i = 0; i < 15; i++) {
    const userId  = (i % 10) + 1
    const name    = ['Production Key', 'Staging Key', 'CI/CD Key', 'Mobile App Key', 'Dashboard Key'][i % 5]
    const prefix  = 'axil_' + ['live', 'test', 'ci', 'mob', 'dash'][i % 5]
    const keyHash = hash('api-key-' + i + '-' + userId)
    const perms   = permissions[i % permissions.length]
    const isRevoked  = i > 12 ? 1 : 0
    const lastUsed   = i < 10 ? date(i % 7) : null
    const expiresAt  = i < 12 ? date(-90) : null  // 90 days in future
    const created    = date(60 - i * 4)

    await run(
      `INSERT INTO api_keys (user_id, name, key_hash, prefix, permissions, last_used, expires_at, is_revoked, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name + ' #' + (i + 1), keyHash, prefix, perms, lastUsed, expiresAt, isRevoked, created]
    )
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    get('SELECT COUNT(*) AS c FROM users'),
    get('SELECT COUNT(*) AS c FROM categories'),
    get('SELECT COUNT(*) AS c FROM tags'),
    get('SELECT COUNT(*) AS c FROM posts'),
    get('SELECT COUNT(*) AS c FROM post_tags'),
    get('SELECT COUNT(*) AS c FROM comments'),
    get('SELECT COUNT(*) AS c FROM sessions'),
    get('SELECT COUNT(*) AS c FROM audit_log'),
    get('SELECT COUNT(*) AS c FROM settings'),
    get('SELECT COUNT(*) AS c FROM uploads'),
    get('SELECT COUNT(*) AS c FROM notifications'),
    get('SELECT COUNT(*) AS c FROM api_keys'),
  ])

  const labels = [
    'users', 'categories', 'tags', 'posts', 'post_tags', 'comments',
    'sessions', 'audit_log', 'settings', 'uploads', 'notifications', 'api_keys'
  ]

  console.log('[Seed] Complete:')
  counts.forEach((rows, idx) => {
    console.log('  ' + labels[idx].padEnd(16) + (rows[0]?.c ?? 0) + ' rows')
  })
}