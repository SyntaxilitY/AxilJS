/**
 * PostController — CRUD for blog posts.
 * Uses AxilJS built-in SyntaxilitY Response Manager.
 */

import type { axilRequest as Request, axilResponse as Response } from '@axiljs/core'
import { v, validate } from '@axiljs/validation'
import { PostModel }    from '../models/Post'
import { UserModel }    from '../models/User'
import { CommentModel } from '../models/Comment'
import { route }        from '../utils/route'

const createSchema = v.object({
  title:   v.string().min(3).max(200),
  content: v.string().min(50),
  tags:    v.array(v.string().min(1)).max(10).optional()
})

const updateSchema = v.object({
  title:     v.string().min(3).max(200).optional(),
  content:   v.string().min(50).optional(),
  tags:      v.array(v.string().min(1)).max(10).optional(),
  published: v.boolean().optional()
})

export class PostController {

  // GET /posts
  list = (req: Request, res: Response) => {
    const page     = Number(req.query.page)    || 1
    const perPage  = Number(req.query.perPage) || 10
    const tag      = req.query.tag as string | undefined
    const authorId = req.query.authorId ? Number(req.query.authorId) : undefined

    const published = req.locals.role === 'admin' ? undefined : true

    const result = PostModel.findAll({ published, tag, authorId, page, perPage })

    const enriched = result.data.map(post => {
      const author = UserModel.findById(post.authorId)
      return {
        ...post,
        author: author ? { id: author.id, name: author.name } : null
      }
    })

    res.paginated(enriched, result.total, page, perPage, 'Posts fetched')
  }

  // GET /posts/:id
  show = (req: Request, res: Response) => {
    const post = PostModel.findById(Number(req.params.id))

    if (!post) return res.notFound('Post not found')

    const userId = req.locals.userId as number | undefined
    if (!post.published && post.authorId !== userId && req.locals.role !== 'admin') {
      return res.notFound('Post not found')
    }

    if (post.published) PostModel.incrementViews(post.id)

    const author   = UserModel.findById(post.authorId)
    const comments = CommentModel.findByPostId(post.id)

    res.success({
      ...post,
      author:   author ? UserModel.safe(author) : null,
      comments: comments.map(c => {
        const commenter = UserModel.findById(c.authorId)
        return { ...c, author: commenter ? { id: commenter.id, name: commenter.name } : null }
      }),
      commentCount: comments.length
    }, 'Post fetched')
  }

  // GET /posts/slug/:slug
  showBySlug = (req: Request, res: Response) => {
    const post = PostModel.findBySlug(req.params.slug)
    if (!post) return res.notFound('Post not found')
    if (!post.published) return res.notFound('Post not found')

    PostModel.incrementViews(post.id)
    const author = UserModel.findById(post.authorId)

    res.success({
      ...post,
      author: author ? UserModel.safe(author) : null
    }, 'Post fetched')
  }

  // POST /posts
  create = route(
    validate({ body: createSchema }),
    (req: Request, res: Response) => {
      const body   = req.body as { title: string; content: string; tags?: string[] }
      const userId = req.locals.userId as number

      const post = PostModel.create({
        title:    body.title,
        content:  body.content,
        authorId: userId,
        tags:     body.tags
      })

      res.created(post, 'Post created as draft')
    }
  )

  // PUT /posts/:id
  update = route(
    validate({ body: updateSchema }),
    (req: Request, res: Response) => {
      const id   = Number(req.params.id)
      const post = PostModel.findById(id)

      if (!post) return res.notFound('Post not found')

      const userId = req.locals.userId as number
      if (post.authorId !== userId && req.locals.role !== 'admin') {
        return res.forbidden('You can only edit your own posts')
      }

      const body    = req.body as Partial<Pick<typeof post, 'title' | 'content' | 'tags' | 'published'>>
      const updated = PostModel.update(id, body)

      res.success(updated, 'Post updated')
    }
  )

  // DELETE /posts/:id
  destroy = (req: Request, res: Response) => {
    const id   = Number(req.params.id)
    const post = PostModel.findById(id)

    if (!post) return res.notFound('Post not found')

    const userId = req.locals.userId as number
    if (post.authorId !== userId && req.locals.role !== 'admin') {
      return res.forbidden('You can only delete your own posts')
    }

    PostModel.delete(id)
    CommentModel.deleteByPostId(id)

    res.success(null, 'Post deleted')
  }

  // PATCH /posts/:id/publish
  publish = (req: Request, res: Response) => {
    const id   = Number(req.params.id)
    const post = PostModel.findById(id)

    if (!post) return res.notFound('Post not found')

    const userId = req.locals.userId as number
    if (post.authorId !== userId && req.locals.role !== 'admin') {
      return res.forbidden()
    }

    const updated = PostModel.update(id, { published: !post.published })
    res.success(updated, post.published ? 'Post unpublished' : 'Post published')
  }
}