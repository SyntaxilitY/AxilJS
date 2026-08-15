/**
 * User Model
 * In a real app this would be a database entity via @axiljs/orm.
 * Here we use in-memory store to keep the example self-contained.
 */

export interface User {
  id:        number
  name:      string
  email:     string
  password:  string         // hashed — never plaintext
  role:      'admin' | 'author' | 'reader'
  bio:       string
  createdAt: string
}

// In-memory store
let sequence = 1
const store: User[] = []

export const UserModel = {

  // Create a user
  create(data: Omit<User, 'id' | 'createdAt'>): User {
    const user: User = {
      ...data,
      id:        sequence++,
      createdAt: new Date().toISOString()
    }
    store.push(user)
    return user
  },

  // Find by ID
  findById(id: number): User | null {
    return store.find(u => u.id === id) || null
  },

  // Find by email
  findByEmail(email: string): User | null {
    return store.find(u => u.email === email) || null
  },

  // Get all (without passwords)
  findAll(): Omit<User, 'password'>[] {
    return store.map(({ password: _, ...u }) => u)
  },

  // Update
  update(id: number, data: Partial<Omit<User, 'id' | 'createdAt'>>): User | null {
    const index = store.findIndex(u => u.id === id)
    if (index === -1) return null
    store[index] = { ...store[index], ...data }
    return store[index]
  },

  // Delete
  delete(id: number): boolean {
    const index = store.findIndex(u => u.id === id)
    if (index === -1) return false
    store.splice(index, 1)
    return true
  },

  // Strip password before returning
  safe(user: User): Omit<User, 'password'> {
    const { password: _, ...safe } = user
    return safe
  }
}