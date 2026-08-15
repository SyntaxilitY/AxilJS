"use strict";
/**
 * Post Routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.postRoutes = postRoutes;
const core_1 = require("@axiljs/core");
const PostController_1 = require("../controllers/PostController");
const auth_middleware_1 = require("../middlewares/auth.middleware");
function postRoutes(jwt) {
    const router = new core_1.Router('/api/posts');
    const ctrl = new PostController_1.PostController();
    const auth = (0, auth_middleware_1.createAuthMiddleware)(jwt);
    const optAuth = (0, auth_middleware_1.createOptionalAuthMiddleware)(jwt);
    const author = (0, auth_middleware_1.requireAuthorOrAdmin)();
    // Public routes
    router.get('/', optAuth, ctrl.list);
    router.get('/slug/:slug', ctrl.showBySlug);
    router.get('/:id', optAuth, ctrl.show);
    // Protected — build tuples explicitly
    const createHandlers = [auth, author, ...ctrl.create];
    const updateHandlers = [auth, ...ctrl.update];
    router.post('/', ...createHandlers);
    router.put('/:id', ...updateHandlers);
    router.delete('/:id', auth, ctrl.destroy);
    router.patch('/:id/publish', auth, author, ctrl.publish);
    return router;
}
