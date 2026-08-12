"use strict";
/**
 * @restjs/auth - Public API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHashed = exports.verifyPassword = exports.hashPassword = exports.requireOwnership = exports.requirePermission = exports.requireRole = exports.getUser = exports.authenticate = exports.JWT = void 0;
// JWT
var jwt_1 = require("./jwt/jwt");
Object.defineProperty(exports, "JWT", { enumerable: true, get: function () { return jwt_1.JWT; } });
// Auth middleware
var auth_middleware_1 = require("./middleware/auth-middleware");
Object.defineProperty(exports, "authenticate", { enumerable: true, get: function () { return auth_middleware_1.authenticate; } });
Object.defineProperty(exports, "getUser", { enumerable: true, get: function () { return auth_middleware_1.getUser; } });
// RBAC
var rbac_1 = require("./middleware/rbac");
Object.defineProperty(exports, "requireRole", { enumerable: true, get: function () { return rbac_1.requireRole; } });
Object.defineProperty(exports, "requirePermission", { enumerable: true, get: function () { return rbac_1.requirePermission; } });
Object.defineProperty(exports, "requireOwnership", { enumerable: true, get: function () { return rbac_1.requireOwnership; } });
// Password
var password_1 = require("./password/password");
Object.defineProperty(exports, "hashPassword", { enumerable: true, get: function () { return password_1.hashPassword; } });
Object.defineProperty(exports, "verifyPassword", { enumerable: true, get: function () { return password_1.verifyPassword; } });
Object.defineProperty(exports, "isHashed", { enumerable: true, get: function () { return password_1.isHashed; } });
//# sourceMappingURL=index.js.map