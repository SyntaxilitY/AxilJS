"use strict";
/**
 * AuthController — Handles authentication.
 * Uses AxilJS built-in SyntaxilitY Response Manager.
 * No View layer needed — res object handles formatting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_1 = require("@axiljs/auth");
const validation_1 = require("@axiljs/validation");
const User_1 = require("../models/User");
const route_1 = require("../utils/route");
const registerSchema = validation_1.v.object({
    name: validation_1.v.string().min(2).max(100),
    email: validation_1.v.string().email(),
    password: validation_1.v.string().min(8),
    role: validation_1.v.enum(['admin', 'author', 'reader']).optional(),
    bio: validation_1.v.string().max(500).optional()
});
const loginSchema = validation_1.v.object({
    email: validation_1.v.string().email(),
    password: validation_1.v.string().min(1)
});
class AuthController {
    jwt;
    constructor(jwt) {
        this.jwt = jwt;
    }
    // POST /auth/register
    register = (0, route_1.route)((0, validation_1.validate)({ body: registerSchema }), async (req, res) => {
        const body = req.body;
        if (User_1.UserModel.findByEmail(body.email)) {
            return res.conflict('Email already registered');
        }
        const hashed = await (0, auth_1.hashPassword)(body.password);
        const user = User_1.UserModel.create({
            name: body.name,
            email: body.email,
            password: hashed,
            role: body.role || 'reader',
            bio: body.bio || ''
        });
        const token = this.jwt.sign({ sub: String(user.id), role: user.role, email: user.email }, { expiresIn: '7d' });
        res.created({
            user: User_1.UserModel.safe(user),
            token
        }, 'Registration successful');
    });
    // POST /auth/login
    login = (0, route_1.route)((0, validation_1.validate)({ body: loginSchema }), async (req, res) => {
        const body = req.body;
        const user = User_1.UserModel.findByEmail(body.email);
        if (!user)
            return res.unauthorized('Invalid email or password');
        const valid = await (0, auth_1.verifyPassword)(body.password, user.password);
        if (!valid)
            return res.unauthorized('Invalid email or password');
        const token = this.jwt.sign({ sub: String(user.id), role: user.role, email: user.email }, { expiresIn: '7d' });
        res.success({
            user: User_1.UserModel.safe(user),
            token
        }, 'Login successful');
    });
    // GET /auth/me
    me = (req, res) => {
        const authUser = req.locals.user;
        const user = User_1.UserModel.findById(Number(authUser.sub));
        if (!user)
            return res.notFound('User not found');
        res.success(User_1.UserModel.safe(user), 'Current user');
    };
    // PUT /auth/profile
    updateProfile = (0, route_1.route)((0, validation_1.validate)({
        body: validation_1.v.object({
            name: validation_1.v.string().min(2).max(100).optional(),
            bio: validation_1.v.string().max(500).optional()
        })
    }), (req, res) => {
        const userId = req.locals.userId;
        const body = req.body;
        const user = User_1.UserModel.update(userId, body);
        if (!user)
            return res.notFound('User not found');
        res.success(User_1.UserModel.safe(user), 'Profile updated');
    });
}
exports.AuthController = AuthController;
//# sourceMappingURL=AuthController.js.map