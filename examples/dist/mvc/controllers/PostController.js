"use strict";
/**
 * PostController — CRUD for blog posts.
 * Uses AxilJS built-in SyntaxilitY Response Manager.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostController = void 0;
const validation_1 = require("@axil/validation");
const Post_1 = require("../models/Post");
const User_1 = require("../models/User");
const Comment_1 = require("../models/Comment");
const route_1 = require("../utils/route");
const createSchema = validation_1.v.object({
    title: validation_1.v.string().min(3).max(200),
    content: validation_1.v.string().min(50),
    tags: validation_1.v.array(validation_1.v.string().min(1)).max(10).optional()
});
const updateSchema = validation_1.v.object({
    title: validation_1.v.string().min(3).max(200).optional(),
    content: validation_1.v.string().min(50).optional(),
    tags: validation_1.v.array(validation_1.v.string().min(1)).max(10).optional(),
    published: validation_1.v.boolean().optional()
});
class PostController {
    // GET /posts
    list = (req, res) => {
        const page = Number(req.query.page) || 1;
        const perPage = Number(req.query.perPage) || 10;
        const tag = req.query.tag;
        const authorId = req.query.authorId ? Number(req.query.authorId) : undefined;
        const published = req.locals.role === 'admin' ? undefined : true;
        const result = Post_1.PostModel.findAll({ published, tag, authorId, page, perPage });
        const enriched = result.data.map(post => {
            const author = User_1.UserModel.findById(post.authorId);
            return {
                ...post,
                author: author ? { id: author.id, name: author.name } : null
            };
        });
        res.paginated(enriched, result.total, page, perPage, 'Posts fetched');
    };
    // GET /posts/:id
    show = (req, res) => {
        const post = Post_1.PostModel.findById(Number(req.params.id));
        if (!post)
            return res.notFound('Post not found');
        const userId = req.locals.userId;
        if (!post.published && post.authorId !== userId && req.locals.role !== 'admin') {
            return res.notFound('Post not found');
        }
        if (post.published)
            Post_1.PostModel.incrementViews(post.id);
        const author = User_1.UserModel.findById(post.authorId);
        const comments = Comment_1.CommentModel.findByPostId(post.id);
        res.success({
            ...post,
            author: author ? User_1.UserModel.safe(author) : null,
            comments: comments.map(c => {
                const commenter = User_1.UserModel.findById(c.authorId);
                return { ...c, author: commenter ? { id: commenter.id, name: commenter.name } : null };
            }),
            commentCount: comments.length
        }, 'Post fetched');
    };
    // GET /posts/slug/:slug
    showBySlug = (req, res) => {
        const post = Post_1.PostModel.findBySlug(req.params.slug);
        if (!post)
            return res.notFound('Post not found');
        if (!post.published)
            return res.notFound('Post not found');
        Post_1.PostModel.incrementViews(post.id);
        const author = User_1.UserModel.findById(post.authorId);
        res.success({
            ...post,
            author: author ? User_1.UserModel.safe(author) : null
        }, 'Post fetched');
    };
    // POST /posts
    create = (0, route_1.route)((0, validation_1.validate)({ body: createSchema }), (req, res) => {
        const body = req.body;
        const userId = req.locals.userId;
        const post = Post_1.PostModel.create({
            title: body.title,
            content: body.content,
            authorId: userId,
            tags: body.tags
        });
        res.created(post, 'Post created as draft');
    });
    // PUT /posts/:id
    update = (0, route_1.route)((0, validation_1.validate)({ body: updateSchema }), (req, res) => {
        const id = Number(req.params.id);
        const post = Post_1.PostModel.findById(id);
        if (!post)
            return res.notFound('Post not found');
        const userId = req.locals.userId;
        if (post.authorId !== userId && req.locals.role !== 'admin') {
            return res.forbidden('You can only edit your own posts');
        }
        const body = req.body;
        const updated = Post_1.PostModel.update(id, body);
        res.success(updated, 'Post updated');
    });
    // DELETE /posts/:id
    destroy = (req, res) => {
        const id = Number(req.params.id);
        const post = Post_1.PostModel.findById(id);
        if (!post)
            return res.notFound('Post not found');
        const userId = req.locals.userId;
        if (post.authorId !== userId && req.locals.role !== 'admin') {
            return res.forbidden('You can only delete your own posts');
        }
        Post_1.PostModel.delete(id);
        Comment_1.CommentModel.deleteByPostId(id);
        res.success(null, 'Post deleted');
    };
    // PATCH /posts/:id/publish
    publish = (req, res) => {
        const id = Number(req.params.id);
        const post = Post_1.PostModel.findById(id);
        if (!post)
            return res.notFound('Post not found');
        const userId = req.locals.userId;
        if (post.authorId !== userId && req.locals.role !== 'admin') {
            return res.forbidden();
        }
        const updated = Post_1.PostModel.update(id, { published: !post.published });
        res.success(updated, post.published ? 'Post unpublished' : 'Post published');
    };
}
exports.PostController = PostController;
