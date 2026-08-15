"use strict";
/**
 * Comment Routes — nested under posts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.commentRoutes = commentRoutes;
const core_1 = require("@axiljs/core");
const CommentController_1 = require("../controllers/CommentController");
const auth_middleware_1 = require("../middlewares/auth.middleware");
function commentRoutes(jwt) {
    const router = new core_1.Router("/api");
    const ctrl = new CommentController_1.CommentController();
    const auth = (0, auth_middleware_1.createAuthMiddleware)(jwt);
    // GET /posts/:postId/comments
    router.get('/posts/:postId/comments', ctrl.list);
    // Build tuple explicitly: middleware + middleware/handler tuple
    const createCommentHandlers = [
        auth,
        ...ctrl.create
    ];
    // POST /posts/:postId/comments
    router.post('/posts/:postId/comments', ...createCommentHandlers);
    // DELETE /comments/:id
    router.delete('/comments/:id', auth, ctrl.destroy);
    return router;
}
//# sourceMappingURL=comment.routes.js.map