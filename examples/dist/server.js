"use strict";
/**
 * REstJS — Phase 1, 2, 3, 4 Testing Server
 * Run:  npx ts-node src/server.ts
 * Test: Postman → http://localhost:3000
 */
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@restjs/core");
const config_1 = require("@restjs/config");
const security_1 = require("@restjs/security");
const auth_1 = require("@restjs/auth");
const auth_2 = require("@restjs/auth");
const auth_3 = require("@restjs/auth");
const validation_1 = require("@restjs/validation");
const events_1 = require("@restjs/events");
const websocket_1 = require("@restjs/websocket");
const queue_1 = require("@restjs/queue");
const queue_2 = require("@restjs/queue");
const circuit_1 = require("@restjs/circuit");
const observability_1 = require("@restjs/observability");
// ─── Load .env ────────────────────────────────────────────────────────────────
(0, config_1.loadEnv)();
// ─── Config ───────────────────────────────────────────────────────────────────
const config = (0, config_1.defineConfig)({
    PORT: { type: 'number', default: 3000 },
    HOST: { type: 'string', default: '127.0.0.1' },
    NODE_ENV: { type: 'string', default: 'development' },
    JWT_SECRET: { type: 'string', default: 'restjs-dev-secret-minimum-32-chars!!' }
});
// ─── JWT ──────────────────────────────────────────────────────────────────────
const jwt = new auth_1.JWT(config.JWT_SECRET);
// ─── Phase 4 Infrastructure ───────────────────────────────────────────────────
// Structured logger
const logger = new observability_1.Logger({ name: 'REstJS' });
// Prometheus metrics registry
const metrics = new observability_1.MetricsRegistry();
// Distributed tracer
const tracer = new observability_1.Tracer({ serviceName: 'restjs-example' });
// In-process event bus
const eventBus = new events_1.EventBus();
// Email job queue
const emailQueue = new queue_1.Queue('emails', { concurrency: 3 });
emailQueue.process('send-welcome', async (job) => {
    const data = job.data;
    logger.info('Processing welcome email', { to: data.email });
    await new Promise(r => setTimeout(r, 150)); // simulate sending
    return { sent: true, to: data.email };
});
emailQueue.process('send-notification', async (job) => {
    const data = job.data;
    logger.info('Processing notification', { to: data.email });
    await new Promise(r => setTimeout(r, 100));
    return { sent: true, to: data.email };
});
emailQueue.on('completed', (job) => logger.info('Job completed', { id: job.id, name: job.name }));
emailQueue.on('failed', (job, err) => logger.error('Job failed', { id: job.id, error: err.message }));
emailQueue.start();
// Task scheduler
const scheduler = new queue_2.Scheduler();
scheduler.schedule('log-stats', '*/1 * * * *', async () => {
    logger.info('Scheduled tick', {
        users: users.length,
        posts: posts.length,
        queue: emailQueue.getStats()
    });
});
scheduler.start();
// Circuit breaker for simulated external service
const externalCB = new circuit_1.CircuitBreaker('external-api', {
    failureThreshold: 3,
    resetTimeoutMs: 15000,
    requestTimeoutMs: 5000,
    fallback: () => ({
        data: null,
        error: 'External service unavailable',
        circuit: 'OPEN'
    })
});
// Health checker
const health = new observability_1.HealthChecker();
health.addCheck('memory', async () => {
    const mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    if (mb > 400)
        throw new Error(`Memory too high: ${mb}MB`);
    return { message: `${mb}MB used` };
});
health.addCheck('uptime', async () => ({
    message: `${Math.round(process.uptime())}s`
}));
health.addCheck('event-bus', async () => ({
    message: 'healthy',
    details: { types: eventBus.getEventTypes().length }
}));
health.addCheck('queue', async () => {
    const stats = emailQueue.getStats();
    return { message: 'healthy', details: stats };
});
const users = [];
const posts = [];
let userIdSeq = 1;
let postIdSeq = 1;
// ─── Validation Schemas ───────────────────────────────────────────────────────
const registerSchema = validation_1.v.object({
    name: validation_1.v.string().min(2).max(100),
    email: validation_1.v.string().email(),
    password: validation_1.v.string().min(8),
    role: validation_1.v.enum(['admin', 'user', 'guest']).optional()
});
const loginSchema = validation_1.v.object({
    email: validation_1.v.string().email(),
    password: validation_1.v.string().min(1)
});
const createPostSchema = validation_1.v.object({
    title: validation_1.v.string().min(3).max(200),
    content: validation_1.v.string().min(10)
});
const updatePostSchema = validation_1.v.object({
    title: validation_1.v.string().min(3).max(200).optional(),
    content: validation_1.v.string().min(10).optional()
});
const updateUserSchema = validation_1.v.object({
    name: validation_1.v.string().min(2).max(100).optional(),
    email: validation_1.v.string().email().optional()
});
const validateDemoSchema = validation_1.v.object({
    name: validation_1.v.string().min(2).max(50),
    email: validation_1.v.string().email(),
    age: validation_1.v.number().min(0).max(150).integer().optional(),
    role: validation_1.v.enum(['admin', 'user', 'guest']),
    tags: validation_1.v.array(validation_1.v.string().min(1)).max(5).optional()
});
// ─── Application ──────────────────────────────────────────────────────────────
const app = new core_1.Application({
    server: { port: config.PORT, host: config.HOST },
    env: config.NODE_ENV
});
// ─── Global Middleware ────────────────────────────────────────────────────────
app.use((0, security_1.helmet)());
app.use((0, core_1.cors)({ origin: '*' }));
app.use((0, security_1.rateLimit)({ max: 200, windowMs: 60000 }));
app.use((0, security_1.sanitize)());
app.use((0, observability_1.observabilityMiddleware)({ metrics, tracer }));
// =============================================================================
//  PHASE 1 — Core HTTP Server, Router, Middleware
// =============================================================================
/**
 * GET /api/phase1/hello
 * Basic hello world — confirms server is running
 */
app.get('/api/phase1/hello', (req, res) => {
    res.json({
        message: 'Hello from REstJS!',
        phase: 1,
        feature: 'Core HTTP Server'
    });
});
/**
 * GET /api/phase1/echo
 * Echoes query params, headers, and request info back to client
 * Try: /api/phase1/echo?name=Tariq&city=Lahore
 */
app.get('/api/phase1/echo', (req, res) => {
    res.json({
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip,
        headers: {
            'user-agent': req.headers['user-agent'],
            'content-type': req.headers['content-type'],
            'accept': req.headers['accept']
        }
    });
});
/**
 * POST /api/phase1/echo
 * Echoes the request body back
 * Body: any JSON
 */
app.post('/api/phase1/echo', (req, res) => {
    res.json({
        method: req.method,
        received: req.body,
        path: req.path
    });
});
/**
 * PUT /api/phase1/echo
 * Echoes a PUT body back
 */
app.put('/api/phase1/echo', (req, res) => {
    res.json({
        method: req.method,
        received: req.body
    });
});
/**
 * DELETE /api/phase1/echo
 * Echoes a DELETE request back
 */
app.delete('/api/phase1/echo', (req, res) => {
    res.json({
        method: req.method,
        message: 'DELETE received'
    });
});
/**
 * GET /api/phase1/params/:id
 * Single dynamic route parameter
 * Try: /api/phase1/params/42
 */
