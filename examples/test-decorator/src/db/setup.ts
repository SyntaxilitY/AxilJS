/**
 * Seeds the in-memory database with demo data.
 */

import type { DB } from './connection.js'

export async function setupDatabase(db: DB): Promise<void> {
  db.users.set(1, {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    password: '$hashed$',
    role: 'admin'
  })

  db.categories.set(1, { id: 1, name: 'Engineering' })

  db.posts.set(1, {
    id: 1,
    title: 'Welcome to AxilJS Decorators',
    body: 'Semantic decorators, not framework glue.',
    status: 'published',
    authorId: 1,
    categoryId: 1
  })

  db.nextId.users = 2
  db.nextId.categories = 2
  db.nextId.posts = 2
}