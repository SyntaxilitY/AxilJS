"use strict";
/**
 * Auth Routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuthRoutes = registerAuthRoutes;
const auth_1 = require("@axiljs/auth");
const validation_1 = require("@axiljs/validation");
const AuthService_1 = require("../services/AuthService");
function registerAuthRoutes(app, jwt) {
    const auth = new AuthService_1.AuthService(jwt);
    const authMw = (0, auth_1.authenticate)(jwt);
    // POST /api/auth/register
    app.post('/api/auth/register', (0, validation_1.validate)({
        body: validation_1.v.object({
            name: validation_1.v.string().min(2).max(100),
            email: validation_1.v.string().email(),
            password: validation_1.v.string().min(8),
            role: validation_1.v.enum(['customer', 'admin']).optional()
        })
    }), async (req, res) => {
        const body = req.body;
        const result = await auth.register(body);
        if ('error' in result)
            return res.conflict(result.error);
        res.created(result, 'Registration successful');
    });
    // POST /api/auth/login
    app.post('/api/auth/login', (0, validation_1.validate)({
        body: validation_1.v.object({
            email: validation_1.v.string().email(),
            password: validation_1.v.string().min(1)
        })
    }), async (req, res) => {
        const body = req.body;
        const result = await auth.login(body.email, body.password);
        if ('error' in result)
            return res.unauthorized(result.error);
        res.success(result, 'Login successful');
    });
    // GET /api/auth/me
    app.get('/api/auth/me', authMw, async (req, res) => {
        const userId = Number(req.locals.user.sub);
        const user = await auth.getProfile(userId);
        if (!user)
            return res.notFound('User not found');
        res.success(user, 'Profile fetched');
    });
}
//# sourceMappingURL=auth.js.map