app.get('/api/phase1/params/:id', (req, res) => {
    res.json({
        message: 'Single param extracted',
        id: req.params.id,
        idAsNumber: Number(req.params.id)
    });
});
/**
 * GET /api/phase1/params/:id/items/:itemId
 * Multiple dynamic route parameters
 * Try: /api/phase1/params/10/items/99
 */
app.get('/api/phase1/params/:id/items/:itemId', (req, res) => {
    res.json({
        message: 'Multiple params extracted',
        params: req.params,
        query: req.query
    });
});
/**
 * GET /api/phase1/wildcard/*
 * Wildcard route — matches any path after /wildcard/
 * Try: /api/phase1/wildcard/a/b/c/d
 */
app.get('/api/phase1/wildcard/*', (req, res) => {
    res.json({
        message: 'Wildcard matched',
        captured: req.params['*'],
        fullPath: req.path
    });
});
/**
 * GET /api/phase1/middleware-demo
 * Shows middleware chain execution order
 * Three middleware functions run before the handler
 */
app.get('/api/phase1/middleware-demo', 
// Middleware 1 — adds step1 to locals
(req, res, next) => {
    req.locals.step1 = 'middleware-one-ran';
    req.locals.startedAt = Date.now();
    next();
}, 
// Middleware 2 — adds step2 to locals
(req, res, next) => {
    req.locals.step2 = 'middleware-two-ran';
    next();
}, 
// Middleware 3 — adds step3 to locals
(req, res, next) => {
    req.locals.step3 = 'middleware-three-ran';
    next();
}, 
// Final handler
(req, res) => {
    res.json({
        message: 'All middleware ran in order',
        locals: req.locals,
        totalTimeMs: Date.now() - req.locals.startedAt
    });
});
/**
 * GET /api/phase1/error-demo
 * Error handling demonstration
 * Query: ?type=not-found | forbidden | validation | generic
 */
app.get('/api/phase1/error-demo', (req, res) => {
    const type = req.query.type || 'generic';
    switch (type) {
        case 'not-found':
            res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'Resource not found' }
            });
            break;
        case 'forbidden':
            res.status(403).json({
                error: { code: 'FORBIDDEN', message: 'Access forbidden' }
            });
            break;
        case 'validation':
            res.status(422).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Validation failed',
                    details: [
                        { path: 'email', message: 'email must be a valid email address' },
                        { path: 'name', message: 'name must be at least 2 characters' }
                    ]
                }
            });
            break;
        case 'server':
            throw new Error('Intentional server error for testing');
        default:
            res.status(500).json({
                error: { code: 'INTERNAL_ERROR', message: 'Generic server error' }
            });
    }
});
/**
 * GET /api/phase1/status-codes
 * Returns various HTTP status codes for testing
 * Query: ?code=200|201|400|401|403|404|500
 */
app.get('/api/phase1/status-codes', (req, res) => {
    const code = Number(req.query.code) || 200;
    const messages = {
        200: 'OK',
        201: 'Created',
        204: 'No Content',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        503: 'Service Unavailable'
    };
    res.status(code).json({
        statusCode: code,
        message: messages[code] || 'Unknown'
    });
});
// =============================================================================
//  PHASE 2 — Config, Security, SSE
// =============================================================================
/**
 * GET /api/phase2/config
 * Shows current non-sensitive configuration
 */
app.get('/api/phase2/config', (req, res) => {
    res.json({
        feature: 'defineConfig — typed and validated env vars',
        config: {
            port: config.PORT,
            host: config.HOST,
            env: config.NODE_ENV
        },
        note: 'JWT_SECRET is hidden — never expose secrets in responses'
    });
});
/**
 * GET /api/phase2/security-headers
 * Shows what security headers helmet adds
 * Check the Headers tab in Postman response panel
 */
app.get('/api/phase2/security-headers', (req, res) => {
    res.json({
        feature: 'helmet() — security response headers',
        message: 'Open Postman Headers tab to see all security headers',
        headers: [
            'Content-Security-Policy',
            'X-Frame-Options: DENY',
            'Strict-Transport-Security',
            'X-Content-Type-Options: nosniff',
            'X-XSS-Protection: 1; mode=block',
            'Referrer-Policy: no-referrer',
            'Permissions-Policy'
        ]
    });
});
/**
 * GET /api/phase2/rate-limit
 * Shows rate limit headers
 * Check Headers tab: X-RateLimit-Limit, X-RateLimit-Remaining
 */
app.get('/api/phase2/rate-limit', (req, res) => {
    res.json({
        feature: 'rateLimit() — per-IP request throttling',
        message: 'Check X-RateLimit-* headers in Postman',
        limit: 200,
        window: '60 seconds',
        tip: 'Hit this endpoint 200+ times to trigger a 429 response'
    });
});
/**
 * POST /api/phase2/sanitize
 * Input sanitization demo
 * Body: { text: "<script>alert(1)</script>" }
 * The HTML is escaped before it reaches the handler
 */
app.post('/api/phase2/sanitize', (req, res) => {
    const body = req.body;
    res.json({
        feature: 'sanitize() — HTML escaping middleware',
        received: body,
        message: 'Any HTML in the input has been escaped',
        tip: 'Send <script>alert(1)</script> and see it become &lt;script&gt;'
    });
});
/**
 * GET /api/phase2/health
 * Application health status
 */
app.get('/api/phase2/health', (req, res) => {
    res.json({
        status: 'ok',
        phase: 2,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: {
            heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        node: process.version
    });
});
/**
 * GET /api/phase2/sse
 * Server-Sent Events — real-time streaming
 * Sends 5 events, one per second, then closes
 *
 * In Postman:
 *   Method: GET
 *   URL: http://localhost:3000/api/phase2/sse
 *   Send → watch the response stream in real time
 */
app.get('/api/phase2/sse', (req, res) => {
    const sse = (0, core_1.createSSE)(res);
    const stopBeat = (0, core_1.sseHeartbeat)(sse, 10000);
    let count = 0;
    // First event immediately
    sse.send({ message: 'SSE stream opened', timestamp: Date.now() }, 'connect');
    const interval = setInterval(() => {
        if (!sse.isOpen) {
            clearInterval(interval);
            stopBeat();
            return;
        }
        count++;
        sse.send({ count, message: `Event ${count}`, timestamp: Date.now() }, 'update');
        if (count >= 5) {
            sse.send({ message: 'All events sent — stream closing', total: count }, 'done');
            sse.close();
            clearInterval(interval);
            stopBeat();
        }
    }, 1000);
});
// =============================================================================
//  PHASE 3 — Authentication, Users, Posts, Validation
// =============================================================================
// ── Authentication ────────────────────────────────────────────────────────────
/**
 * POST /api/phase3/auth/register
 * Register a new user account
 *
 * Body:
 * {
 *   "name":     "Tariq Mehmood",
 *   "email":    "tariq@restjs.dev",
 *   "password": "secret123",
 *   "role":     "admin"         ← optional: admin | user | guest
 * }
 */
app.post('/api/phase3/auth/register', (0, validation_1.validate)({ body: registerSchema }), async (req, res) => {
    const body = req.body;
    // Check duplicate email
    const exists = users.find(u => u.email === body.email);
    if (exists) {
        res.status(409).json({
            error: { code: 'CONFLICT', message: 'Email already registered' }
        });
        return;
    }
    // Hash password — never store plaintext
    const hashed = await (0, auth_3.hashPassword)(body.password);
    const user = {
        id: userIdSeq++,
        name: body.name,
        email: body.email,
        password: hashed,
        role: body.role || 'user',
        createdAt: new Date().toISOString()
    };
    users.push(user);
    // Never return the password
    const { password: _, ...safeUser } = user;
    res.status(201).json({
        message: 'User registered successfully',
        data: safeUser
    });
});
/**
 * POST /api/phase3/auth/login
 * Login with email and password — returns a JWT token
 *
 * Body:
 * {
 *   "email":    "tariq@restjs.dev",
 *   "password": "secret123"
 * }
 *
 * Response includes token — copy it for use in Authorization header
 */
app.post('/api/phase3/auth/login', (0, validation_1.validate)({ body: loginSchema }), async (req, res) => {
    const body = req.body;
    const user = users.find(u => u.email === body.email);
    if (!user) {
        res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' }
        });
        return;
    }
    const valid = await (0, auth_3.verifyPassword)(body.password, user.password);
    if (!valid) {
        res.status(401).json({
            error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' }
        });
        return;
    }
    // Sign JWT with user info embedded in payload
    const token = jwt.sign({
        sub: String(user.id),
        role: user.role,
        email: user.email,
        name: user.name
    }, { expiresIn: '7d' });
    const { password: _, ...safeUser } = user;
    res.json({
        message: 'Login successful',
        token,
        data: safeUser
    });
});
/**
 * GET /api/phase3/auth/me
 * Get the currently authenticated user
 * Header: Authorization: Bearer <token>
 */
