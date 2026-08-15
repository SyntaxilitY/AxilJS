"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const core_1 = require("@axiljs/core"); // Import types
const AuthController_1 = require("../controllers/AuthController");
const auth_middleware_1 = require("../middlewares/auth.middleware");
function authRoutes(jwt) {
    const router = new core_1.Router('/api/auth');
    const ctrl = new AuthController_1.AuthController(jwt);
    const auth = (0, auth_middleware_1.createAuthMiddleware)(jwt);
    // Use a type cast to satisfy the spread signature
    router.post('/register', ...ctrl.register);
    router.post('/login', ...ctrl.login);
    router.get('/me', auth, ctrl.me);
    router.put('/profile', auth, ...ctrl.updateProfile);
    return router;
}
//# sourceMappingURL=auth.routes.js.map