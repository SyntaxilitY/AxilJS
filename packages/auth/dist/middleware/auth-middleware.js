"use strict";
/**
 * Authentication middleware.
 * Extracts and verifies JWT tokens from requests.
 * Attaches the decoded user to req.locals.user.
 *
 * Usage:
 *   // Protect all routes
 *   app.use(authenticate(jwt))
 *
 *   // Protect specific routes
 *   app.get('/profile', authenticate(jwt), getProfile)
 *
 *   // Optional auth (don't fail if no token)
 *   app.get('/feed', authenticate(jwt, { required: false }), getFeed)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.getUser = getUser;
const common_1 = require("@axiljs/common");
/**
 * Extract token from request based on configured sources.
 */
function extractToken(req, sources, cookieName = 'token', queryParam = 'token') {
    for (const source of sources) {
        switch (source) {
            case 'header': {
                const authHeader = req.headers['authorization'];
                // Auth scheme is case-insensitive (RFC 7235 §2.1)
                if (typeof authHeader === 'string' && /^bearer /i.test(authHeader)) {
                    return authHeader.slice(7).trim();
                }
                break;
            }
            case 'cookie': {
                const cookieHeader = req.headers['cookie'] || '';
                const cookies = {};
                cookieHeader.split(';').forEach((c) => {
                    const [k, v] = c.trim().split('=');
                    if (k)
                        cookies[k.trim()] = v?.trim() || '';
                });
                if (Object.prototype.hasOwnProperty.call(cookies, cookieName) && cookies[cookieName]) {
                    return cookies[cookieName];
                }
                break;
            }
            case 'query': {
                // ?token=a&token=b yields an array - only accept a single string
                const value = req.query && Object.prototype.hasOwnProperty.call(req.query, queryParam)
                    ? req.query[queryParam]
                    : undefined;
                if (typeof value === 'string' && value) {
                    return value;
                }
                break;
            }
        }
    }
    return null;
}
/**
 * Create authentication middleware.
 *
 * @param jwt      JWT instance with the secret
 * @param options  Authentication options
 */
function authenticate(jwt, options = {}) {
    const { required = true, source = 'header', cookieName, queryParam, audience, issuer } = options;
    const sources = Array.isArray(source) ? source : [source];
    return (req, res, next) => {
        const token = extractToken(req, sources, cookieName, queryParam);
        if (!token) {
            if (required) {
                return next(new common_1.UnauthorizedError('Authentication required. Provide a Bearer token.'));
            }
            // Optional auth - continue without user
            return next();
        }
        try {
            const payload = jwt.verify(token, { audience, issuer });
            // Attach user to request locals for use in handlers
            req.locals.user = {
                id: payload.sub,
                ...payload
            };
            next();
        }
        catch (error) {
            next(error instanceof Error ? error : new common_1.UnauthorizedError());
        }
    };
}
/**
 * Get the authenticated user from request.
 * Throws if not authenticated.
 */
function getUser(req) {
    const user = req.locals?.user;
    if (!user) {
        throw new common_1.UnauthorizedError('Not authenticated');
    }
    return user;
}
//# sourceMappingURL=auth-middleware.js.map