app.get('/api/phase3/auth/me', (0, auth_2.authenticate)(jwt), (req, res) => {
    const authUser = req.locals.user;
    const user = users.find(u => u.id === Number(authUser.sub));
    if (!user) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: 'User not found' }
        });
        return;
    }
    const { password: _, ...safeUser } = user;
    res.json({
        message: 'Authenticated user',
        data: safeUser,
        token: {
            sub: authUser.sub,
            role: authUser.role,
            expiresAt: authUser.exp
                ? new Date(authUser.exp * 1000).toISOString()
                : 'no expiry'
        }
    });
});
/**
 * POST /api/phase3/auth/verify
 * Verify a JWT token — check if it is valid
 *
 * Body: { "token": "eyJ..." }
 */
app.post('/api/phase3/auth/verify', (req, res) => {
    const body = req.body;
    if (!body.token) {
        res.status(400).json({
            error: { code: 'BAD_REQUEST', message: 'token field is required' }
        });
        return;
    }
    try {
        const payload = jwt.verify(body.token);
        res.json({
            valid: true,
            payload,
            message: 'Token is valid'
        });
    }
    catch (err) {
        res.status(401).json({
            valid: false,
            error: err.message,
            message: 'Token is invalid or expired'
        });
    }
});
/**
 * POST /api/phase3/auth/refresh
 * Refresh a JWT token — returns a new token with a fresh expiry
 * Header: Authorization: Bearer <token>
 */
app.post('/api/phase3/auth/refresh', (0, auth_2.authenticate)(jwt), (req, res) => {
    const authUser = req.locals.user;
    const newToken = jwt.sign({
        sub: authUser.sub,
        role: authUser.role,
        email: authUser.email,
        name: authUser.name
    }, { expiresIn: '7d' });
    res.json({
        message: 'Token refreshed — new 7 day expiry',
        token: newToken
    });
});
// ── Users CRUD ────────────────────────────────────────────────────────────────
/**
 * GET /api/phase3/users
 * List all users — admin role required
 * Header: Authorization: Bearer <token>
 * Query:  ?page=1&perPage=10
 */
app.get('/api/phase3/users', (0, auth_2.authenticate)(jwt), (0, auth_2.requireRole)('admin'), (req, res) => {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;
    const safeUsers = users
        .slice(offset, offset + perPage)
        .map(({ password: _, ...u }) => u);
    res.json({
        data: safeUsers,
        total: users.length,
        page,
        perPage,
        totalPages: Math.ceil(users.length / perPage)
    });
});
/**
 * GET /api/phase3/users/:id
 * Get a single user by ID
 * Header: Authorization: Bearer <token>
 */
app.get('/api/phase3/users/:id', (0, auth_2.authenticate)(jwt), (req, res) => {
    const user = users.find(u => u.id === Number(req.params.id));
    if (!user) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: `User ${req.params.id} not found` }
        });
        return;
    }
    const { password: _, ...safeUser } = user;
    res.json({ data: safeUser });
});
/**
 * PUT /api/phase3/users/:id
 * Update a user — own account or admin
 * Header: Authorization: Bearer <token>
 *
 * Body:
 * {
 *   "name":  "New Name",
 *   "email": "new@email.com"
 * }
 */
app.put('/api/phase3/users/:id', (0, auth_2.authenticate)(jwt), (0, validation_1.validate)({ body: updateUserSchema }), (req, res) => {
    const authUser = req.locals.user;
    const targetId = Number(req.params.id);
    const index = users.findIndex(u => u.id === targetId);
    if (index === -1) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: 'User not found' }
        });
        return;
    }
    const isAdmin = authUser.role === 'admin';
    const isOwner = Number(authUser.sub) === targetId;
    if (!isAdmin && !isOwner) {
        res.status(403).json({
            error: { code: 'FORBIDDEN', message: 'Cannot update another user' }
        });
        return;
    }
    const body = req.body;
    users[index] = { ...users[index], ...body };
    const { password: _, ...safeUser } = users[index];
    res.json({ message: 'User updated', data: safeUser });
});
/**
 * DELETE /api/phase3/users/:id
 * Delete a user — admin only
 * Header: Authorization: Bearer <token>
 */
app.delete('/api/phase3/users/:id', (0, auth_2.authenticate)(jwt), (0, auth_2.requireRole)('admin'), (req, res) => {
    const index = users.findIndex(u => u.id === Number(req.params.id));
    if (index === -1) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: 'User not found' }
        });
        return;
    }
    users.splice(index, 1);
    res.status(204).send('');
});
// ── Posts CRUD ────────────────────────────────────────────────────────────────
/**
 * GET /api/phase3/posts
 * List all posts — public, no auth required
 * Query: ?page=1&perPage=10
 */
app.get('/api/phase3/posts', (req, res) => {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.perPage) || 10;
    const offset = (page - 1) * perPage;
    const page_posts = posts.slice(offset, offset + perPage);
    // Enrich posts with author name
    const enriched = page_posts.map(post => {
        const author = users.find(u => u.id === post.authorId);
        return {
            ...post,
            author: author
                ? { id: author.id, name: author.name }
                : null
        };
    });
    res.json({
        data: enriched,
        total: posts.length,
        page,
        perPage,
        totalPages: Math.ceil(posts.length / perPage)
    });
});
/**
 * GET /api/phase3/posts/:id
 * Get a single post by ID — public
 */
