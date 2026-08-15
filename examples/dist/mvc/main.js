"use strict";
/**
 * AxilJS MVC Example — Blog Platform
 *
 * Architecture:
 *   Model      → data + business logic (User, Post, Comment)
 *   View       → response formatting (views/response.ts)
 *   Controller → request handling (AuthController, PostController, etc.)
 *   Routes     → URL mapping (authRoutes, postRoutes, commentRoutes)
 *
 * Run: node ../packages/cli/dist/cli.js run (from examples/)
 * Or:  npx ts-node src/mvc/main.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@axiljs/core");
const security_1 = require("@axiljs/security");
const auth_1 = require("@axiljs/auth");
const observability_1 = require("@axiljs/observability");
const app_config_1 = require("./config/app.config");
const auth_routes_1 = require("./routes/auth.routes");
const post_routes_1 = require("./routes/post.routes");
const comment_routes_1 = require("./routes/comment.routes");
const logger_middleware_1 = require("./middlewares/logger.middleware");
const logger = new observability_1.Logger({ name: 'MVC-Blog' });
const jwt = new auth_1.JWT(app_config_1.config.JWT_SECRET);
const app = new core_1.Application({ server: { port: app_config_1.config.PORT, host: app_config_1.config.HOST }, env: app_config_1.config.NODE_ENV });
// ── Global middleware ────────────────────────────────────────────────────────
app.use((0, security_1.helmet)());
app.use((0, core_1.cors)({ origin: '*' }));
app.use((0, security_1.rateLimit)({ max: 200, windowMs: 60000 }));
app.use((0, logger_middleware_1.mvcLogger)());
// ── Mount routes ─────────────────────────────────────────────────────────────
app.mount('', (0, auth_routes_1.authRoutes)(jwt));
app.mount('', (0, post_routes_1.postRoutes)(jwt));
app.mount('', (0, comment_routes_1.commentRoutes)(jwt));
// ── Info endpoint ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        name: 'AxilJS MVC Example — Blog Platform',
        architecture: 'Model-View-Controller',
        version: '0.1.0',
        endpoints: {
            auth: {
                'POST /api/auth/register': 'Register a new user',
                'POST /api/auth/login': 'Login and get JWT token',
                'GET  /api/auth/me': 'Get current user [auth]',
                'PUT  /api/auth/profile': 'Update profile [auth]'
            },
            posts: {
                'GET    /api/posts': 'List published posts',
                'GET    /api/posts/:id': 'Get a post by ID',
                'GET    /api/posts/slug/:slug': 'Get a post by slug',
                'POST   /api/posts': 'Create a post [author/admin]',
                'PUT    /api/posts/:id': 'Update a post [owner/admin]',
                'DELETE /api/posts/:id': 'Delete a post [owner/admin]',
                'PATCH  /api/posts/:id/publish': 'Toggle publish [owner/admin]'
            },
            comments: {
                'GET    /api/posts/:postId/comments': 'List comments on a post',
                'POST   /api/posts/:postId/comments': 'Add a comment [auth]',
                'DELETE /api/comments/:id': 'Delete a comment [owner/admin]'
            }
        },
        quickStart: [
            '1. POST /api/auth/register  { name, email, password, role: "author" }',
            '2. POST /api/auth/login     { email, password }  → copy token',
            '3. POST /api/posts          { title, content }   [Bearer token]',
            '4. PATCH /api/posts/1/publish                    [Bearer token]',
            '5. GET  /api/posts'
        ]
    });
});
// ── Start ────────────────────────────────────────────────────────────────────
async function start() {
    await app.listen(app_config_1.config.PORT, app_config_1.config.HOST);
    logger.info('MVC Blog Platform started', {
        url: `http://${app_config_1.config.HOST}:${app_config_1.config.PORT}`,
        architecture: 'MVC',
        docs: `http://${app_config_1.config.HOST}:${app_config_1.config.PORT}/`
    });
}
start().catch(err => {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=main.js.map