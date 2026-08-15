/**
 * CommentController — Comments on posts.
 * Uses AxilJS built-in SyntaxilitY Response Manager.
 */

import type { axilRequest as Request, axilResponse as Response } from '@axiljs/core'
import { v, validate } from '@axiljs/validation'
import { CommentModel } from '../models/Comment'
import { PostModel }    from '../models/Post'
import { UserModel }    from '../models/User'
import { route }        from '../utils/route'

const createSchema = v.object({
  content: v.string().min(1).max(2000)
})

export class CommentController {

  // GET /posts/:postId/comments
  list = (req: Request, res: Response) => {
    const postId = Number(req.params.postId)
    const post   = PostModel.findById(postId)

    if (!post || !post.published) {
      return res.notFound('Post not found')
    }

    const comments = CommentModel.findByPostId(postId)

    const enriched = comments.map(c => {
      const author = UserModel.findById(c.authorId)
      return {
        ...c,
        author: author ? { id: author.id, name: author.name } : null
      }
    })

    res.success(enriched, `${enriched.length} comments`)
  }

  // POST /posts/:postId/comments
  create = route(
    validate({ body: createSchema }),
    (req: Request, res: Response) => {
      const postId = Number(req.params.postId)
      const post   = PostModel.findById(postId)
      console.log(post)

      if (!post || !post.published) {
        return res.notFound('Post not found')
      }

      const comment = CommentModel.create({
        postId,
        authorId: req.locals.userId as number,
        content:  (req.body as any).content
      })

      const author = UserModel.findById(comment.authorId)

      res.created({
        ...comment,
        author: author ? { id: author.id, name: author.name } : null
      }, 'Comment added')
    }
  )

  // DELETE /comments/:id
  destroy = (req: Request, res: Response) => {
    const id      = Number(req.params.id)
    const comment = CommentModel.findById(id)

    if (!comment) {
      return res.notFound('Comment not found')
    }

    const userId = req.locals.userId as number
    if (comment.authorId !== userId && req.locals.role !== 'admin') {
      return res.forbidden('You can only delete your own comments')
    }

    CommentModel.delete(id)
    res.success(null, 'Comment deleted')
  }
}