app.get('/api/phase3/posts/:id', (req, res) => {
    const post = posts.find(p => p.id === Number(req.params.id));
    if (!post) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: `Post ${req.params.id} not found` }
        });
        return;
    }
    const author = users.find(u => u.id === post.authorId);
    res.json({
        data: {
            ...post,
            author: author
                ? { id: author.id, name: author.name, email: author.email }
                : null
        }
    });
});
/**
 * POST /api/phase3/posts
 * Create a new post — requires authentication
 * Header: Authorization: Bearer <token>
 *
 * Body:
 * {
 *   "title":   "My First Post",
 *   "content": "This is the post content, at least 10 chars."
 * }
 */
app.post('/api/phase3/posts', (0, auth_2.authenticate)(jwt), (0, validation_1.validate)({ body: createPostSchema }), (req, res) => {
    const authUser = req.locals.user;
    const body = req.body;
    const post = {
        id: postIdSeq++,
        title: body.title,
        content: body.content,
        authorId: Number(authUser.sub),
        createdAt: new Date().toISOString()
    };
    posts.push(post);
    res.status(201).json({
        message: 'Post created',
        data: post
    });
});
/**
 * PUT /api/phase3/posts/:id
 * Update a post — must be the author or an admin
 * Header: Authorization: Bearer <token>
 *
 * Body:
 * {
 *   "title":   "Updated Title",
 *   "content": "Updated content here."
 * }
 */
app.put('/api/phase3/posts/:id', (0, auth_2.authenticate)(jwt), (0, validation_1.validate)({ body: updatePostSchema }), (req, res) => {
    const authUser = req.locals.user;
    const index = posts.findIndex(p => p.id === Number(req.params.id));
    if (index === -1) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: 'Post not found' }
        });
        return;
    }
    const isAdmin = authUser.role === 'admin';
    const isOwner = posts[index].authorId === Number(authUser.sub);
    if (!isAdmin && !isOwner) {
        res.status(403).json({
            error: { code: 'FORBIDDEN', message: 'Cannot edit this post' }
        });
        return;
    }
    const body = req.body;
    posts[index] = { ...posts[index], ...body };
    res.json({ message: 'Post updated', data: posts[index] });
});
/**
 * DELETE /api/phase3/posts/:id
 * Delete a post — must be the author or an admin
 * Header: Authorization: Bearer <token>
 */
app.delete('/api/phase3/posts/:id', (0, auth_2.authenticate)(jwt), (req, res) => {
    const authUser = req.locals.user;
    const index = posts.findIndex(p => p.id === Number(req.params.id));
    if (index === -1) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: 'Post not found' }
        });
        return;
    }
    const isAdmin = authUser.role === 'admin';
    const isOwner = posts[index].authorId === Number(authUser.sub);
    if (!isAdmin && !isOwner) {
        res.status(403).json({
            error: { code: 'FORBIDDEN', message: 'Cannot delete this post' }
        });
        return;
    }
    posts.splice(index, 1);
    res.status(204).send('');
});
// ── Validation Demo ───────────────────────────────────────────────────────────
/**
 * POST /api/phase3/validate/pass
 * Send valid data — should return 200 with validated body
 *
 * Body:
 * {
 *   "name":  "Tariq",
 *   "email": "tariq@restjs.dev",
 *   "role":  "admin",
 *   "age":   30,
 *   "tags":  ["js", "ts"]
 * }
 */
app.post('/api/phase3/validate/pass', (0, validation_1.validate)({ body: validateDemoSchema }), (req, res) => {
    res.json({
        message: 'All validation passed',
        validated: req.body
    });
});
/**
 * POST /api/phase3/validate/fail
 * Send intentionally bad data — should return 422 with error list
 *
 * Body:
 * {
 *   "name":  "T",
 *   "email": "not-an-email",
 *   "role":  "superuser",
 *   "age":   -5
 * }
 */
app.post('/api/phase3/validate/fail', (0, validation_1.validate)({ body: validateDemoSchema }), (req, res) => {
    // This handler only runs if validation passes
    // If body is bad, the validate middleware returns 422 automatically
    res.json({
        message: 'Validation passed (you sent valid data)',
        validated: req.body
    });
});
/**
 * POST /api/phase3/validate/schema-builder
 * Demonstrates all schema builder capabilities
 *
 * Body: any data — see what passes and what fails
 * {
 *   "username":   "tariq",
 *   "website":    "https://restjs.dev",
 *   "score":      95,
 *   "active":     true,
 *   "tags":       ["js", "ts", "ai"],
 *   "address": {
 *     "city":    "Lahore",
 *     "country": "PK"
 *   }
 * }
 */
app.post('/api/phase3/validate/schema-builder', (req, res) => {
    const schema = validation_1.v.object({
        username: validation_1.v.string().min(3).max(30),
        website: validation_1.v.string().url().optional(),
        score: validation_1.v.number().min(0).max(100).integer(),
        active: validation_1.v.boolean(),
        tags: validation_1.v.array(validation_1.v.string().min(1)).min(1).max(10),
        address: validation_1.v.object({
            city: validation_1.v.string().min(2),
            country: validation_1.v.string().min(2).max(2)
        }).optional()
    });
    const result = schema.parse(req.body);
    if (!result.success) {
        res.status(422).json({
            message: 'Validation failed',
            errors: result.errors
        });
        return;
    }
    res.json({
        message: 'Validation passed',
        validated: result.data
    });
});
// ── RBAC Demo ─────────────────────────────────────────────────────────────────
/**
 * GET /api/phase3/rbac/admin-only
 * Only users with role = admin can access
 * Header: Authorization: Bearer <token>
 */
app.get('/api/phase3/rbac/admin-only', (0, auth_2.authenticate)(jwt), (0, auth_2.requireRole)('admin'), (req, res) => {
    const authUser = req.locals.user;
    res.json({
        message: 'Admin area — access granted',
        user: {
            id: authUser.sub,
            role: authUser.role
        }
    });
});
/**
 * GET /api/phase3/rbac/user-only
 * Only users with role = user can access
 * Header: Authorization: Bearer <token>
 */
app.get('/api/phase3/rbac/user-only', (0, auth_2.authenticate)(jwt), (0, auth_2.requireRole)('user'), (req, res) => {
    const authUser = req.locals.user;
    res.json({
        message: 'User area — access granted',
        user: {
            id: authUser.sub,
            role: authUser.role
        }
    });
});
/**
 * GET /api/phase3/rbac/any-role
 * Any authenticated user can access (any role)
 * Header: Authorization: Bearer <token>
 */
app.get('/api/phase3/rbac/any-role', (0, auth_2.authenticate)(jwt), (req, res) => {
    const authUser = req.locals.user;
    res.json({
        message: 'Authenticated area — access granted',
        user: {
            id: authUser.sub,
            role: authUser.role,
            email: authUser.email
        }
    });
});
/**
 * GET /api/phase3/rbac/optional-auth
 * Public — works with or without a token
 * With token → shows user info
 * Without token → shows public response
 * Header: Authorization: Bearer <token>  ← optional
 */
