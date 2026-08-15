"use strict";
/**
 * CommentController — Comments on posts.
 * Uses AxilJS built-in SyntaxilitY Response Manager.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentController = void 0;
const validation_1 = require("@axiljs/validation");
const Comment_1 = require("../models/Comment");
const Post_1 = require("../models/Post");
const User_1 = require("../models/User");
const route_1 = require("../utils/route");
const createSchema = validation_1.v.object({
    content: validation_1.v.string().min(1).max(2000)
});
class CommentController {
    // GET /posts/:postId/comments
    list = (req, res) => {
        const postId = Number(req.params.postId);
        const post = Post_1.PostModel.findById(postId);
        if (!post || !post.published) {
            return res.notFound('Post not found');
        }
        const comments = Comment_1.CommentModel.findByPostId(postId);
        const enriched = comments.map(c => {
            const author = User_1.UserModel.findById(c.authorId);
            return {
                ...c,
                author: author ? { id: author.id, name: author.name } : null
            };
        });
        res.success(enriched, `${enriched.length} comments`);
    };
    // POST /posts/:postId/comments
    create = (0, route_1.route)((0, validation_1.validate)({ body: createSchema }), (req, res) => {
        const postId = Number(req.params.postId);
        const post = Post_1.PostModel.findById(postId);
        console.log(post);
        if (!post || !post.published) {
            return res.notFound('Post not found');
        }
        const comment = Comment_1.CommentModel.create({
            postId,
            authorId: req.locals.userId,
            content: req.body.content
        });
        const author = User_1.UserModel.findById(comment.authorId);
        res.created({
            ...comment,
            author: author ? { id: author.id, name: author.name } : null
        }, 'Comment added');
    });
    // DELETE /comments/:id
    destroy = (req, res) => {
        const id = Number(req.params.id);
        const comment = Comment_1.CommentModel.findById(id);
        if (!comment) {
            return res.notFound('Comment not found');
        }
        const userId = req.locals.userId;
        if (comment.authorId !== userId && req.locals.role !== 'admin') {
            return res.forbidden('You can only delete your own comments');
        }
        Comment_1.CommentModel.delete(id);
        res.success(null, 'Comment deleted');
    };
}
exports.CommentController = CommentController;
//# sourceMappingURL=CommentController.js.map