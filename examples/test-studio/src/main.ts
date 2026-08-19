// src/main.ts

/**
 * test-studio
 * AxilJS application entry point.
 */

import { Application, cors } from '@axiljs/core'
import { loadEnv, defineConfig } from '@axiljs/config'
import { JWT } from '@axiljs/auth'
import { connectDB }     from './db/connection.js'
import { setupDatabase } from './db/setup.js'

loadEnv()

const config = defineConfig({
  PORT:       { type: 'number', default: 3000 },
  HOST:       { type: 'string', default: '127.0.0.1' },
  NODE_ENV:   { type: 'string', default: 'development' },
  JWT_SECRET: {
    type: 'string',
    default: 'change-this-secret-to-a-random-value-with-at-least-32-characters'
  }
})

const app = new Application({
  server: { port: config.PORT, host: config.HOST },
  env: config.NODE_ENV
})

app.use(cors())

const jwt = new JWT(config.JWT_SECRET)
void jwt

// ── Database ────────────────────────────────────────────────────────
const db = await connectDB()
await setupDatabase(db)

// ── Routes ──────────────────────────────────────────────────────────

// Root route
app.get('/', (_req, res) => {
  res.json({ message: 'Hello, world!' })
})

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    service:   'test-studio',
    timestamp: new Date().toISOString()
  })
})

// Auth routes
app.post('/api/auth/register', (_req, res) => {
  res.json({ success: true, message: 'User registered' })
})

app.post('/api/auth/login', (_req, res) => {
  res.json({ token: 'eyJhbGciOiJIUzI1NiJ9...', user: { id: 1, email: 'user@example.com' } })
})

app.post('/api/auth/logout', (_req, res) => {
  res.json({ success: true })
})

app.get('/api/auth/me', (_req, res) => {
  res.json({ id: 1, name: 'John Doe', email: 'john@example.com', role: 'admin' })
})

// User routes
app.get('/api/users', (_req, res) => {
  res.json({ data: [], total: 0, page: 1, limit: 25 })
})

app.get('/api/users/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'John Doe', email: 'john@example.com' })
})

app.put('/api/users/:id', (req, res) => {
  res.json({ id: req.params.id, updated: true })
})

app.delete('/api/users/:id', (req, res) => {
  res.json({ id: req.params.id, deleted: true })
})

// Post routes
app.get('/api/posts', (_req, res) => {
  res.json({ data: [], total: 0, page: 1, limit: 25 })
})

app.post('/api/posts', (_req, res) => {
  res.json({ id: 1, title: 'New Post', status: 'draft' })
})

app.get('/api/posts/:id', (req, res) => {
  res.json({ id: req.params.id, title: 'Sample Post', status: 'published' })
})

app.put('/api/posts/:id', (req, res) => {
  res.json({ id: req.params.id, updated: true })
})

app.patch('/api/posts/:id/publish', (req, res) => {
  res.json({ id: req.params.id, status: 'published' })
})

app.delete('/api/posts/:id', (req, res) => {
  res.json({ id: req.params.id, deleted: true })
})

// Category routes
app.get('/api/categories', (_req, res) => {
  res.json({ data: [], total: 0 })
})

app.post('/api/categories', (_req, res) => {
  res.json({ id: 1, name: 'New Category' })
})

app.put('/api/categories/:id', (req, res) => {
  res.json({ id: req.params.id, updated: true })
})

app.delete('/api/categories/:id', (req, res) => {
  res.json({ id: req.params.id, deleted: true })
})

// Comment routes
app.get('/api/posts/:postId/comments', (req, res) => {
  res.json({ data: [], postId: req.params.postId })
})

app.post('/api/posts/:postId/comments', (req, res) => {
  res.json({ id: 1, postId: req.params.postId, body: 'New comment' })
})

app.delete('/api/comments/:id', (req, res) => {
  res.json({ id: req.params.id, deleted: true })
})

// Tag routes
app.get('/api/tags', (_req, res) => {
  res.json({ data: [] })
})

app.post('/api/tags', (_req, res) => {
  res.json({ id: 1, name: 'new-tag' })
})

// Upload routes
app.get('/api/uploads', (_req, res) => {
  res.json({ data: [], total: 0 })
})

app.post('/api/uploads', (_req, res) => {
  res.json({ id: 1, filename: 'upload.jpg', size: 102400 })
})

app.delete('/api/uploads/:id', (req, res) => {
  res.json({ id: req.params.id, deleted: true })
})

// Notification routes
app.get('/api/notifications', (_req, res) => {
  res.json({ data: [], unread: 0 })
})

app.patch('/api/notifications/:id/read', (req, res) => {
  res.json({ id: req.params.id, is_read: true })
})

app.post('/api/notifications/read-all', (_req, res) => {
  res.json({ success: true, updated: 0 })
})

// Settings routes
app.get('/api/settings', (_req, res) => {
  res.json({ data: {} })
})

app.put('/api/settings', (_req, res) => {
  res.json({ success: true })
})

// API key routes
app.get('/api/keys', (_req, res) => {
  res.json({ data: [] })
})

app.post('/api/keys', (_req, res) => {
  res.json({ id: 1, prefix: 'axil_live', key: 'axil_live_xxxxxxxxxxxx' })
})

app.delete('/api/keys/:id', (req, res) => {
  res.json({ id: req.params.id, revoked: true })
})

// Audit log
app.get('/api/audit', (_req, res) => {
  res.json({ data: [], total: 0 })
})

// Stats / dashboard
app.get('/api/stats/overview', (_req, res) => {
  res.json({
    users:    120,
    posts:    220,
    comments: 350,
    views:    45230
  })
})

app.get('/api/stats/posts', (_req, res) => {
  res.json({ published: 150, draft: 40, archived: 30 })
})

// Search
app.get('/api/search', (_req, res) => {
  res.json({ results: [], query: '', total: 0 })
})

// ── Start ───────────────────────────────────────────────────────────
await app.listen()

process.on('SIGINT',  async () => { await app.close(); process.exit(0) })
process.on('SIGTERM', async () => { await app.close(); process.exit(0) })