app.get('/api/phase3/rbac/optional-auth', (0, auth_2.authenticate)(jwt, { required: false }), (req, res) => {
    const authUser = req.locals.user;
    if (authUser) {
        res.json({
            message: 'You are authenticated',
            authenticated: true,
            user: {
                id: authUser.sub,
                role: authUser.role
            }
        });
    }
    else {
        res.json({
            message: 'You are not authenticated — public response',
            authenticated: false
        });
    }
});
// =============================================================================
//  PHASE 4 — Events, Queue, Scheduler, Circuit Breaker,
//             Retry, Timeout, Observability, WebSocket
// =============================================================================
// ── Event Bus ─────────────────────────────────────────────────────────────────
/**
 * POST /api/phase4/events/emit
 * Emit a custom event on the event bus
 *
 * Body:
 * {
 *   "type":    "user.created",
 *   "payload": { "id": 1, "name": "Tariq" }
 * }
 */
app.post('/api/phase4/events/emit', async (req, res) => {
    const body = req.body;
    if (!body.type) {
        res.status(400).json({
            error: { code: 'BAD_REQUEST', message: 'type field is required' }
        });
        return;
    }
    await eventBus.emit(body.type, body.payload || {}, {
        source: 'postman-test'
    });
    res.json({
        message: 'Event emitted',
        type: body.type,
        payload: body.payload,
        listeners: eventBus.getHandlerCount(body.type),
        tip: 'Then call GET /api/phase4/events/history to see it'
    });
});
/**
 * GET /api/phase4/events/history
 * View recent events from the event bus
 * Query: ?type=user.created  ← optional filter
 */
app.get('/api/phase4/events/history', (req, res) => {
    const type = req.query.type;
    const history = eventBus.getHistory(type);
    const last20 = history.slice(-20).reverse();
    res.json({
        total: history.length,
        filter: type || 'all',
        events: last20
    });
});
/**
 * GET /api/phase4/events/types
 * List all event types that have registered listeners
 */
app.get('/api/phase4/events/types', (req, res) => {
    res.json({
        types: eventBus.getEventTypes(),
        total: eventBus.getEventTypes().length
    });
});
/**
 * POST /api/phase4/events/subscribe-demo
 * Register a one-time demo listener then emit an event to it
 * Shows once() — auto-unsubscribes after first event
 *
 * Body: { "type": "demo.event" }
 */
app.post('/api/phase4/events/subscribe-demo', async (req, res) => {
    const body = req.body;
    const eventType = body.type || 'demo.event';
    const received = [];
    // Register a once() listener — fires only once then unsubscribes
    eventBus.once(eventType, (event) => {
        received.push(event.payload);
    });
    // Emit the event
    await eventBus.emit(eventType, {
        message: 'This is a demo event',
        timestamp: Date.now()
    });
    // Small delay so the listener fires
    await new Promise(r => setTimeout(r, 50));
    res.json({
        message: 'once() listener registered and fired',
        eventType,
        received,
        note: 'The listener is now unsubscribed — it will not fire again'
    });
});
// ── Queue ─────────────────────────────────────────────────────────────────────
/**
 * POST /api/phase4/queue/add
 * Add a job to the email queue
 *
 * Body:
 * {
 *   "jobName": "send-welcome",
 *   "data":    { "email": "test@example.com", "name": "Test User" },
 *   "delay":   0,
 *   "priority": 0
 * }
 *
 * Valid jobName values: send-welcome | send-notification
 */
app.post('/api/phase4/queue/add', async (req, res) => {
    const body = req.body;
    if (!body.jobName) {
        res.status(400).json({
            error: { code: 'BAD_REQUEST', message: 'jobName is required' }
        });
        return;
    }
    const validJobs = ['send-welcome', 'send-notification'];
    if (!validJobs.includes(body.jobName)) {
        res.status(400).json({
            error: {
                code: 'BAD_REQUEST',
                message: `Invalid jobName. Use: ${validJobs.join(' | ')}`
            }
        });
        return;
    }
    const job = await emailQueue.add(body.jobName, body.data || {}, {
        delay: body.delay || 0,
        priority: body.priority || 0,
        maxAttempts: 3
    });
    res.status(201).json({
        message: 'Job added to queue',
        job: {
            id: job.id,
            name: job.name,
            status: job.status,
            priority: job.priority,
            runAt: job.runAt
        }
    });
});
/**
 * POST /api/phase4/queue/add-many
 * Add multiple jobs at once
 *
 * Body:
 * {
 *   "jobName": "send-notification",
 *   "items": [
 *     { "email": "a@test.com", "message": "Hello A" },
 *     { "email": "b@test.com", "message": "Hello B" }
 *   ]
 * }
 */
app.post('/api/phase4/queue/add-many', async (req, res) => {
    const body = req.body;
    if (!body.jobName || !body.items || !Array.isArray(body.items)) {
        res.status(400).json({
            error: { code: 'BAD_REQUEST', message: 'jobName and items[] are required' }
        });
        return;
    }
    const jobs = await emailQueue.addMany(body.jobName, body.items);
    res.status(201).json({
        message: `${jobs.length} jobs added`,
        jobs: jobs.map(j => ({ id: j.id, name: j.name, status: j.status }))
    });
});
/**
 * GET /api/phase4/queue/stats
 * Get queue statistics — pending, active, completed, failed
 */
app.get('/api/phase4/queue/stats', (req, res) => {
    res.json({
        queue: 'emails',
        stats: emailQueue.getStats()
    });
});
/**
 * GET /api/phase4/queue/jobs
 * List jobs filtered by status
 * Query: ?status=pending | active | completed | failed | delayed
 */
app.get('/api/phase4/queue/jobs', (req, res) => {
    const status = req.query.status;
    const jobs = emailQueue.getJobs(status);
    res.json({
        filter: status || 'all',
        total: jobs.length,
        jobs: jobs.slice(0, 50)
    });
});
/**
 * GET /api/phase4/queue/jobs/:id
 * Get a specific job by ID
 */
app.get('/api/phase4/queue/jobs/:id', (req, res) => {
    const job = emailQueue.getJob(req.params.id);
    if (!job) {
        res.status(404).json({
            error: { code: 'NOT_FOUND', message: `Job ${req.params.id} not found` }
        });
        return;
    }
    res.json({ data: job });
});
/**
 * DELETE /api/phase4/queue/purge
 * Remove all completed and failed jobs from memory
 */
app.delete('/api/phase4/queue/purge', (req, res) => {
    const before = emailQueue.getStats();
    emailQueue.purge();
    const after = emailQueue.getStats();
    res.json({
        message: 'Completed and failed jobs purged',
        before,
        after
    });
});
// ── Scheduler ─────────────────────────────────────────────────────────────────
/**
 * GET /api/phase4/scheduler/tasks
 * List all scheduled tasks and their cron expressions
 */
app.get('/api/phase4/scheduler/tasks', (req, res) => {
    res.json({
        tasks: scheduler.getTasks(),
        running: true
    });
});
/**
 * POST /api/phase4/scheduler/run-now
 * Manually trigger a scheduled task immediately
 *
 * Body: { "name": "log-stats" }
 */
app.post('/api/phase4/scheduler/run-now', async (req, res) => {
    const body = req.body;
    if (!body.name) {
        res.status(400).json({
            error: { code: 'BAD_REQUEST', message: 'name is required' }
        });
        return;
    }
    try {
        await scheduler.runNow(body.name);
        res.json({
            message: `Task '${body.name}' executed immediately`,
            tip: 'Check server console for task output'
        });
    }
    catch (err) {
        res.status(404).json({
            error: {
                code: 'NOT_FOUND',
                message: err.message
            }
        });
    }
});
// ── Circuit Breaker ───────────────────────────────────────────────────────────
/**
 * POST /api/phase4/circuit/call
 * Simulate a call through the circuit breaker
 *
 * Body:
 * {
 *   "shouldFail": false
 * }
 *
 * Call with shouldFail:true 3+ times to open the circuit.
 * Then call with shouldFail:false — circuit returns fallback immediately.
 * After 15 seconds circuit goes HALF_OPEN and tests recovery.
 */
