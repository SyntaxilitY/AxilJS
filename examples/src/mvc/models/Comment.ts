/**
 * Comment Model — Comments on posts
 */

export interface Comment {
  id:        number
  postId:    number
  authorId:  number
  content:   string
  createdAt: string
}

let sequence = 1
const store: Comment[] = []

export const CommentModel = {

  create(data: { postId: number; authorId: number; content: string }): Comment {
    const comment: Comment = {
      id:        sequence++,
      ...data,
      createdAt: new Date().toISOString()
    }
    store.push(comment)
    return comment
  },

  findByPostId(postId: number): Comment[] {
    return store.filter(c => c.postId === postId)
  },

  findById(id: number): Comment | null {
    return store.find(c => c.id === id) || null
  },

  delete(id: number): boolean {
    const index = store.findIndex(c => c.id === id)
    if (index === -1) return false
    store.splice(index, 1)
    return true
  },

  // Delete all comments for a post (used when post is deleted)
  deleteByPostId(postId: number): number {
    const before = store.length
    const keep   = store.filter(c => c.postId !== postId)
    store.splice(0, store.length, ...keep)
    return before - store.length
  }
}