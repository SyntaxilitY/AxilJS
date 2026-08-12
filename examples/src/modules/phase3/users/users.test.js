"use strict";
/**
 * Example test file for the Users module.
 * Shows how to use @restjs/testing with the full stack.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@restjs/testing");
const core_1 = require("@restjs/core");
const validation_1 = require("@restjs/validation");
const auth_1 = require("@restjs/auth");
let app;
let jwt;
let authToken;
// ─── Setup ────────────────────────────────────────────────────────────────────
(0, testing_1.beforeAll)(async () => {
    jwt = new auth_1.JWT(process.env.JWT_SECRET || 'test-secret-minimum-32-characters!!');
    authToken = jwt.sign({
        sub: '1',
        role: 'admin'
    }, {
        expiresIn: '1h'
    });
    app = new core_1.Application({
        server: {
            port: 0
        }
    });
    app.use((0, core_1.cors)());
    // GET /users
    app.get('/users', (0, auth_1.authenticate)(jwt), (req, res) => {
        res.json({
            data: [
                {
                    id: 1,
                    name: 'Tariq'
                }
            ]
        });
    });
    // POST /users
    app.post('/users', (0, auth_1.authenticate)(jwt), (0, validation_1.validate)({
        body: validation_1.v.object({
            name: validation_1.v.string().min(2).max(100),
            email: validation_1.v.string().email()
        })
    }), (req, res) => {
        res.status(201).json({
            data: {
                id: 2,
                ...req.body
            }
        });
    });
    // GET /users/:id
    app.get('/users/:id', (0, auth_1.authenticate)(jwt), (req, res) => {
        const id = Number(req.params.id);
        if (id !== 1) {
            res.status(404).json({
                error: {
                    code: 'NOT_FOUND',
                    message: 'User not found'
                }
            });
            return;
        }
        res.json({
            data: {
                id: 1,
                name: 'Tariq'
            }
        });
    });
});
// ─── Tests ────────────────────────────────────────────────────────────────────
(0, testing_1.describe)('GET /users', () => {
    (0, testing_1.it)('should return 401 without a token', async () => {
        const client = (0, testing_1.createTestClient)(app);
        const res = await client.get('/users');
        (0, testing_1.expect)(res.status).toBe(401);
    });
    (0, testing_1.it)('should return users with valid token', async () => {
        const client = (0, testing_1.createTestClient)(app);
        const res = await client
            .get('/users')
            .auth(authToken);
        (0, testing_1.expect)(res.status).toBe(200);
        (0, testing_1.expect)(res.body.data).toHaveLength(1);
        (0, testing_1.expect)(res.body.data[0].name).toBe('Tariq');
    });
});
(0, testing_1.describe)('POST /users', () => {
    (0, testing_1.it)('should return 422 with invalid body', async () => {
        const client = (0, testing_1.createTestClient)(app);
        const res = await client
            .post('/users')
            .auth(authToken)
            .send({
            name: 'T'
        });
        (0, testing_1.expect)(res.status).toBe(422);
        (0, testing_1.expect)(res.body.error.code).toBe('VALIDATION_ERROR');
    });
    (0, testing_1.it)('should create user with valid body', async () => {
        const client = (0, testing_1.createTestClient)(app);
        const res = await client
            .post('/users')
            .auth(authToken)
            .send({
            name: 'New User',
            email: 'new@restjs.dev'
        });
        (0, testing_1.expect)(res.status).toBe(201);
        (0, testing_1.expect)(res.body.data.name).toBe('New User');
        (0, testing_1.expect)(res.body.data.email).toBe('new@restjs.dev');
    });
});
(0, testing_1.describe)('GET /users/:id', () => {
    (0, testing_1.it)('should return 404 for unknown user', async () => {
        const client = (0, testing_1.createTestClient)(app);
        const res = await client
            .get('/users/999')
            .auth(authToken);
        (0, testing_1.expect)(res.status).toBe(404);
    });
    (0, testing_1.it)('should return user by id', async () => {
        const client = (0, testing_1.createTestClient)(app);
        const res = await client
            .get('/users/1')
            .auth(authToken);
        (0, testing_1.expect)(res.status).toBe(200);
        (0, testing_1.expect)(res.body.data.id).toBe(1);
        (0, testing_1.expect)(res.body.data.name).toBe('Tariq');
    });
});
(0, testing_1.describe)('JWT', () => {
    (0, testing_1.it)('should sign and verify a token', () => {
        const token = jwt.sign({
            sub: '42',
            role: 'user'
        }, {
            expiresIn: '1h'
        });
        const payload = jwt.verify(token);
        (0, testing_1.expect)(payload.sub).toBe('42');
        (0, testing_1.expect)(payload.role).toBe('user');
    });
    (0, testing_1.it)('should reject an expired token', () => {
        const token = jwt.sign({
            sub: '42'
        }, {
            expiresIn: '0s'
        });
        (0, testing_1.expect)(() => jwt.verify(token)).toThrow('expired');
    });
});
(0, testing_1.describe)('Validation', () => {
    (0, testing_1.it)('should validate a correct object', () => {
        const schema = validation_1.v.object({
            name: validation_1.v.string().min(2),
            email: validation_1.v.string().email(),
            age: validation_1.v.number().min(0).optional()
        });
        const result = schema.parse({
            name: 'Tariq',
            email: 'tariq@restjs.dev'
        });
        (0, testing_1.expect)(result.success).toBe(true);
        (0, testing_1.expect)(result.data?.name).toBe('Tariq');
    });
    (0, testing_1.it)('should return errors for invalid data', () => {
        const schema = validation_1.v.object({
            name: validation_1.v.string().min(5),
            email: validation_1.v.string().email()
        });
        const result = schema.parse({
            name: 'T',
            email: 'not-an-email'
        });
        (0, testing_1.expect)(result.success).toBe(false);
        (0, testing_1.expect)(result.errors).toHaveLength(2);
    });
});
//# sourceMappingURL=users.test.js.map