app.post('/api/phase4/circuit/call', async (req, res) => {
    const body = req.body;
    try {
        const result = await externalCB.execute(async () => {
            // Simulate latency
            await new Promise(r => setTimeout(r, 100));
            if (body.shouldFail) {
                throw new Error('External API returned 500');
            }
            return {
                data: 'Success from external API',
                latencyMs: 100
            };
        });
        res.json({
            success: true,
            result,
            circuit: externalCB.getStats()
        });
    }
    catch (err) {
        res.status(503).json({
            success: false,
            error: err.message,
            circuit: externalCB.getStats()
        });
    }
});
/**
 * GET /api/phase4/circuit/stats
 * View circuit breaker state and counters
 */
app.get('/api/phase4/circuit/stats', (req, res) => {
    res.json({
        name: 'external-api',
        stats: externalCB.getStats(),
        states: {
            CLOSED: 'Normal — requests pass through',
            OPEN: 'Tripped — requests return fallback immediately',
            HALF_OPEN: 'Testing — one request allowed to check recovery'
        }
    });
});
/**
 * POST /api/phase4/circuit/reset
 * Manually reset the circuit to CLOSED state
 */
app.post('/api/phase4/circuit/reset', (req, res) => {
    externalCB.reset();
    res.json({
        message: 'Circuit manually reset to CLOSED',
        stats: externalCB.getStats()
    });
});
// ── Retry ─────────────────────────────────────────────────────────────────────
/**
 * POST /api/phase4/retry/fixed
 * Retry with fixed delay
 *
 * Body:
 * {
 *   "failTimes": 2,
 *   "delay":     200
 * }
 *
 * failTimes = how many attempts will fail before succeeding
 * delay     = milliseconds between retries
 */
app.post('/api/phase4/retry/fixed', async (req, res) => {
    const body = req.body;
    const failTimes = Math.min(body.failTimes ?? 2, 4);
    const delayMs = Math.min(body.delay ?? 200, 1000);
    let attempts = 0;
    const log = [];
    try {
        const result = await (0, circuit_1.retry)(async () => {
            attempts++;
            log.push(`Attempt ${attempts} — ${attempts <= failTimes ? 'FAIL' : 'SUCCESS'}`);
            if (attempts <= failTimes) {
                throw new Error(`Attempt ${attempts} failed`);
            }
            return { success: true, succeededOn: attempts };
        }, {
            attempts: 5,
            delay: delayMs,
            backoff: 'fixed'
        });
        res.json({ strategy: 'fixed', delayMs, log, result });
    }
    catch (err) {
        res.status(500).json({
            strategy: 'fixed',
            delayMs,
            log,
            error: err.message
        });
    }
});
/**
 * POST /api/phase4/retry/exponential
 * Retry with exponential backoff
 *
 * Body:
 * {
 *   "failTimes": 3,
 *   "delay":     100
 * }
 *
 * Delays: 100ms, 200ms, 400ms, 800ms...
 */
app.post('/api/phase4/retry/exponential', async (req, res) => {
    const body = req.body;
    const failTimes = Math.min(body.failTimes ?? 3, 4);
    const delayMs = Math.min(body.delay ?? 100, 500);
    let attempts = 0;
    const log = [];
    try {
        const result = await (0, circuit_1.retry)(async () => {
            attempts++;
            log.push(`Attempt ${attempts}`);
            if (attempts <= failTimes)
                throw new Error(`Fail ${attempts}`);
            return { success: true, succeededOn: attempts };
        }, {
            attempts: 5,
            delay: delayMs,
            backoff: 'exponential',
            jitter: false,
            onRetry: (attempt, err, nextDelay) => {
                log.push(`  → retry in ${nextDelay}ms`);
            }
        });
        res.json({ strategy: 'exponential', baseDelayMs: delayMs, log, result });
    }
    catch (err) {
        res.status(500).json({
            strategy: 'exponential',
            log,
            error: err.message
        });
    }
});
/**
 * POST /api/phase4/retry/skip
 * Shows retryIf — some errors should not be retried
 *
 * Body: { "errorType": "retryable" | "permanent" }
 */
app.post('/api/phase4/retry/skip', async (req, res) => {
    const body = req.body;
    const permanent = body.errorType === 'permanent';
    let attempts = 0;
    try {
        const result = await (0, circuit_1.retry)(async () => {
            attempts++;
            if (permanent) {
                const err = Object.assign(new Error('Permanent error — do not retry'), { permanent: true });
                throw err;
            }
            if (attempts < 3) {
                throw new Error(`Transient error on attempt ${attempts}`);
            }
            return { success: true, attempts };
        }, {
            attempts: 5,
            delay: 50,
            // Skip retry for permanent errors
            retryIf: (err) => !err.permanent
        });
        res.json({ result, attempts });
    }
    catch (err) {
        res.status(500).json({
            error: err.message,
            attempts,
            note: permanent
                ? 'Permanent error — retry was skipped'
                : 'All retries exhausted'
        });
    }
});
// ── Timeout ───────────────────────────────────────────────────────────────────
/**
 * POST /api/phase4/timeout/demo
 * Wrap an operation in a timeout
 *
 * Body:
 * {
 *   "operationMs": 2000,
 *   "timeoutMs":   1000
 * }
 *
 * If operationMs > timeoutMs → 408 timeout
 * If operationMs < timeoutMs → 200 success
 */
app.post('/api/phase4/timeout/demo', async (req, res) => {
    const body = req.body;
    const operationMs = Math.min(body.operationMs ?? 2000, 8000);
    const timeoutMs = Math.min(body.timeoutMs ?? 1000, 8000);
    try {
        const result = await (0, circuit_1.withTimeout)(new Promise(resolve => {
            setTimeout(() => resolve('Operation completed successfully'), operationMs);
        }), timeoutMs);
        res.json({
            success: true,
            result,
            operationMs,
            timeoutMs,
            note: 'Operation finished before timeout'
        });
    }
    catch (err) {
        res.status(408).json({
            success: false,
            error: err.message,
            operationMs,
            timeoutMs,
            note: 'Operation exceeded timeout and was cancelled'
        });
    }
});
// ── Health Checks ─────────────────────────────────────────────────────────────
/**
 * GET /api/phase4/health
 * Full health report — all registered checks run in parallel
 * Returns 200 if all checks pass, 503 if any fail
 */
app.get('/api/phase4/health', health.handler());
/**
 * GET /api/phase4/health/live
 * Liveness probe — is the process alive?
 * Kubernetes uses this to decide if the pod should be restarted.
 * Always returns 200 if the event loop is responsive.
 */
app.get('/api/phase4/health/live', health.livenessHandler());
/**
 * GET /api/phase4/health/ready
 * Readiness probe — is the app ready to serve traffic?
 * Kubernetes uses this to decide if requests should be routed here.
 * Returns 503 if any dependency check fails.
 */
