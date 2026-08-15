/**
 * Post Model — Blog posts
 */

export interface Post {
  id:        number
  title:     string
  slug:      string          // URL-friendly version of title
  content:   string
  excerpt:   string          // First 150 chars of content
  authorId:  number
  tags:      string[]
  published: boolean
  views:     number
  createdAt: string
  updatedAt: string
}

let sequence = 1
const store: Post[] = []

// Convert title to URL slug: "Hello World" → "hello-world"
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export const PostModel = {

  create(data: {
    title:    string
    content:  string
    authorId: number
    tags?:    string[]
  }): Post {
    const now = new Date().toISOString()
    const post: Post = {
      id:        sequence++,
      title:     data.title,
      slug:      toSlug(data.title),
      content:   data.content,
      excerpt:   data.content.slice(0, 150) + (data.content.length > 150 ? '...' : ''),
      authorId:  data.authorId,
      tags:      data.tags || [],
      published: false,
      views:     0,
      createdAt: now,
      updatedAt: now
    }
    store.push(post)
    return post
  },

  findById(id: number): Post | null {
    return store.find(p => p.id === id) || null
  },

  findBySlug(slug: string): Post | null {
    return store.find(p => p.slug === slug) || null
  },

  findAll(options: {
    authorId?:  number
    published?: boolean
    tag?:       string
    page?:      number
    perPage?:   number
  } = {}): { data: Post[]; total: number; page: number; perPage: number; totalPages: number } {
    let result = [...store]

    if (options.authorId  !== undefined) result = result.filter(p => p.authorId  === options.authorId)
    if (options.published !== undefined) result = result.filter(p => p.published  === options.published)
    if (options.tag)                     result = result.filter(p => p.tags.includes(options.tag!))

    const total    = result.length
    const page     = options.page    || 1
    const perPage  = options.perPage || 10
    const offset   = (page - 1) * perPage

    return {
      data:       result.slice(offset, offset + perPage),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage)
    }
  },

  update(id: number, data: Partial<Pick<Post, 'title' | 'content' | 'tags' | 'published'>>): Post | null {
    const index = store.findIndex(p => p.id === id)
    if (index === -1) return null

    const updated = {
      ...store[index],
      ...data,
      updatedAt: new Date().toISOString()
    }

    if (data.title) {
      updated.slug = toSlug(data.title)
    }

    if (data.content) {
      updated.excerpt = data.content.slice(0, 150) + (data.content.length > 150 ? '...' : '')
    }

    store[index] = updated
    return updated
  },

  incrementViews(id: number): void {
    const post = store.find(p => p.id === id)
    if (post) post.views++
  },

  delete(id: number): boolean {
    const index = store.findIndex(p => p.id === id)
    if (index === -1) return false
    store.splice(index, 1)
    return true
  }
}