app.get('/api/phase4/health/ready', health.readinessHandler());
// ── Metrics ───────────────────────────────────────────────────────────────────
/**
 * GET /api/phase4/metrics
 * Prometheus metrics in text format
 * Paste this URL into Prometheus scrape config or Grafana data source.
 */
app.get('/api/phase4/metrics', (0, observability_1.metricsHandler)(metrics));
/**
 * GET /api/phase4/metrics/summary
 * Human-readable metrics summary (JSON format — easier in Postman)
 */
app.get('/api/phase4/metrics/summary', (req, res) => {
    res.json({
        feature: 'Prometheus-compatible metrics',
        note: 'GET /api/phase4/metrics returns raw Prometheus text format',
        tip: 'Paste http://localhost:3000/api/phase4/metrics into Prometheus',
        counters: {
            http_requests_total: 'Total HTTP requests by method, path, status'
        },
        histograms: {
            http_request_duration_ms: 'Request duration distribution'
        },
        gauges: {
            http_active_requests: 'Currently in-flight requests'
        }
    });
});
// ── Tracing ───────────────────────────────────────────────────────────────────
/**
 * GET /api/phase4/trace/demo
 * Manual trace demonstration — root span with child spans
 * Also see traceparent and x-b3-traceid in response headers
 */
app.get('/api/phase4/trace/demo', async (req, res) => {
    // Root span
    const root = tracer.startSpan('demo.root');
    root.setAttribute('demo.type', 'manual');
    root.addEvent('root.started');
    // Child span 1 — database query simulation
    const dbSpan = root.startChild('demo.database-query');
    dbSpan.setAttribute('db.table', 'users');
    dbSpan.setAttribute('db.operation', 'SELECT');
    await new Promise(r => setTimeout(r, 30));
    dbSpan.setStatus('ok');
    const dbData = dbSpan.end();
    // Child span 2 — cache lookup simulation
    const cacheSpan = root.startChild('demo.cache-lookup');
    cacheSpan.setAttribute('cache.key', 'user:profile:1');
    await new Promise(r => setTimeout(r, 10));
    cacheSpan.setStatus('ok');
    const cacheData = cacheSpan.end();
    root.addEvent('root.finished');
    root.setStatus('ok');
    const rootData = root.end();
    res.json({
        feature: 'Distributed tracing — W3C Trace Context',
        tip: 'Check traceparent and x-b3-traceid in response Headers tab',
        traceId: rootData.traceId,
        spans: [
            {
                name: rootData.name,
                spanId: rootData.spanId,
                durationMs: rootData.endTime - rootData.startTime,
                status: rootData.status,
                events: rootData.events.map(e => e.name)
            },
            {
                name: dbData.name,
                spanId: dbData.spanId,
                parentId: rootData.spanId,
                durationMs: dbData.endTime - dbData.startTime,
                attributes: dbData.attributes
            },
            {
                name: cacheData.name,
                spanId: cacheData.spanId,
                parentId: rootData.spanId,
                durationMs: cacheData.endTime - cacheData.startTime,
                attributes: cacheData.attributes
            }
        ]
    });
});
/**
 * GET /api/phase4/trace/history
 * View stored trace spans (in-memory exporter)
 */
app.get('/api/phase4/trace/history', (req, res) => {
    const spans = tracer.getSpans().slice(-20).reverse();
    res.json({
        total: tracer.getSpans().length,
        last20: spans.map(s => ({
            traceId: s.traceId,
            spanId: s.spanId,
            name: s.name,
            durationMs: s.endTime ? s.endTime - s.startTime : null,
            status: s.status
        }))
    });
});
// ── Logger ────────────────────────────────────────────────────────────────────
/**
 * GET /api/phase4/logger/demo
 * Write all log levels — watch the server console
 * Query: ?level=debug | info | warn | error
 */
app.get('/api/phase4/logger/demo', (req, res) => {
    const level = req.query.level || 'all';
    if (level === 'debug' || level === 'all') {
        logger.debug('Debug message', { detail: 'low-level info' });
    }
    if (level === 'info' || level === 'all') {
        logger.info('Info message', { event: 'something happened' });
    }
    if (level === 'warn' || level === 'all') {
        logger.warn('Warning message', { issue: 'something unexpected' });
    }
    if (level === 'error' || level === 'all') {
        logger.error('Error message', { error: 'something failed' });
    }
    // Child logger demo
    const child = logger.child({ requestId: req.headers['x-request-id'] || 'demo-123' });
    child.info('Child logger message — inherits context');
    res.json({
        feature: 'Structured logging',
        level,
        tip: 'Watch the server console for colored output',
        note: 'In production (NODE_ENV=production) output is JSON'
    });
});
// ── WebSocket Stats ───────────────────────────────────────────────────────────
/**
 * GET /api/phase4/websocket/stats
 * WebSocket server statistics
 */
app.get('/api/phase4/websocket/stats', (req, res) => {
    // wss is defined below in bootstrap — we expose stats here
    res.json({
        feature: 'WebSocket server (RFC 6455)',
        endpoint: `ws://localhost:${config.PORT}/ws`,
        tip: 'Use Postman WebSocket request to connect',
        commands: {
            ping: '{ "type": "ping" }',
            stats: '{ "type": "stats" }',
            join: '{ "type": "join",      "room": "my-room" }',
            message: '{ "type": "message",   "room": "my-room", "content": "Hello!" }',
            broadcast: '{ "type": "broadcast", "content": "To everyone" }',
            leave: '{ "type": "leave",     "room": "my-room" }'
        }
    });
});
// =============================================================================
//  ROOT — API index listing all endpoints
// =============================================================================
/**
 * GET /
 * Root endpoint — confirms server is alive
 */
app.get('/', (req, res) => {
    res.json({
        name: 'REstJS Testing Server',
        version: '0.1.0',
        author: 'Tariq Mehmood',
        tip: 'Visit GET /api for all endpoints'
    });
});
/**
 * GET /api
 * Complete list of all testable endpoints
 */
app.get('/api', (req, res) => {
    res.json({
        name: 'REstJS — Phase 1, 2, 3, 4 API',
        server: `http://localhost:${config.PORT}`,
        phases: {
            phase1: {
                description: 'Core HTTP Server, Router, Middleware',
                endpoints: [
                    'GET  /api/phase1/hello',
                    'GET  /api/phase1/echo',
                    'POST /api/phase1/echo',
                    'PUT  /api/phase1/echo',
                    'DELETE /api/phase1/echo',
                    'GET  /api/phase1/params/:id',
                    'GET  /api/phase1/params/:id/items/:itemId',
                    'GET  /api/phase1/wildcard/*',
                    'GET  /api/phase1/middleware-demo',
                    'GET  /api/phase1/error-demo?type=not-found|forbidden|validation|server',
                    'GET  /api/phase1/status-codes?code=200'
                ]
            },
            phase2: {
                description: 'Config, Security, Sanitization, SSE',
                endpoints: [
                    'GET  /api/phase2/config',
                    'GET  /api/phase2/security-headers',
                    'GET  /api/phase2/rate-limit',
                    'POST /api/phase2/sanitize',
                    'GET  /api/phase2/health',
                    'GET  /api/phase2/sse'
                ]
            },
            phase3: {
                description: 'JWT Auth, RBAC, Users, Posts, Validation',
                workflow: [
                    '1. POST /api/phase3/auth/register',
                    '2. POST /api/phase3/auth/login → copy token',
                    '3. Authorization: Bearer <token>'
                ],
                endpoints: [
                    'POST   /api/phase3/auth/register',
                    'POST   /api/phase3/auth/login',
                    'GET    /api/phase3/auth/me           [auth]',
                    'POST   /api/phase3/auth/verify',
                    'POST   /api/phase3/auth/refresh      [auth]',
                    'GET    /api/phase3/users             [auth][admin]',
                    'GET    /api/phase3/users/:id         [auth]',
                    'PUT    /api/phase3/users/:id         [auth]',
                    'DELETE /api/phase3/users/:id         [auth][admin]',
                    'GET    /api/phase3/posts',
                    'GET    /api/phase3/posts/:id',
                    'POST   /api/phase3/posts             [auth]',
                    'PUT    /api/phase3/posts/:id         [auth]',
                    'DELETE /api/phase3/posts/:id         [auth]',
                    'POST   /api/phase3/validate/pass',
                    'POST   /api/phase3/validate/fail',
                    'POST   /api/phase3/validate/schema-builder',
                    'GET    /api/phase3/rbac/admin-only   [auth][admin]',
                    'GET    /api/phase3/rbac/user-only    [auth][user]',
                    'GET    /api/phase3/rbac/any-role     [auth]',
                    'GET    /api/phase3/rbac/optional-auth'
                ]
            },
            phase4: {
                description: 'Events, Queue, Scheduler, Circuit Breaker, Retry, Timeout, Observability, WebSocket',
                endpoints: [
                    'POST   /api/phase4/events/emit',
                    'GET    /api/phase4/events/history',
                    'GET    /api/phase4/events/types',
                    'POST   /api/phase4/events/subscribe-demo',
                    'POST   /api/phase4/queue/add',
                    'POST   /api/phase4/queue/add-many',
                    'GET    /api/phase4/queue/stats',
                    'GET    /api/phase4/queue/jobs',
                    'GET    /api/phase4/queue/jobs/:id',
                    'DELETE /api/phase4/queue/purge',
                    'GET    /api/phase4/scheduler/tasks',
                    'POST   /api/phase4/scheduler/run-now',
                    'POST   /api/phase4/circuit/call',
                    'GET    /api/phase4/circuit/stats',
                    'POST   /api/phase4/circuit/reset',
                    'POST   /api/phase4/retry/fixed',
                    'POST   /api/phase4/retry/exponential',
                    'POST   /api/phase4/retry/skip',
                    'POST   /api/phase4/timeout/demo',
                    'GET    /api/phase4/health',
                    'GET    /api/phase4/health/live',
                    'GET    /api/phase4/health/ready',
                    'GET    /api/phase4/metrics',
                    'GET    /api/phase4/metrics/summary',
                    'GET    /api/phase4/trace/demo',
                    'GET    /api/phase4/trace/history',
                    'GET    /api/phase4/logger/demo',
                    'GET    /api/phase4/websocket/stats',
                    'WS     ws://localhost:3000/ws'
                ]
            }
        }
    });
});
// =============================================================================
//  BOOTSTRAP
// =============================================================================
async function bootstrap() {
    // ── 1. Start the HTTP server first ───────────────────────────────────────────
    // This creates and binds the internal Node.js server to port 3000
    await app.listen(config.PORT, config.HOST);
    // ── 2. Get the SAME server that is already listening on port 3000 ────────────
    // WSServer must attach to this server — not a new one
    const httpServer = app.getServer();
    if (!httpServer) {
        console.error('Could not get HTTP server — exiting');
        process.exit(1);
    }
    // ── 3. Attach WSServer to the existing HTTP server ───────────────────────────
    // Now ws://localhost:3000/ws will work correctly
    const wss = new websocket_1.WSServer(httpServer, {
        path: '/ws',
        maxClients: 100
    });
    // ── 4. Handle WebSocket connections ──────────────────────────────────────────
    wss.on('connection', (client) => {
        logger.info('WS connected', {
            id: client.id,
            total: wss.clientCount
        });
        // Send welcome
        client.sendJSON({
            type: 'welcome',
            clientId: client.id,
            message: 'Connected to REstJS WebSocket server',
            timestamp: Date.now()
        });
        // Auto-join general room
        wss.join(client, 'general');
        client.sendJSON({
            type: 'joined',
            room: 'general',
            members: wss.getRoomClients('general').length
        });
        // Tell others someone joined
        wss.toRoomJSON('general', {
            type: 'user-joined',
            clientId: client.id,
            total: wss.clientCount,
            timestamp: Date.now()
        }, [client.id]);
        // Handle incoming messages
        client.on('message', (data) => {
            let parsed;
            try {
                parsed = JSON.parse(data.toString());
            }
            catch {
                parsed = { type: 'raw', content: data.toString() };
            }
            switch (parsed.type) {
                case 'ping':
                    client.sendJSON({
                        type: 'pong',
                        timestamp: Date.now()
                    });
                    break;
                case 'stats':
                    client.sendJSON({
                        type: 'stats',
                        clients: wss.clientCount,
                        rooms: wss.getRooms().map(r => ({
                            name: r,
                            members: wss.getRoomClients(r).length
                        }))
                    });
                    break;
                case 'join':
                    if (parsed.room) {
                        wss.join(client, parsed.room);
                        client.sendJSON({
                            type: 'joined',
                            room: parsed.room,
                            members: wss.getRoomClients(parsed.room).length
                        });
                    }
                    break;
                case 'leave':
                    if (parsed.room) {
                        wss.leave(client, parsed.room);
                        client.sendJSON({
                            type: 'left',
                            room: parsed.room
                        });
                    }
                    break;
                case 'message':
                    wss.toRoomJSON(parsed.room || 'general', {
                        type: 'message',
                        from: client.id,
                        content: parsed.content,
                        room: parsed.room || 'general',
                        timestamp: Date.now()
                    });
                    break;
                case 'broadcast':
                    wss.broadcastJSON({
                        type: 'broadcast',
                        from: client.id,
                        content: parsed.content,
                        timestamp: Date.now()
                    }, [client.id]);
                    break;
                default:
                    client.sendJSON({
                        type: 'echo',
                        received: parsed,
                        timestamp: Date.now()
                    });
            }
        });
        client.on('close', () => {
            logger.info('WS disconnected', {
                id: client.id,
                total: wss.clientCount
            });
            wss.broadcastJSON({
                type: 'user-left',
                clientId: client.id,
                total: wss.clientCount,
                timestamp: Date.now()
            });
        });
        client.on('error', (err) => {
            logger.error('WS error', {
                id: client.id,
                error: err.message
            });
        });
    });
    // ── 5. Log ready ─────────────────────────────────────────────────────────────
    logger.info('WebSocket ready', {
        url: `ws://localhost:${config.PORT}/ws`
    });
    // ── 6. Graceful shutdown ──────────────────────────────────────────────────────
    const shutdown = async () => {
        logger.info('Shutting down gracefully...');
        await emailQueue.stop();
        scheduler.stop();
        await app.close();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
bootstrap().catch(err => {
    console.error('Fatal startup error:', err.message);
    process.exit(1);
});
