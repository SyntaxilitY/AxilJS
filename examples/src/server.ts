import { createServer } from 'http';
import { Application, cors, createSSE, sseHeartbeat } from '@restjs/core';
import { loadEnv, defineConfig } from '@restjs/config';
import { helmet, rateLimit, sanitize } from '@restjs/security';
import { JWT } from '@restjs/auth';
import { authenticate, requireRole } from '@restjs/auth';
import { hashPassword, verifyPassword } from '@restjs/auth';
import { v, validate } from '@restjs/validation';
import { EventBus } from '@restjs/events';
import { WSServer } from '@restjs/websocket';
import { Queue } from '@restjs/queue';
import { Scheduler } from '@restjs/queue';
import { CircuitBreaker, retry, withTimeout } from '@restjs/circuit';
import {
  Logger, MetricsRegistry, HealthChecker,
  Tracer, observabilityMiddleware,
  metricsHandler
} from '@restjs/observability';
import {
  OpenAIProvider,
  AnthropicProvider,
  GeminiProvider,
  OllamaProvider,
  RAGPipeline,
  VectorStore,
  Agent,
  createTool,
  calculatorTool,
  currentDateTimeTool,
  jsonTool,
  loadFromText,
  loadFromString,
  DocumentChunker,
  MCPClient
} from '@restjs/ai';

import type {
  AIProvider,
  Message,
  CompletionOptions
} from '@restjs/ai';

import {
  multiTenancy,
  getTenant,
  auditLog,
  auditMiddleware,
  FeatureFlagManager,
  generateDeployment
} from '@restjs/cloud';

import type { Tenant, FeatureFlag } from '@restjs/cloud';



// ─── KEEP SERVER FROM CRASH ────────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('\x1b[31m[REstJS] Uncaught Exception:\x1b[0m', err.message);
  // Do NOT exit — keep the server running
});

process.on('unhandledRejection', (reason) => {
  console.error('\x1b[31m[REstJS] Unhandled Promise Rejection:\x1b[0m', reason);
  // Do NOT exit — keep the server running
});


// ─── Load .env ────────────────────────────────────────────────────────────────

loadEnv();

// ─── Config ───────────────────────────────────────────────────────────────────

const config = defineConfig({
  PORT: { type: 'number', default: 3000 },
  HOST: { type: 'string', default: '127.0.0.1' },
  NODE_ENV: { type: 'string', default: 'development' },
  JWT_SECRET: { type: 'string', default: 'restjs-dev-secret-minimum-32-chars!!' },
  AI_PROVIDER: { type: 'string', default: 'ollama' },
  OPENAI_API_KEY: { type: 'string', required: false },
  ANTHROPIC_API_KEY: { type: 'string', required: false },
  GOOGLE_API_KEY: { type: 'string', required: false },
  OLLAMA_MODEL: { type: 'string', default: 'llama3.2' },
  OLLAMA_URL: { type: 'string', default: 'http://127.0.0.1:11434' }
});

// ─── JWT ──────────────────────────────────────────────────────────────────────

const jwt = new JWT(config.JWT_SECRET);

// ─── Phase 4 Infrastructure ───────────────────────────────────────────────────

// Structured logger
const logger = new Logger({ name: 'REstJS' });

// Prometheus metrics registry
const metrics = new MetricsRegistry();

// Distributed tracer
const tracer = new Tracer({ serviceName: 'restjs-example' });

// In-process event bus
const eventBus = new EventBus();

// Email job queue
const emailQueue = new Queue('emails', { concurrency: 3 });

emailQueue.process('send-welcome', async (job) => {
  const data = job.data as { email: string; name: string };
  logger.info('Processing welcome email', { to: data.email });
  await new Promise(r => setTimeout(r, 150)); // simulate sending
  return { sent: true, to: data.email };
});

emailQueue.process('send-notification', async (job) => {
  const data = job.data as { email: string; message: string };
  logger.info('Processing notification', { to: data.email });
  await new Promise(r => setTimeout(r, 100));
  return { sent: true, to: data.email };
});

emailQueue.on('completed', (job) =>
  logger.info('Job completed', { id: job.id, name: job.name })
);

emailQueue.on('failed', (job, err) =>
  logger.error('Job failed', { id: job.id, error: err.message })
);

emailQueue.start();

// Task scheduler
const scheduler = new Scheduler();

scheduler.schedule('log-stats', '*/1 * * * *', async () => {
  logger.info('Scheduled tick', {
    users: users.length,
    posts: posts.length,
    queue: emailQueue.getStats()
  });
});

scheduler.start();

// Circuit breaker for simulated external service
const externalCB = new CircuitBreaker('external-api', {
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
const health = new HealthChecker();

health.addCheck('memory', async () => {
  const mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  if (mb > 400) throw new Error(`Memory too high: ${mb}MB`);
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

// ─── In-Memory Data ───────────────────────────────────────────────────────────

interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: string;
  createdAt: string;
}

interface Post {
  id: number;
  title: string;
  content: string;
  authorId: number;
  createdAt: string;
}

const users: User[] = [];
const posts: Post[] = [];

let userIdSeq = 1;
let postIdSeq = 1;

// ─── Validation Schemas ───────────────────────────────────────────────────────

const registerSchema = v.object({
  name: v.string().min(2).max(100),
  email: v.string().email(),
  password: v.string().min(8),
  role: v.enum(['admin', 'user', 'guest']).optional()
});

const loginSchema = v.object({
  email: v.string().email(),
  password: v.string().min(1)
});

const createPostSchema = v.object({
  title: v.string().min(3).max(200),
  content: v.string().min(10)
});

const updatePostSchema = v.object({
  title: v.string().min(3).max(200).optional(),
  content: v.string().min(10).optional()
});

const updateUserSchema = v.object({
  name: v.string().min(2).max(100).optional(),
  email: v.string().email().optional()
});

const validateDemoSchema = v.object({
  name: v.string().min(2).max(50),
  email: v.string().email(),
  age: v.number().min(0).max(150).integer().optional(),
  role: v.enum(['admin', 'user', 'guest']),
  tags: v.array(v.string().min(1)).max(5).optional()
});

// ─── Application ──────────────────────────────────────────────────────────────

const app = new Application({
  server: { port: config.PORT, host: config.HOST },
  env: config.NODE_ENV
});

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(rateLimit({ max: 200, windowMs: 60000 }));
app.use(sanitize());
app.use(observabilityMiddleware({ metrics, tracer }));

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
app.get(
  '/api/phase1/middleware-demo',

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
      totalTimeMs: Date.now() - (req.locals.startedAt as number)
    });
  }
);

/**
 * GET /api/phase1/error-demo
 * Error handling demonstration
 * Query: ?type=not-found | forbidden | validation | generic
 */
app.get('/api/phase1/error-demo', (req, res) => {
  const type = (req.query.type as string) || 'generic';

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

  const messages: Record<number, string> = {
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
  const body = req.body as Record<string, unknown>;

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
  const sse = createSSE(res);
  const stopBeat = sseHeartbeat(sse, 10000);
  let count = 0;

  // First event immediately
  sse.send(
    { message: 'SSE stream opened', timestamp: Date.now() },
    'connect'
  );

  const interval = setInterval(() => {
    if (!sse.isOpen) {
      clearInterval(interval);
      stopBeat();
      return;
    }

    count++;

    sse.send(
      { count, message: `Event ${count}`, timestamp: Date.now() },
      'update'
    );

    if (count >= 5) {
      sse.send(
        { message: 'All events sent — stream closing', total: count },
        'done'
      );
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
app.post(
  '/api/phase3/auth/register',
  validate({ body: registerSchema }),
  async (req, res) => {
    const body = req.body as {
      name: string; email: string; password: string; role?: string
    };

    // Check duplicate email
    const exists = users.find(u => u.email === body.email);
    if (exists) {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'Email already registered' }
      });
      return;
    }

    // Hash password — never store plaintext
    const hashed = await hashPassword(body.password);

    const user: User = {
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
  }
);

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
app.post(
  '/api/phase3/auth/login',
  validate({ body: loginSchema }),
  async (req, res) => {
    const body = req.body as { email: string; password: string };

    const user = users.find(u => u.email === body.email);
    if (!user) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' }
      });
      return;
    }

    const valid = await verifyPassword(body.password, user.password);
    if (!valid) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' }
      });
      return;
    }

    // Sign JWT with user info embedded in payload
    const token = jwt.sign(
      {
        sub: String(user.id),
        role: user.role,
        email: user.email,
        name: user.name
      },
      { expiresIn: '7d' }
    );

    const { password: _, ...safeUser } = user;

    res.json({
      message: 'Login successful',
      token,
      data: safeUser
    });
  }
);

/**
 * GET /api/phase3/auth/me
 * Get the currently authenticated user
 * Header: Authorization: Bearer <token>
 */
app.get(
  '/api/phase3/auth/me',
  authenticate(jwt),
  (req, res) => {
    const authUser = req.locals.user as any;
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
  }
);

/**
 * POST /api/phase3/auth/verify
 * Verify a JWT token — check if it is valid
 *
 * Body: { "token": "eyJ..." }
 */
app.post('/api/phase3/auth/verify', (req, res) => {
  const body = req.body as { token?: string };

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
  } catch (err) {
    res.status(401).json({
      valid: false,
      error: (err as Error).message,
      message: 'Token is invalid or expired'
    });
  }
});

/**
 * POST /api/phase3/auth/refresh
 * Refresh a JWT token — returns a new token with a fresh expiry
 * Header: Authorization: Bearer <token>
 */
app.post(
  '/api/phase3/auth/refresh',
  authenticate(jwt),
  (req, res) => {
    const authUser = req.locals.user as any;

    const newToken = jwt.sign(
      {
        sub: authUser.sub,
        role: authUser.role,
        email: authUser.email,
        name: authUser.name
      },
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Token refreshed — new 7 day expiry',
      token: newToken
    });
  }
);

// ── Users CRUD ────────────────────────────────────────────────────────────────

/**
 * GET /api/phase3/users
 * List all users — admin role required
 * Header: Authorization: Bearer <token>
 * Query:  ?page=1&perPage=10
 */
app.get(
  '/api/phase3/users',
  authenticate(jwt),
  requireRole('admin'),
  (req, res) => {
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
  }
);

/**
 * GET /api/phase3/users/:id
 * Get a single user by ID
 * Header: Authorization: Bearer <token>
 */
app.get(
  '/api/phase3/users/:id',
  authenticate(jwt),
  (req, res) => {
    const user = users.find(u => u.id === Number(req.params.id));

    if (!user) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: `User ${req.params.id} not found` }
      });
      return;
    }

    const { password: _, ...safeUser } = user;

    res.json({ data: safeUser });
  }
);

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
app.put(
  '/api/phase3/users/:id',
  authenticate(jwt),
  validate({ body: updateUserSchema }),
  (req, res) => {
    const authUser = req.locals.user as any;
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

    const body = req.body as Record<string, unknown>;
    users[index] = { ...users[index], ...body };

    const { password: _, ...safeUser } = users[index];

    res.json({ message: 'User updated', data: safeUser });
  }
);

/**
 * DELETE /api/phase3/users/:id
 * Delete a user — admin only
 * Header: Authorization: Bearer <token>
 */
app.delete(
  '/api/phase3/users/:id',
  authenticate(jwt),
  requireRole('admin'),
  (req, res) => {
    const index = users.findIndex(u => u.id === Number(req.params.id));

    if (index === -1) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
      return;
    }

    users.splice(index, 1);

    res.status(204).send('');
  }
);

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
app.post(
  '/api/phase3/posts',
  authenticate(jwt),
  validate({ body: createPostSchema }),
  (req, res) => {
    const authUser = req.locals.user as any;
    const body = req.body as { title: string; content: string };

    const post: Post = {
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
  }
);

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
app.put(
  '/api/phase3/posts/:id',
  authenticate(jwt),
  validate({ body: updatePostSchema }),
  (req, res) => {
    const authUser = req.locals.user as any;
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

    const body = req.body as Record<string, unknown>;
    posts[index] = { ...posts[index], ...body };

    res.json({ message: 'Post updated', data: posts[index] });
  }
);

/**
 * DELETE /api/phase3/posts/:id
 * Delete a post — must be the author or an admin
 * Header: Authorization: Bearer <token>
 */
app.delete(
  '/api/phase3/posts/:id',
  authenticate(jwt),
  (req, res) => {
    const authUser = req.locals.user as any;
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
  }
);

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
app.post(
  '/api/phase3/validate/pass',
  validate({ body: validateDemoSchema }),
  (req, res) => {
    res.json({
      message: 'All validation passed',
      validated: req.body
    });
  }
);

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
app.post(
  '/api/phase3/validate/fail',
  validate({ body: validateDemoSchema }),
  (req, res) => {
    // This handler only runs if validation passes
    // If body is bad, the validate middleware returns 422 automatically
    res.json({
      message: 'Validation passed (you sent valid data)',
      validated: req.body
    });
  }
);

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
  const schema = v.object({
    username: v.string().min(3).max(30),
    website: v.string().url().optional(),
    score: v.number().min(0).max(100).integer(),
    active: v.boolean(),
    tags: v.array(v.string().min(1)).min(1).max(10),
    address: v.object({
      city: v.string().min(2),
      country: v.string().min(2).max(2)
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
app.get(
  '/api/phase3/rbac/admin-only',
  authenticate(jwt),
  requireRole('admin'),
  (req, res) => {
    const authUser = req.locals.user as any;
    res.json({
      message: 'Admin area — access granted',
      user: {
        id: authUser.sub,
        role: authUser.role
      }
    });
  }
);

/**
 * GET /api/phase3/rbac/user-only
 * Only users with role = user can access
 * Header: Authorization: Bearer <token>
 */
app.get(
  '/api/phase3/rbac/user-only',
  authenticate(jwt),
  requireRole('user'),
  (req, res) => {
    const authUser = req.locals.user as any;
    res.json({
      message: 'User area — access granted',
      user: {
        id: authUser.sub,
        role: authUser.role
      }
    });
  }
);

/**
 * GET /api/phase3/rbac/any-role
 * Any authenticated user can access (any role)
 * Header: Authorization: Bearer <token>
 */
app.get(
  '/api/phase3/rbac/any-role',
  authenticate(jwt),
  (req, res) => {
    const authUser = req.locals.user as any;
    res.json({
      message: 'Authenticated area — access granted',
      user: {
        id: authUser.sub,
        role: authUser.role,
        email: authUser.email
      }
    });
  }
);

/**
 * GET /api/phase3/rbac/optional-auth
 * Public — works with or without a token
 * With token → shows user info
 * Without token → shows public response
 * Header: Authorization: Bearer <token>  ← optional
 */
app.get(
  '/api/phase3/rbac/optional-auth',
  authenticate(jwt, { required: false }),
  (req, res) => {
    const authUser = req.locals.user as any;

    if (authUser) {
      res.json({
        message: 'You are authenticated',
        authenticated: true,
        user: {
          id: authUser.sub,
          role: authUser.role
        }
      });
    } else {
      res.json({
        message: 'You are not authenticated — public response',
        authenticated: false
      });
    }
  }
);

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
  const body = req.body as { type?: string; payload?: unknown };

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
  const type = req.query.type as string | undefined;
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
  const body = req.body as { type?: string };
  const eventType = body.type || 'demo.event';
  const received: unknown[] = [];

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
  const body = req.body as {
    jobName?: string;
    data?: Record<string, unknown>;
    delay?: number;
    priority?: number;
  };

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

  const job = await emailQueue.add(
    body.jobName,
    body.data || {},
    {
      delay: body.delay || 0,
      priority: body.priority || 0,
      maxAttempts: 3
    }
  );

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
  const body = req.body as {
    jobName?: string;
    items?: Record<string, unknown>[];
  };

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
  const status = req.query.status as any | undefined;
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
  const body = req.body as { name?: string };

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
  } catch (err) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: (err as Error).message
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
  const body = req.body as { shouldFail?: boolean };

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
  } catch (err) {
    res.status(503).json({
      success: false,
      error: (err as Error).message,
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
  const body = req.body as { failTimes?: number; delay?: number };
  const failTimes = Math.min(body.failTimes ?? 2, 4);
  const delayMs = Math.min(body.delay ?? 200, 1000);
  let attempts = 0;
  const log: string[] = [];

  try {
    const result = await retry(
      async () => {
        attempts++;
        log.push(`Attempt ${attempts} — ${attempts <= failTimes ? 'FAIL' : 'SUCCESS'}`);

        if (attempts <= failTimes) {
          throw new Error(`Attempt ${attempts} failed`);
        }

        return { success: true, succeededOn: attempts };
      },
      {
        attempts: 5,
        delay: delayMs,
        backoff: 'fixed'
      }
    );

    res.json({ strategy: 'fixed', delayMs, log, result });
  } catch (err) {
    res.status(500).json({
      strategy: 'fixed',
      delayMs,
      log,
      error: (err as Error).message
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
  const body = req.body as { failTimes?: number; delay?: number };
  const failTimes = Math.min(body.failTimes ?? 3, 4);
  const delayMs = Math.min(body.delay ?? 100, 500);
  let attempts = 0;
  const log: string[] = [];

  try {
    const result = await retry(
      async () => {
        attempts++;
        log.push(`Attempt ${attempts}`);
        if (attempts <= failTimes) throw new Error(`Fail ${attempts}`);
        return { success: true, succeededOn: attempts };
      },
      {
        attempts: 5,
        delay: delayMs,
        backoff: 'exponential',
        jitter: false,
        onRetry: (attempt, err, nextDelay) => {
          log.push(`  → retry in ${nextDelay}ms`);
        }
      }
    );

    res.json({ strategy: 'exponential', baseDelayMs: delayMs, log, result });
  } catch (err) {
    res.status(500).json({
      strategy: 'exponential',
      log,
      error: (err as Error).message
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
  const body = req.body as { errorType?: string };
  const permanent = body.errorType === 'permanent';
  let attempts = 0;

  try {
    const result = await retry(
      async () => {
        attempts++;

        if (permanent) {
          const err = Object.assign(
            new Error('Permanent error — do not retry'),
            { permanent: true }
          );
          throw err;
        }

        if (attempts < 3) {
          throw new Error(`Transient error on attempt ${attempts}`);
        }

        return { success: true, attempts };
      },
      {
        attempts: 5,
        delay: 50,
        // Skip retry for permanent errors
        retryIf: (err: any) => !err.permanent
      }
    );

    res.json({ result, attempts });
  } catch (err) {
    res.status(500).json({
      error: (err as Error).message,
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
  const body = req.body as { operationMs?: number; timeoutMs?: number };
  const operationMs = Math.min(body.operationMs ?? 2000, 8000);
  const timeoutMs = Math.min(body.timeoutMs ?? 1000, 8000);

  try {
    const result = await withTimeout(
      new Promise<string>(resolve => {
        setTimeout(() => resolve('Operation completed successfully'), operationMs);
      }),
      timeoutMs
    );

    res.json({
      success: true,
      result,
      operationMs,
      timeoutMs,
      note: 'Operation finished before timeout'
    });
  } catch (err) {
    res.status(408).json({
      success: false,
      error: (err as Error).message,
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
app.get('/api/phase4/metrics', metricsHandler(metrics));

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
        durationMs: rootData.endTime! - rootData.startTime,
        status: rootData.status,
        events: rootData.events.map(e => e.name)
      },
      {
        name: dbData.name,
        spanId: dbData.spanId,
        parentId: rootData.spanId,
        durationMs: dbData.endTime! - dbData.startTime,
        attributes: dbData.attributes
      },
      {
        name: cacheData.name,
        spanId: cacheData.spanId,
        parentId: rootData.spanId,
        durationMs: cacheData.endTime! - cacheData.startTime,
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
  const level = (req.query.level as string) || 'all';

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

// ─── Phase 5 Infrastructure ───────────────────────────────────────────────────

// ── AI Provider Factory ───────────────────────────────────────────────────────

function buildAIProvider(): AIProvider {
  const providerName = config.AI_PROVIDER.toLowerCase();

  switch (providerName) {
    case 'openai':
      if (!config.OPENAI_API_KEY) {
        logger.warn('OPENAI_API_KEY not set — falling back to Ollama');
        return new OllamaProvider({
          baseUrl: config.OLLAMA_URL,
          model: config.OLLAMA_MODEL
        });
      }
      logger.info('AI Provider: OpenAI');
      return new OpenAIProvider({ apiKey: config.OPENAI_API_KEY! });

    case 'anthropic':
      if (!config.ANTHROPIC_API_KEY) {
        logger.warn('ANTHROPIC_API_KEY not set — falling back to Ollama');
        return new OllamaProvider({
          baseUrl: config.OLLAMA_URL,
          model: config.OLLAMA_MODEL
        });
      }
      logger.info('AI Provider: Anthropic');
      return new AnthropicProvider({ apiKey: config.ANTHROPIC_API_KEY! });

    case 'gemini':
      if (!config.GOOGLE_API_KEY) {
        logger.warn('GOOGLE_API_KEY not set — falling back to Ollama');
        return new OllamaProvider({
          baseUrl: config.OLLAMA_URL,
          model: config.OLLAMA_MODEL
        });
      }
      logger.info('AI Provider: Google Gemini');
      return new GeminiProvider({ apiKey: config.GOOGLE_API_KEY! });

    case 'ollama':
    default:
      logger.info('AI Provider: Ollama (local)', {
        url: config.OLLAMA_URL,
        model: config.OLLAMA_MODEL
      });
      return new OllamaProvider({
        baseUrl: config.OLLAMA_URL,
        model: config.OLLAMA_MODEL
      });
  }
}

// Build the provider once — reused across all AI routes
const aiProvider = buildAIProvider();

// ── Vector Store ──────────────────────────────────────────────────────────────

const vectorStore = new VectorStore({ metric: 'cosine' });

// ── RAG Pipeline ──────────────────────────────────────────────────────────────

const ragPipeline = new RAGPipeline({
  provider: aiProvider,
  vectorStore,
  topK: 5,
  minScore: 0.3,
  chunker: {
    chunkSize: 800,
    overlap: 150
  }
});

// ── Index built-in REstJS knowledge ──────────────────────────────────────────

async function indexBuiltinKnowledge(): Promise<void> {
  const docs = loadFromText([
    `REstJS is a next-generation JavaScript backend ecosystem created by Tariq Mehmood.
     It provides a complete platform including runtime, framework, ORM, authentication,
     validation, testing, events, WebSockets, queues, observability, AI, and cloud deployment.
     Unlike Express or NestJS, REstJS is batteries-included — everything works out of the box.`,

    `REstJS Phase 1 provides the core HTTP server with a trie-based router, middleware chain,
     body parser, CORS, request logger, and the CLI with rest create and rest run commands.
     The router supports static routes, dynamic parameters like :id, and wildcard routes.`,

    `REstJS Phase 2 adds configuration management with loadEnv and defineConfig, security
     middleware including helmet, rate limiting, CSRF protection and sanitization, static file
     serving with ETag caching, Server-Sent Events streaming, and the package manager with
     SHA-256 checksum verification and a rest.lock file for deterministic installs.`,

    `REstJS Phase 3 delivers ORM support for PostgreSQL, MySQL and SQLite with a fluent query
     builder, base repository with CRUD and pagination, database migrations, JWT authentication
     with HMAC-SHA256, password hashing with scrypt, role-based access control, and a
     schema-based validation library with v.string().email() and similar chainable APIs.`,

    `REstJS Phase 4 implements distributed systems including an in-process event bus with
     wildcard subscriptions, a full RFC 6455 WebSocket server with rooms and broadcasting,
     message queue with priority and retry, cron scheduler, circuit breaker with three states,
     retry with exponential backoff, structured logging, Prometheus metrics, and distributed
     tracing with W3C Trace Context.`,

    `REstJS Phase 5 is the AI platform. It supports OpenAI, Anthropic Claude, Google Gemini,
     and local LLMs via Ollama. It provides a RAG pipeline for retrieval-augmented generation,
     a vector store for semantic similarity search, an agent framework with tool calling using
     the ReAct reasoning pattern, built-in tools like calculator and datetime, and an MCP
     client for the Model Context Protocol.`,

    `REstJS CLI commands: rest create <name> creates a new project, rest run starts the
     development server with hot reload using incremental TypeScript compilation, rest build
     compiles for production, rest test discovers and runs test files, rest deploy generates
     Docker and Kubernetes manifests, rest install manages packages, rest doctor diagnoses issues.`,

    `REstJS is different from Node.js Express NestJS Deno and Bun because it provides every
     layer in one unified ecosystem. No need to assemble 40 packages from different teams.
     One install gives you HTTP server, ORM, auth, validation, testing, events, WebSockets,
     queue, observability, AI platform, and cloud deployment tools.`
  ], 'restjs-docs');

  try {
    await ragPipeline.index(docs);
    logger.info('AI knowledge base indexed', {
      documents: docs.length,
      vectors: vectorStore.size
    });
  } catch (err) {
    logger.warn('AI knowledge indexing skipped', {
      reason: (err as Error).message,
      tip: 'Start Ollama with: ollama serve'
    });
  }
}

// ── Custom Tools ──────────────────────────────────────────────────────────────

// Weather tool (demo — returns mock data)
const weatherTool = createTool({
  name: 'get_weather',
  description: 'Get current weather information for any city',
  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'The city name to get weather for'
      },
      unit: {
        type: 'string',
        description: 'Temperature unit: celsius or fahrenheit',
        enum: ['celsius', 'fahrenheit']
      }
    },
    required: ['city']
  },
  handler: async ({ city, unit }) => {
    // Mock weather data — connect a real API in production
    const temp = unit === 'fahrenheit' ? '72°F' : '22°C';
    return {
      city,
      temperature: temp,
      condition: 'Partly cloudy',
      humidity: '65%',
      wind: '12 km/h',
      unit: unit || 'celsius',
      note: 'Demo data — connect OpenWeatherMap API for real data'
    };
  }
});

// User data tool — queries the in-memory users store
const userDataTool = createTool({
  name: 'get_user_count',
  description: 'Get the current number of registered users in the system',
  parameters: {
    type: 'object',
    properties: {}
  },
  handler: async () => ({
    totalUsers: users.length,
    totalPosts: posts.length,
    note: 'Data from REstJS in-memory store'
  })
});

// All tools available to agents
const allTools = [
  calculatorTool,
  currentDateTimeTool,
  jsonTool,
  weatherTool,
  userDataTool
];

// =============================================================================
//  PHASE 5 — AI Platform
//  Providers, Chat, Streaming, Embeddings, RAG, Agents, Tools, MCP
// =============================================================================

// ── Provider Info ─────────────────────────────────────────────────────────────

/**
 * GET /api/phase5/provider
 * Show which AI provider is currently active
 */
app.get('/api/phase5/provider', (req, res) => {
  res.json({
    provider: aiProvider.name,
    defaultModel: aiProvider.defaultModel,
    config: {
      AI_PROVIDER: config.AI_PROVIDER,
      OLLAMA_MODEL: config.OLLAMA_MODEL,
      OLLAMA_URL: config.OLLAMA_URL
    },
    tip: 'Change AI_PROVIDER in .env to switch: openai | anthropic | gemini | ollama'
  });
});

// ── Chat Completion ───────────────────────────────────────────────────────────

/**
 * POST /api/phase5/chat
 * Simple chat completion — single turn
 *
 * Body:
 * {
 *   "message": "What is REstJS?",
 *   "system":  "You are a helpful assistant."
 * }
 */
app.post('/api/phase5/chat', async (req, res) => {
  const body = req.body as {
    message?: string;
    system?: string;
    model?: string;
    temperature?: number;
  };

  if (!body.message) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'message field is required' }
    });
    return;
  }

  try {
    const response = await aiProvider.complete({
      messages: [{ role: 'user', content: body.message }],
      system: body.system || 'You are a helpful assistant.',
      model: body.model,
      temperature: body.temperature ?? 0.7
    });

    res.json({
      response: response.content,
      model: response.model,
      finishReason: response.finishReason,
      usage: response.usage
    });
  } catch (err) {
    res.status(503).json({
      error: {
        code: 'AI_ERROR',
        message: (err as Error).message,
        tip: 'Make sure your AI provider is running and configured'
      }
    });
  }
});

/**
 * POST /api/phase5/chat/conversation
 * Multi-turn conversation — send full message history
 *
 * Body:
 * {
 *   "messages": [
 *     { "role": "user",      "content": "My name is Tariq" },
 *     { "role": "assistant", "content": "Hello Tariq!" },
 *     { "role": "user",      "content": "What is my name?" }
 *   ],
 *   "system": "You are a helpful assistant. Remember what the user tells you."
 * }
 */
app.post('/api/phase5/chat/conversation', async (req, res) => {
  const body = req.body as {
    messages?: Message[];
    system?: string;
    model?: string;
    temperature?: number;
  };

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'messages array is required' }
    });
    return;
  }

  try {
    const response = await aiProvider.complete({
      messages: body.messages,
      system: body.system || 'You are a helpful assistant.',
      model: body.model,
      temperature: body.temperature ?? 0.7
    });

    res.json({
      response: response.content,
      model: response.model,
      finishReason: response.finishReason,
      usage: response.usage,
      turns: body.messages.length + 1
    });
  } catch (err) {
    res.status(503).json({
      error: { code: 'AI_ERROR', message: (err as Error).message }
    });
  }
});

// ── Streaming Chat ────────────────────────────────────────────────────────────

/**
 * POST /api/phase5/chat/stream
 * Streaming chat completion using Server-Sent Events.
 * Tokens arrive one by one in real time.
 *
 * Body:
 * {
 *   "message": "Explain what REstJS is in detail",
 *   "system":  "You are a helpful assistant."
 * }
 *
 * In Postman: Send request and watch the response stream in real time.
 * Each SSE event has type "delta" with the next token.
 * Final event has type "done" with full metadata.
 */
app.post('/api/phase5/chat/stream', async (req, res) => {
  const body = req.body as {
    message?: string;
    system?: string;
    model?: string;
    temperature?: number;
  };

  if (!body.message) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'message field is required' }
    });
    return;
  }

  const sse = createSSE(res);

  try {
    const stream = aiProvider.stream({
      messages: [{ role: 'user', content: body.message }],
      system: body.system || 'You are a helpful assistant.',
      model: body.model,
      temperature: body.temperature ?? 0.7
    });

    let fullContent = '';

    for await (const chunk of stream) {
      if (!sse.isOpen) break;

      if (chunk.delta) {
        fullContent += chunk.delta;

        // Send each token as an SSE event
        sse.send({ delta: chunk.delta }, 'delta');
      }

      if (chunk.done && chunk.response) {
        // Send final metadata
        sse.send({
          content: chunk.response.content,
          model: chunk.response.model,
          finishReason: chunk.response.finishReason,
          usage: chunk.response.usage
        }, 'done');
      }
    }
  } catch (err) {
    if (sse.isOpen) {
      sse.send({
        error: (err as Error).message,
        tip: 'Make sure your AI provider is running'
      }, 'error');
    }
  } finally {
    sse.close();
  }
});

// ── Embeddings ────────────────────────────────────────────────────────────────

/**
 * POST /api/phase5/embed
 * Generate vector embeddings for text.
 * Use these vectors for semantic search, similarity, clustering.
 *
 * Body:
 * {
 *   "input": "What is JavaScript?"
 * }
 *
 * Or multiple strings:
 * {
 *   "input": ["JavaScript is a language", "Python is also a language"]
 * }
 */
app.post('/api/phase5/embed', async (req, res) => {
  const body = req.body as {
    input?: string | string[];
    model?: string;
  };

  if (!body.input) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'input field is required' }
    });
    return;
  }

  try {
    const response = await aiProvider.embed({
      input: body.input,
      model: body.model
    });

    const inputs = Array.isArray(body.input) ? body.input : [body.input];

    res.json({
      embeddings: response.embeddings.map((emb, i) => ({
        input: inputs[i],
        dimensions: emb.length,
        // Show only first 5 values — full vector would be too large
        preview: emb.slice(0, 5),
        note: `Full vector has ${emb.length} dimensions`
      })),
      model: response.model,
      usage: response.usage
    });
  } catch (err) {
    res.status(503).json({
      error: { code: 'AI_ERROR', message: (err as Error).message }
    });
  }
});

/**
 * POST /api/phase5/embed/similarity
 * Compute cosine similarity between two texts.
 * Returns a score from 0 (unrelated) to 1 (identical meaning).
 *
 * Body:
 * {
 *   "textA": "JavaScript is a programming language",
 *   "textB": "Python is used for coding"
 * }
 */
app.post('/api/phase5/embed/similarity', async (req, res) => {
  const body = req.body as { textA?: string; textB?: string };

  if (!body.textA || !body.textB) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'textA and textB are required' }
    });
    return;
  }

  try {
    // Embed both texts at once
    const response = await aiProvider.embed({
      input: [body.textA, body.textB]
    });

    const [vecA, vecB] = response.embeddings;

    // Cosine similarity
    const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
    const magA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
    const similarity = dotProduct / (magA * magB);

    // Normalize to 0-1
    const normalizedScore = (similarity + 1) / 2;

    res.json({
      textA: body.textA,
      textB: body.textB,
      similarity: parseFloat(normalizedScore.toFixed(4)),
      interpretation:
        normalizedScore > 0.9 ? 'Very similar' :
          normalizedScore > 0.7 ? 'Similar' :
            normalizedScore > 0.5 ? 'Somewhat similar' :
              normalizedScore > 0.3 ? 'Different' :
                'Very different',
      model: response.model
    });
  } catch (err) {
    res.status(503).json({
      error: { code: 'AI_ERROR', message: (err as Error).message }
    });
  }
});

// ── RAG Pipeline ──────────────────────────────────────────────────────────────

/**
 * GET /api/phase5/rag/stats
 * Show RAG pipeline statistics — how many documents are indexed
 */
app.get('/api/phase5/rag/stats', (req, res) => {
  const stats = ragPipeline.getStats();

  res.json({
    vectorStoreSize: stats.documentCount,
    embeddingTokensUsed: stats.embeddingTokensUsed,
    provider: aiProvider.name,
    tip: vectorStore.size === 0
      ? 'Knowledge base is empty. POST /api/phase5/rag/index to add documents.'
      : `${vectorStore.size} document chunks ready for search`
  });
});

/**
 * POST /api/phase5/rag/index
 * Add documents to the RAG knowledge base.
 * Documents are chunked, embedded, and stored in the vector store.
 *
 * Body:
 * {
 *   "texts": [
 *     "REstJS supports PostgreSQL MySQL and SQLite databases.",
 *     "The ORM provides migrations query builder and repository pattern."
 *   ],
 *   "source": "database-docs"
 * }
 */
app.post('/api/phase5/rag/index', async (req, res) => {
  const body = req.body as { texts?: string[]; source?: string };

  if (!body.texts || !Array.isArray(body.texts) || body.texts.length === 0) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'texts array is required' }
    });
    return;
  }

  try {
    const docs = loadFromText(body.texts, body.source || 'api-upload');
    const result = await ragPipeline.index(docs);

    res.json({
      message: 'Documents indexed successfully',
      documentsIndexed: result.documentsIndexed,
      chunksCreated: result.chunksCreated,
      totalVectors: vectorStore.size,
      source: body.source || 'api-upload'
    });
  } catch (err) {
    res.status(503).json({
      error: { code: 'AI_ERROR', message: (err as Error).message }
    });
  }
});

/**
 * POST /api/phase5/rag/query
 * Ask a question — answer is generated from indexed documents.
 * The pipeline embeds the question, finds similar chunks, generates an answer.
 *
 * Body:
 * {
 *   "question": "What databases does REstJS support?",
 *   "topK":     3
 * }
 */
app.post('/api/phase5/rag/query', async (req, res) => {
  const body = req.body as {
    question?: string;
    topK?: number;
  };

  if (!body.question) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'question field is required' }
    });
    return;
  }

  if (vectorStore.size === 0) {
    res.status(400).json({
      error: {
        code: 'NO_DOCUMENTS',
        message: 'No documents indexed yet.',
        tip: 'POST /api/phase5/rag/index to add documents first'
      }
    });
    return;
  }

  try {
    const result = await ragPipeline.query(body.question);

    res.json({
      question: body.question,
      answer: result.response,
      sources: result.sources.map(s => ({
        content: s.content.slice(0, 200) + (s.content.length > 200 ? '...' : ''),
        score: parseFloat(s.score.toFixed(4)),
        source: s.metadata?.source || 'unknown'
      })),
      usage: result.usage
    });
  } catch (err) {
    res.status(503).json({
      error: { code: 'AI_ERROR', message: (err as Error).message }
    });
  }
});

/**
 * POST /api/phase5/rag/stream
 * Ask a question with streaming answer.
 * Sources are sent immediately, then the answer streams token by token.
 *
 * Body:
 * {
 *   "question": "What is Phase 4 of REstJS?"
 * }
 */
app.post('/api/phase5/rag/stream', async (req, res) => {
  const body = req.body as { question?: string };

  if (!body.question) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'question field is required' }
    });
    return;
  }

  if (vectorStore.size === 0) {
    res.status(400).json({
      error: {
        code: 'NO_DOCUMENTS',
        message: 'No documents indexed. POST /api/phase5/rag/index first.'
      }
    });
    return;
  }

  const sse = createSSE(res);

  try {
    for await (const event of ragPipeline.queryStream(body.question)) {
      if (!sse.isOpen) break;

      sse.send(event.data, event.type);

      if (event.type === 'done') break;
    }
  } catch (err) {
    if (sse.isOpen) {
      sse.send({ error: (err as Error).message }, 'error');
    }
  } finally {
    sse.close();
  }
});

/**
 * DELETE /api/phase5/rag/clear
 * Clear all indexed documents from the vector store
 */
app.delete('/api/phase5/rag/clear', async (req, res) => {
  const before = vectorStore.size;
  await vectorStore.clear();

  res.json({
    message: 'Vector store cleared',
    before,
    after: vectorStore.size
  });
});

// ── Vector Store ──────────────────────────────────────────────────────────────

/**
 * GET /api/phase5/vector/stats
 * Show vector store statistics
 */
app.get('/api/phase5/vector/stats', (req, res) => {
  res.json({
    totalDocuments: vectorStore.size,
    metric: 'cosine',
    tip: 'Use POST /api/phase5/rag/index to add documents'
  });
});

/**
 * POST /api/phase5/vector/search
 * Semantic search — find similar documents for a query text.
 * Embeds the query then returns most similar stored chunks.
 *
 * Body:
 * {
 *   "query": "database ORM migrations",
 *   "topK":  3
 * }
 */
app.post('/api/phase5/vector/search', async (req, res) => {
  const body = req.body as { query?: string; topK?: number };

  if (!body.query) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'query field is required' }
    });
    return;
  }

  if (vectorStore.size === 0) {
    res.status(400).json({
      error: {
        code: 'NO_DOCUMENTS',
        message: 'No documents in vector store.',
        tip: 'POST /api/phase5/rag/index to add documents first'
      }
    });
    return;
  }

  try {
    // Embed the query
    const embResult = await aiProvider.embed({ input: body.query });
    const queryVec = embResult.embeddings[0];

    // Search vector store
    const results = await vectorStore.search(queryVec, {
      topK: body.topK || 5,
      minScore: 0.2
    });

    res.json({
      query: body.query,
      results: results.map(r => ({
        score: parseFloat(r.score.toFixed(4)),
        content: r.document.content.slice(0, 300),
        source: r.document.metadata?.source || 'unknown',
        id: r.document.id
      })),
      total: results.length
    });
  } catch (err) {
    res.status(503).json({
      error: { code: 'AI_ERROR', message: (err as Error).message }
    });
  }
});

// ── Document Chunker ──────────────────────────────────────────────────────────

/**
 * POST /api/phase5/chunk
 * Show how the document chunker splits text.
 * Useful for understanding how RAG indexing works.
 *
 * Body:
 * {
 *   "text":      "Long document text here...",
 *   "chunkSize": 200,
 *   "overlap":   50,
 *   "strategy":  "recursive"
 * }
 */
app.post('/api/phase5/chunk', (req, res) => {
  const body = req.body as {
    text?: string;
    chunkSize?: number;
    overlap?: number;
    strategy?: 'fixed' | 'sentence' | 'paragraph' | 'recursive';
  };

  if (!body.text) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'text field is required' }
    });
    return;
  }

  const chunker = new DocumentChunker({
    chunkSize: body.chunkSize || 500,
    overlap: body.overlap || 100,
    strategy: body.strategy || 'recursive'
  });

  const doc = loadFromString(
    body.text,
    'chunk-demo',
    { source: 'postman-test' }
  );

  const chunks = chunker.chunkDocument(doc);

  res.json({
    originalLength: body.text.length,
    chunkSize: body.chunkSize || 500,
    overlap: body.overlap || 100,
    strategy: body.strategy || 'recursive',
    totalChunks: chunks.length,
    chunks: chunks.map(c => ({
      index: c.chunkIndex,
      length: c.content.length,
      startChar: c.startChar,
      endChar: c.endChar,
      content: c.content.slice(0, 150) + (c.content.length > 150 ? '...' : '')
    }))
  });
});

// ── Agent ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/phase5/agent/run
 * Run an AI agent with tools.
 * The agent reasons through the task step by step, calling tools when needed.
 *
 * Available tools:
 *   calculator       — math expressions
 *   get_current_datetime — current date and time
 *   json_processor   — parse/format/validate JSON
 *   get_weather      — weather for a city (demo)
 *   get_user_count   — users and posts count
 *
 * Body:
 * {
 *   "task":          "What is 25 * 4 and what is today's date?",
 *   "maxIterations": 5
 * }
 */
app.post('/api/phase5/agent/run', async (req, res) => {
  const body = req.body as {
    task?: string;
    maxIterations?: number;
  };

  if (!body.task) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'task field is required' }
    });
    return;
  }

  try {
    const agent = new Agent({
      provider: aiProvider,
      tools: allTools,
      maxIterations: body.maxIterations || 8,
      temperature: 0.1,
      systemPrompt:
        'You are a helpful assistant with access to tools. ' +
        'Use tools when needed to answer accurately. ' +
        'Be concise and direct in your responses.'
    });

    const result = await agent.run(body.task);

    res.json({
      task: body.task,
      response: result.response,
      success: result.success,
      iterations: result.iterations,
      steps: result.steps.map(step => ({
        iteration: step.iteration,
        thought: step.thought?.slice(0, 200),
        toolCalls: step.toolCalls?.map(tc => ({
          tool: tc.name,
          arguments: tc.arguments
        })),
        toolResults: step.toolResults?.map(tr => ({
          tool: tr.toolName,
          result: tr.result
        })),
        finalAnswer: step.finalAnswer ? step.finalAnswer.slice(0, 200) : undefined
      })),
      usage: result.usage
    });
  } catch (err) {
    res.status(503).json({
      error: { code: 'AI_ERROR', message: (err as Error).message }
    });
  }
});

/**
 * POST /api/phase5/agent/stream
 * Run agent with streaming — each step streams as it happens.
 * Watch the reasoning process in real time via SSE.
 *
 * Body:
 * {
 *   "task": "What is the weather in Lahore and what time is it?"
 * }
 */
app.post('/api/phase5/agent/stream', async (req, res) => {
  const body = req.body as { task?: string; maxIterations?: number };

  if (!body.task) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'task field is required' }
    });
    return;
  }

  const sse = createSSE(res);

  try {
    const agent = new Agent({
      provider: aiProvider,
      tools: allTools,
      maxIterations: body.maxIterations || 8,
      temperature: 0.1,
      systemPrompt:
        'You are a helpful assistant. Use tools when needed.'
    });

    for await (const step of agent.runStream(body.task)) {
      if (!sse.isOpen) break;

      sse.send({
        iteration: step.iteration,
        thought: step.thought,
        toolCalls: step.toolCalls?.map(tc => ({
          tool: tc.name,
          arguments: tc.arguments
        })),
        toolResults: step.toolResults?.map(tr => ({
          tool: tr.toolName,
          result: tr.result
        })),
        finalAnswer: step.finalAnswer,
        done: step.done
      }, step.done ? 'done' : 'step');

      if (step.done) break;
    }
  } catch (err) {
    if (sse.isOpen) {
      sse.send({ error: (err as Error).message }, 'error');
    }
  } finally {
    sse.close();
  }
});

/**
 * GET /api/phase5/agent/tools
 * List all available tools the agent can use
 */
app.get('/api/phase5/agent/tools', (req, res) => {
  res.json({
    tools: allTools.map(tool => ({
      name: tool.definition.name,
      description: tool.definition.description,
      parameters: Object.keys(tool.definition.parameters.properties || {}),
      required: tool.definition.parameters.required || []
    }))
  });
});

// ── MCP Client ────────────────────────────────────────────────────────────────

/**
 * POST /api/phase5/mcp/connect
 * Test connection to an MCP server
 *
 * Body:
 * {
 *   "serverUrl": "http://localhost:8080"
 * }
 */
app.post('/api/phase5/mcp/connect', async (req, res) => {
  const body = req.body as { serverUrl?: string };

  if (!body.serverUrl) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'serverUrl is required' }
    });
    return;
  }

  try {
    const client = new MCPClient({
      serverUrl: body.serverUrl,
      clientName: 'REstJS-Postman-Test',
      clientVersion: '0.1.0',
      timeoutMs: 5000
    });

    await client.connect();
    const tools = await client.listTools();
    const resources = await client.listResources();

    await client.disconnect();

    res.json({
      connected: true,
      serverUrl: body.serverUrl,
      tools: tools.map(t => ({ name: t.name, description: t.description })),
      resources: resources.map(r => ({ uri: r.uri, name: r.name })),
      toolCount: tools.length,
      resourceCount: resources.length
    });
  } catch (err) {
    res.status(503).json({
      connected: false,
      serverUrl: body.serverUrl,
      error: (err as Error).message,
      tip: 'Make sure your MCP server is running at the specified URL'
    });
  }
});

/**
 * GET /api/phase5/mcp/info
 * Information about the MCP protocol
 */
app.get('/api/phase5/mcp/info', (req, res) => {
  res.json({
    feature: 'Model Context Protocol (MCP)',
    version: '2024-11-05',
    protocol: 'JSON-RPC 2.0 over HTTP',
    usage: {
      connect: 'POST /api/phase5/mcp/connect with { serverUrl }',
      callTool: 'POST /api/phase5/mcp/tool with { serverUrl, tool, args }',
      integrate: 'MCP tools auto-convert to Agent tools via asAgentTools()'
    },
    tip: 'Start a local MCP server to test. Many open source MCP servers are available.'
  });
});

/**
 * POST /api/phase5/mcp/tool
 * Call a specific tool on an MCP server
 *
 * Body:
 * {
 *   "serverUrl": "http://localhost:8080",
 *   "tool":      "read_file",
 *   "args":      { "path": "/etc/hostname" }
 * }
 */
app.post('/api/phase5/mcp/tool', async (req, res) => {
  const body = req.body as {
    serverUrl?: string;
    tool?: string;
    args?: Record<string, unknown>;
  };

  if (!body.serverUrl || !body.tool) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'serverUrl and tool are required' }
    });
    return;
  }

  try {
    const client = new MCPClient({ serverUrl: body.serverUrl, timeoutMs: 10000 });
    await client.connect();

    const result = await client.callTool(body.tool, body.args || {});
    await client.disconnect();

    res.json({
      tool: body.tool,
      args: body.args,
      result: result.content,
      error: result.isError
    });
  } catch (err) {
    res.status(503).json({
      error: { code: 'MCP_ERROR', message: (err as Error).message }
    });
  }
});

// ── AI Health ─────────────────────────────────────────────────────────────────

/**
 * GET /api/phase5/health
 * Check if the AI provider is responding
 */
app.get('/api/phase5/health', async (req, res) => {
  const start = Date.now();

  try {
    // Send a minimal request to test connectivity
    const response = await aiProvider.complete({
      messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
      maxTokens: 10,
      temperature: 0
    });

    const latencyMs = Date.now() - start;

    res.json({
      status: 'healthy',
      provider: aiProvider.name,
      model: response.model,
      latencyMs,
      testResponse: response.content.trim(),
      vectorStore: vectorStore.size,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      provider: aiProvider.name,
      error: (err as Error).message,
      tip: aiProvider.name === 'ollama'
        ? 'Start Ollama: ollama serve  |  Pull model: ollama pull llama3.2'
        : 'Check your API key in .env file',
      timestamp: new Date().toISOString()
    });
  }
});

// ─── Phase 6 Infrastructure ───────────────────────────────────────────────────

// ── Feature Flags ─────────────────────────────────────────────────────────────

const flags = new FeatureFlagManager();

// Register some default feature flags for testing
flags.define({
  name: 'new-dashboard',
  enabled: true,
  description: 'New admin dashboard UI',
  rolloutPercentage: 100
});

flags.define({
  name: 'ai-chat',
  enabled: true,
  description: 'AI chat feature for users',
  rolloutPercentage: 50
});

flags.define({
  name: 'beta-api',
  enabled: true,
  description: 'Beta API endpoints',
  allowedTenants: ['tenant-beta', 'tenant-dev'],
  rolloutPercentage: 100
});

flags.define({
  name: 'dark-mode',
  enabled: true,
  description: 'Dark mode for the UI',
  allowedUsers: [1, 2, 3],
  rolloutPercentage: 100
});

flags.define({
  name: 'maintenance-mode',
  enabled: false,
  description: 'Put the app in maintenance mode',
  rolloutPercentage: 0
});

flags.define({
  name: 'expired-feature',
  enabled: true,
  description: 'This flag has expired',
  expiresAt: '2020-01-01T00:00:00.000Z',
  rolloutPercentage: 100
});

// ── In-Memory Tenant Store ────────────────────────────────────────────────────

interface TenantRecord {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  active: boolean;
}

const tenants: TenantRecord[] = [
  {
    id: 'tenant-acme',
    name: 'Acme Corporation',
    plan: 'enterprise',
    createdAt: new Date().toISOString(),
    active: true
  },
  {
    id: 'tenant-beta',
    name: 'Beta Testers Inc',
    plan: 'pro',
    createdAt: new Date().toISOString(),
    active: true
  },
  {
    id: 'tenant-dev',
    name: 'Dev Team',
    plan: 'free',
    createdAt: new Date().toISOString(),
    active: true
  }
];

// ── Audit Log Store ───────────────────────────────────────────────────────────

// In-memory audit log store (in production: write to database or S3)
const auditLogs: any[] = [];

// Subscribe to audit events from the global event bus
// Every auditLog() call emits 'audit.log' — we collect them here
eventBus.on('audit.log', (event) => {
  auditLogs.push(event.payload);

  // Keep only last 1000 audit logs in memory
  if (auditLogs.length > 1000) {
    auditLogs.shift();
  }
});


// =============================================================================
//  PHASE 6 — Enterprise Cloud Platform
//  Multi-Tenancy, Audit Logging, Feature Flags, Deployment, Dashboard
// =============================================================================

// ── Multi-Tenancy ─────────────────────────────────────────────────────────────

/**
 * GET /api/phase6/tenants
 * List all registered tenants
 */
app.get('/api/phase6/tenants', (req, res) => {
  res.json({
    data: tenants,
    total: tenants.length,
    tip: 'Send x-tenant-id header to identify your tenant in requests'
  });
});

/**
 * POST /api/phase6/tenants
 * Create a new tenant
 *
 * Body:
 * {
 *   "id":   "tenant-xyz",
 *   "name": "XYZ Company",
 *   "plan": "pro"
 * }
 */
app.post('/api/phase6/tenants', (req, res) => {
  const body = req.body as {
    id?: string;
    name?: string;
    plan?: 'free' | 'pro' | 'enterprise';
  };

  if (!body.id || !body.name) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'id and name are required' }
    });
    return;
  }

  const exists = tenants.find(t => t.id === body.id);
  if (exists) {
    res.status(409).json({
      error: { code: 'CONFLICT', message: `Tenant '${body.id}' already exists` }
    });
    return;
  }

  const tenant: TenantRecord = {
    id: body.id,
    name: body.name,
    plan: body.plan || 'free',
    createdAt: new Date().toISOString(),
    active: true
  };

  tenants.push(tenant);

  // Audit log the tenant creation
  auditLog({
    action: 'tenant.create',
    actor: { id: 'system', type: 'system' },
    metadata: { tenantId: tenant.id, plan: tenant.plan },
    success: true
  });

  res.status(201).json({
    message: 'Tenant created',
    data: tenant
  });
});

/**
 * GET /api/phase6/tenant/me
 * Get current tenant from the x-tenant-id header
 * Header: x-tenant-id: tenant-acme
 *
 * This route uses multiTenancy() middleware inline
 * so you can see exactly how it works.
 */
app.get(
  '/api/phase6/tenant/me',
  multiTenancy({
    strategy: 'header',
    headerName: 'x-tenant-id',
    resolveTenant: async (id: string) => {
      const found = tenants.find(t => t.id === id);
      if (!found) return null;
      return { id: found.id, name: found.name, plan: found.plan };
    }
  }),
  (req, res) => {
    const tenant = getTenant(req);
    res.json({
      message: 'Tenant identified from x-tenant-id header',
      tenant,
      tip: 'Change the x-tenant-id header value to switch tenants'
    });
  }
);

/**
 * GET /api/phase6/tenant/data
 * Simulate tenant-isolated data — each tenant sees only their own data
 * Header: x-tenant-id: tenant-acme | tenant-beta | tenant-dev
 */
app.get(
  '/api/phase6/tenant/data',
  multiTenancy({
    strategy: 'header',
    headerName: 'x-tenant-id',
    resolveTenant: async (id: string) => {
      const found = tenants.find(t => t.id === id);
      return found ? { id: found.id, name: found.name, plan: found.plan } : null;
    }
  }),
  (req, res) => {
    const tenant = getTenant(req);

    // Simulate tenant-scoped data
    const tenantData: Record<string, any> = {
      'tenant-acme': {
        users: 1250,
        projects: 48,
        storage: '2.4 TB',
        plan: 'enterprise',
        features: ['ai', 'sso', 'audit', 'custom-domain']
      },
      'tenant-beta': {
        users: 85,
        projects: 12,
        storage: '120 GB',
        plan: 'pro',
        features: ['ai', 'audit']
      },
      'tenant-dev': {
        users: 5,
        projects: 3,
        storage: '2 GB',
        plan: 'free',
        features: []
      }
    };

    const data = tenantData[tenant.id] || {
      users: 0,
      projects: 0,
      storage: '0 GB',
      plan: 'free',
      features: []
    };

    // Audit this data access
    auditLog({
      action: 'tenant.data.read',
      actor: { id: 'api-client', type: 'api' },
      tenantId: tenant.id,
      metadata: { endpoint: '/api/phase6/tenant/data' },
      success: true
    });

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan
      },
      data,
      note: 'Each tenant sees only their own isolated data'
    });
  }
);

/**
 * GET /api/phase6/tenant/subdomain
 * Demonstrate subdomain-based tenant resolution
 * Header: Host: tenant-acme.localhost
 *
 * In Postman: Add Host header = tenant-acme.localhost
 */
app.get(
  '/api/phase6/tenant/subdomain',
  multiTenancy({
    strategy: 'subdomain',
    required: false,
    resolveTenant: async (id: string) => {
      const found = tenants.find(t => t.id === id);
      return found ? { id: found.id, name: found.name, plan: found.plan } : null;
    }
  }),
  (req, res) => {
    const tenant = (req.locals as any).tenant;

    res.json({
      message: tenant
        ? `Tenant resolved from subdomain`
        : 'No tenant resolved — no subdomain detected',
      tenant: tenant || null,
      hostHeader: req.headers['host'],
      tip: 'In Postman: Add Header → Host: tenant-acme.localhost'
    });
  }
);

// ── Audit Logging ─────────────────────────────────────────────────────────────

/**
 * GET /api/phase6/audit/logs
 * View audit log entries collected since server started
 * Query: ?limit=20&action=user.login&tenantId=tenant-acme
 */
app.get('/api/phase6/audit/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const action = req.query.action as string | undefined;
  const tenantId = req.query.tenantId as string | undefined;
  const actorId = req.query.actorId as string | undefined;

  let filtered = [...auditLogs];

  // Apply filters
  if (action) {
    filtered = filtered.filter(log =>
      log.action?.includes(action)
    );
  }

  if (tenantId) {
    filtered = filtered.filter(log => log.tenantId === tenantId);
  }

  if (actorId) {
    filtered = filtered.filter(log =>
      String(log.actor?.id) === actorId
    );
  }

  // Return most recent first
  const results = filtered.reverse().slice(0, limit);

  res.json({
    total: filtered.length,
    limit,
    filters: { action, tenantId, actorId },
    logs: results
  });
});

/**
 * POST /api/phase6/audit/log
 * Manually write an audit log entry
 * Demonstrates the auditLog() function directly
 *
 * Body:
 * {
 *   "action":   "user.login",
 *   "actorId":  "123",
 *   "actorType": "user",
 *   "tenantId": "tenant-acme",
 *   "success":  true,
 *   "metadata": { "ip": "192.168.1.1" }
 * }
 */
app.post('/api/phase6/audit/log', (req, res) => {
  const body = req.body as {
    action?: string;
    actorId?: string | number;
    actorType?: 'user' | 'system' | 'api';
    tenantId?: string;
    success?: boolean;
    metadata?: Record<string, unknown>;
    error?: string;
  };

  if (!body.action) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'action field is required' }
    });
    return;
  }

  auditLog({
    action: body.action,
    actor: {
      id: body.actorId || 'postman-test',
      type: body.actorType || 'api'
    },
    tenantId: body.tenantId,
    metadata: body.metadata || {},
    success: body.success ?? true,
    error: body.error
  });

  res.status(201).json({
    message: 'Audit event logged',
    action: body.action,
    timestamp: new Date().toISOString(),
    tip: 'GET /api/phase6/audit/logs to see all logs'
  });
});

/**
 * DELETE /api/phase6/audit/clear
 * Clear all audit logs from memory (testing only)
 */
app.delete('/api/phase6/audit/clear', (req, res) => {
  const count = auditLogs.length;
  auditLogs.splice(0, auditLogs.length);

  res.json({
    message: 'Audit logs cleared',
    cleared: count
  });
});

/**
 * GET /api/phase6/audit/stats
 * Audit log statistics
 */
app.get('/api/phase6/audit/stats', (req, res) => {
  const actionCounts: Record<string, number> = {};
  const actorCounts: Record<string, number> = {};
  let successCount = 0;
  let failureCount = 0;

  for (const log of auditLogs) {
    // Count by action
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;

    // Count by actor
    const actorKey = String(log.actor?.id || 'unknown');
    actorCounts[actorKey] = (actorCounts[actorKey] || 0) + 1;

    // Count success/failure
    if (log.success) successCount++;
    else failureCount++;
  }

  res.json({
    total: auditLogs.length,
    successCount,
    failureCount,
    topActions: Object.entries(actionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([action, count]) => ({ action, count })),
    topActors: Object.entries(actorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([actor, count]) => ({ actor, count }))
  });
});

// ── Feature Flags ─────────────────────────────────────────────────────────────

/**
 * GET /api/phase6/flags
 * List all registered feature flags
 */
app.get('/api/phase6/flags', (req, res) => {
  res.json({
    flags: flags.getAll(),
    total: flags.getAll().length
  });
});

/**
 * POST /api/phase6/flags
 * Create or update a feature flag
 *
 * Body:
 * {
 *   "name":              "my-feature",
 *   "enabled":           true,
 *   "description":       "My new feature",
 *   "rolloutPercentage": 50,
 *   "allowedTenants":    ["tenant-acme"],
 *   "allowedUsers":      [1, 2, 3]
 * }
 */
app.post('/api/phase6/flags', (req, res) => {
  const body = req.body as {
    name?: string;
    enabled?: boolean;
    description?: string;
    rolloutPercentage?: number;
    allowedTenants?: string[];
    allowedUsers?: (string | number)[];
    expiresAt?: string;
  };

  if (!body.name) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'name is required' }
    });
    return;
  }

  flags.define({
    name: body.name,
    enabled: body.enabled ?? true,
    description: body.description,
    rolloutPercentage: body.rolloutPercentage ?? 100,
    allowedTenants: body.allowedTenants,
    allowedUsers: body.allowedUsers,
    expiresAt: body.expiresAt
  });

  res.status(201).json({
    message: `Feature flag '${body.name}' defined`,
    flag: flags.getAll().find(f => f.name === body.name)
  });
});

/**
 * GET /api/phase6/flags/:name/check
 * Check if a feature flag is enabled for a given context
 * Query: ?tenantId=tenant-acme&userId=1&percentage=75
 *
 * Examples:
 *   /api/phase6/flags/new-dashboard/check
 *   /api/phase6/flags/beta-api/check?tenantId=tenant-acme
 *   /api/phase6/flags/ai-chat/check?percentage=25
 *   /api/phase6/flags/ai-chat/check?percentage=75
 *   /api/phase6/flags/dark-mode/check?userId=1
 *   /api/phase6/flags/dark-mode/check?userId=99
 */
app.get('/api/phase6/flags/:name/check', (req, res) => {
  const name = req.params.name;
  const tenantId = req.query.tenantId as string | undefined;
  const userId = req.query.userId
    ? Number(req.query.userId)
    : undefined;
  const percentage = req.query.percentage
    ? Number(req.query.percentage)
    : undefined;

  const enabled = flags.isEnabled(name, {
    tenantId,
    userId,
    percentage
  });

  const allFlags = flags.getAll();
  const flag = allFlags.find(f => f.name === name);

  res.json({
    flag: name,
    enabled,
    context: { tenantId, userId, percentage },
    definition: flag || null,
    reason: !flag
      ? 'Flag not found'
      : !flag.enabled
        ? 'Flag is disabled'
        : flag.expiresAt && new Date(flag.expiresAt) < new Date()
          ? 'Flag has expired'
          : flag.allowedTenants && tenantId && !flag.allowedTenants.includes(tenantId)
            ? 'Tenant not in allowed list'
            : flag.allowedUsers && userId !== undefined && !flag.allowedUsers.includes(userId)
              ? 'User not in allowed list'
              : enabled
                ? 'All conditions passed'
                : 'Rollout percentage check failed'
  });
});

/**
 * PATCH /api/phase6/flags/:name
 * Enable or disable a feature flag
 *
 * Body: { "enabled": true | false }
 */
app.patch('/api/phase6/flags/:name', (req, res) => {
  const name = req.params.name;
  const body = req.body as { enabled?: boolean };

  const allFlags = flags.getAll();
  const flag = allFlags.find(f => f.name === name);

  if (!flag) {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Feature flag '${name}' not found`
      }
    });
    return;
  }

  if (body.enabled === undefined) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'enabled field is required' }
    });
    return;
  }

  // Redefine with updated enabled state
  flags.define({ ...flag, enabled: body.enabled });

  // Audit log the change
  auditLog({
    action: body.enabled ? 'flag.enable' : 'flag.disable',
    actor: { id: 'postman-test', type: 'api' },
    metadata: { flag: name },
    success: true
  });

  res.json({
    message: `Flag '${name}' ${body.enabled ? 'enabled' : 'disabled'}`,
    flag: { ...flag, enabled: body.enabled }
  });
});

/**
 * POST /api/phase6/flags/evaluate-batch
 * Check multiple flags at once for a given context
 * Useful for frontend apps that need to know all flags on load.
 *
 * Body:
 * {
 *   "flags":    ["new-dashboard", "ai-chat", "dark-mode", "beta-api"],
 *   "tenantId": "tenant-acme",
 *   "userId":   1,
 *   "percentage": 60
 * }
 */
app.post('/api/phase6/flags/evaluate-batch', (req, res) => {
  const body = req.body as {
    flags?: string[];
    tenantId?: string;
    userId?: number;
    percentage?: number;
  };

  if (!body.flags || !Array.isArray(body.flags)) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'flags array is required' }
    });
    return;
  }

  const context = {
    tenantId: body.tenantId,
    userId: body.userId,
    percentage: body.percentage
  };

  const results: Record<string, boolean> = {};

  for (const name of body.flags) {
    results[name] = flags.isEnabled(name, context);
  }

  res.json({
    context,
    flags: results,
    enabled: Object.entries(results)
      .filter(([, v]) => v)
      .map(([k]) => k),
    disabled: Object.entries(results)
      .filter(([, v]) => !v)
      .map(([k]) => k)
  });
});

// ── Deployment ────────────────────────────────────────────────────────────────

/**
 * GET /api/phase6/deploy/info
 * Information about the rest deploy command
 */
app.get('/api/phase6/deploy/info', (req, res) => {
  res.json({
    feature: 'Deployment Toolkit',
    command: 'rest deploy',
    generates: ['Dockerfile', 'deployment.yaml', 'deploy.sh'],
    kubernetes: {
      resources: [
        'Deployment — runs the app in pods',
        'Service    — exposes the app internally',
        'HPA        — auto-scales based on CPU'
      ]
    },
    workflow: [
      '1. npm run build          → compile TypeScript',
      '2. rest deploy            → generate deploy/ files',
      '3. docker build           → build container image',
      '4. docker push            → push to registry',
      '5. kubectl apply          → deploy to Kubernetes',
      '6. kubectl rollout status → verify deployment'
    ]
  });
});

/**
 * POST /api/phase6/deploy/generate
 * Generate deployment files for a custom configuration
 * Files are written to ./deploy/ directory
 *
 * Body:
 * {
 *   "appName":  "my-api",
 *   "version":  "1.2.0",
 *   "port":     3000,
 *   "replicas": 3,
 *   "env": {
 *     "NODE_ENV":    "production",
 *     "DATABASE_URL": "postgres://..."
 *   }
 * }
 */
app.post('/api/phase6/deploy/generate', (req, res) => {
  const body = req.body as {
    appName?: string;
    version?: string;
    port?: number;
    replicas?: number;
    env?: Record<string, string>;
  };

  if (!body.appName) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'appName is required' }
    });
    return;
  }

  try {
    generateDeployment({
      appName: body.appName,
      version: body.version || '1.0.0',
      port: body.port || 3000,
      replicas: body.replicas || 3,
      env: body.env || { NODE_ENV: 'production' }
    });

    auditLog({
      action: 'deploy.generate',
      actor: { id: 'postman-test', type: 'api' },
      metadata: {
        appName: body.appName,
        version: body.version,
        port: body.port,
        replicas: body.replicas
      },
      success: true
    });

    res.json({
      message: 'Deployment files generated',
      outputDir: './deploy/',
      files: [
        'Dockerfile         — multi-stage production build',
        'deployment.yaml   — Kubernetes Deployment + Service + HPA',
        'deploy.sh         — build, push, deploy script'
      ],
      appName: body.appName,
      version: body.version || '1.0.0',
      port: body.port || 3000,
      replicas: body.replicas || 3
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'DEPLOY_ERROR',
        message: (err as Error).message
      }
    });
  }
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * GET /api/phase6/dashboard
 * Complete system dashboard — all metrics in one response
 */
app.get('/api/phase6/dashboard', (req, res) => {
  const memMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const uptime = Math.round(process.uptime());

  res.json({
    system: {
      uptime: `${uptime}s`,
      memory: `${memMb}MB`,
      node: process.version,
      env: config.NODE_ENV,
      timestamp: new Date().toISOString()
    },
    data: {
      users: users.length,
      posts: posts.length,
      tenants: tenants.length
    },
    queue: emailQueue.getStats(),
    scheduler: {
      tasks: scheduler.getTasks().length,
      running: true
    },
    circuitBreaker: externalCB.getStats(),
    events: {
      historySize: eventBus.getHistory().length,
      types: eventBus.getEventTypes().length
    },
    audit: {
      totalLogs: auditLogs.length,
      recent: auditLogs.slice(-5).reverse()
    },
    featureFlags: {
      total: flags.getAll().length,
      enabled: flags.getAll().filter(f => f.enabled).length,
      flags: flags.getAll().map(f => ({
        name: f.name,
        enabled: f.enabled
      }))
    },
    ai: {
      provider: aiProvider.name,
      model: aiProvider.defaultModel,
      vectorStore: vectorStore.size
    }
  });
});

/**
 * GET /api/phase6/dashboard/html
 * Live monitoring dashboard — HTML page that auto-refreshes
 * Open in browser: http://localhost:3000/api/phase6/dashboard/html
 */
app.get('/api/phase6/dashboard/html', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>REstJS Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 24px;
    }
    h1 {
      color: #60a5fa;
      font-size: 28px;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #64748b;
      font-size: 14px;
      margin-bottom: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px;
    }
    .card h2 {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #94a3b8;
      margin-bottom: 16px;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #1e293b;
    }
    .metric:last-child { border-bottom: none; }
    .metric-label { color: #94a3b8; font-size: 13px; }
    .metric-value { font-weight: 600; font-size: 15px; }
    .green  { color: #22c55e; }
    .blue   { color: #60a5fa; }
    .yellow { color: #fbbf24; }
    .red    { color: #f87171; }
    .flag-list { margin-top: 8px; }
    .flag-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 13px;
      border-bottom: 1px solid #334155;
    }
    .flag-item:last-child { border-bottom: none; }
    .badge {
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-green  { background: #166534; color: #4ade80; }
    .badge-red    { background: #7f1d1d; color: #f87171; }
    .badge-yellow { background: #78350f; color: #fbbf24; }
    .refresh {
      display: inline-block;
      margin-top: 24px;
      color: #475569;
      font-size: 13px;
    }
    pre {
      background: #0f172a;
      padding: 12px;
      border-radius: 8px;
      font-size: 12px;
      overflow-x: auto;
      margin-top: 8px;
      max-height: 200px;
      overflow-y: auto;
    }
  </style>
</head>
<body>

  <h1>⚡ REstJS Dashboard</h1>
  <p class="subtitle">Live monitoring — auto-refreshes every 3 seconds</p>

  <div class="grid" id="grid">
    <div class="card">
      <h2>Loading...</h2>
    </div>
  </div>

  <p class="refresh" id="lastUpdate">Last updated: —</p>

  <script>
    function badge(val, trueLabel, falseLabel) {
      return val
        ? '<span class="badge badge-green">' + trueLabel + '</span>'
        : '<span class="badge badge-red">'  + falseLabel + '</span>';
    }

    function colorClass(val, warnAt, errAt) {
      if (val >= errAt)  return 'red';
      if (val >= warnAt) return 'yellow';
      return 'green';
    }

    function render(d) {
      const grid = document.getElementById('grid');

      grid.innerHTML = [

        // System
        '<div class="card"><h2>System</h2>' +
          '<div class="metric"><span class="metric-label">Uptime</span>' +
          '<span class="metric-value green">' + d.system.uptime + '</span></div>' +
          '<div class="metric"><span class="metric-label">Memory</span>' +
          '<span class="metric-value ' + colorClass(parseInt(d.system.memory), 100, 300) + '">' + d.system.memory + '</span></div>' +
          '<div class="metric"><span class="metric-label">Node.js</span>' +
          '<span class="metric-value blue">' + d.system.node + '</span></div>' +
          '<div class="metric"><span class="metric-label">Environment</span>' +
          '<span class="metric-value yellow">' + d.system.env + '</span></div>' +
          '</div>',

        // Data
        '<div class="card"><h2>Data Store</h2>' +
          '<div class="metric"><span class="metric-label">Users</span>' +
          '<span class="metric-value blue">' + d.data.users + '</span></div>' +
          '<div class="metric"><span class="metric-label">Posts</span>' +
          '<span class="metric-value blue">' + d.data.posts + '</span></div>' +
          '<div class="metric"><span class="metric-label">Tenants</span>' +
          '<span class="metric-value blue">' + d.data.tenants + '</span></div>' +
          '</div>',

        // Queue
        '<div class="card"><h2>Email Queue</h2>' +
          '<div class="metric"><span class="metric-label">Pending</span>' +
          '<span class="metric-value yellow">' + d.queue.pending + '</span></div>' +
          '<div class="metric"><span class="metric-label">Active</span>' +
          '<span class="metric-value blue">' + d.queue.active + '</span></div>' +
          '<div class="metric"><span class="metric-label">Completed</span>' +
          '<span class="metric-value green">' + d.queue.completed + '</span></div>' +
          '<div class="metric"><span class="metric-label">Failed</span>' +
          '<span class="metric-value ' + (d.queue.failed > 0 ? 'red' : 'green') + '">' + d.queue.failed + '</span></div>' +
          '</div>',

        // Circuit Breaker
        '<div class="card"><h2>Circuit Breaker</h2>' +
          '<div class="metric"><span class="metric-label">State</span>' +
          '<span class="metric-value ' +
            (d.circuitBreaker.state === 'CLOSED' ? 'green' : d.circuitBreaker.state === 'HALF_OPEN' ? 'yellow' : 'red') + '">' +
            d.circuitBreaker.state + '</span></div>' +
          '<div class="metric"><span class="metric-label">Failures</span>' +
          '<span class="metric-value ' + (d.circuitBreaker.failureCount > 0 ? 'red' : 'green') + '">' + d.circuitBreaker.failureCount + '</span></div>' +
          '<div class="metric"><span class="metric-label">Requests</span>' +
          '<span class="metric-value blue">' + d.circuitBreaker.requestCount + '</span></div>' +
          '</div>',

        // AI
        '<div class="card"><h2>AI Platform</h2>' +
          '<div class="metric"><span class="metric-label">Provider</span>' +
          '<span class="metric-value blue">' + d.ai.provider + '</span></div>' +
          '<div class="metric"><span class="metric-label">Model</span>' +
          '<span class="metric-value">' + d.ai.model + '</span></div>' +
          '<div class="metric"><span class="metric-label">Vector Docs</span>' +
          '<span class="metric-value green">' + d.ai.vectorStore + '</span></div>' +
          '</div>',

        // Audit
        '<div class="card"><h2>Audit Logs</h2>' +
          '<div class="metric"><span class="metric-label">Total</span>' +
          '<span class="metric-value blue">' + d.audit.totalLogs + '</span></div>' +
          '<pre>' +
            (d.audit.recent.slice(0, 3).map(function(l) {
              return (l.success ? '✓' : '✗') + ' ' + l.actor.id + ' → ' + l.action;
            }).join('\\n') || 'No logs yet') +
          '</pre>' +
          '</div>',

        // Feature Flags
        '<div class="card"><h2>Feature Flags (' + d.featureFlags.enabled + '/' + d.featureFlags.total + ' enabled)</h2>' +
          '<div class="flag-list">' +
          d.featureFlags.flags.map(function(f) {
            return '<div class="flag-item"><span>' + f.name + '</span>' +
              badge(f.enabled, 'ON', 'OFF') + '</div>';
          }).join('') +
          '</div></div>',

        // Events
        '<div class="card"><h2>Events</h2>' +
          '<div class="metric"><span class="metric-label">History</span>' +
          '<span class="metric-value blue">' + d.events.historySize + '</span></div>' +
          '<div class="metric"><span class="metric-label">Event Types</span>' +
          '<span class="metric-value blue">' + d.events.types + '</span></div>' +
          '<div class="metric"><span class="metric-label">Scheduler Tasks</span>' +
          '<span class="metric-value green">' + d.scheduler.tasks + '</span></div>' +
          '</div>'

      ].join('');

      document.getElementById('lastUpdate').textContent =
        'Last updated: ' + new Date().toLocaleTimeString();
    }

    function fetchDashboard() {
      fetch('/api/phase6/dashboard')
        .then(function(r) { return r.json(); })
        .then(render)
        .catch(function(e) {
          console.error('Dashboard fetch error:', e);
        });
    }

    // Initial load
    fetchDashboard();

    // Auto-refresh every 3 seconds
    setInterval(fetchDashboard, 3000);
  </script>
</body>
</html>`;

  res.html(html);
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
      },

      phase5: {
        description: 'AI Platform — Providers, Chat, Streaming, Embeddings, RAG, Agents, Tools, MCP',
        workflow: [
          '1. GET  /api/phase5/health         → check AI provider is running',
          '2. POST /api/phase5/chat           → simple chat',
          '3. POST /api/phase5/rag/index      → add documents',
          '4. POST /api/phase5/rag/query      → ask questions',
          '5. POST /api/phase5/agent/run      → run agent with tools'
        ],
        endpoints: [
          'GET  /api/phase5/provider',
          'GET  /api/phase5/health',
          'POST /api/phase5/chat',
          'POST /api/phase5/chat/conversation',
          'POST /api/phase5/chat/stream',
          'POST /api/phase5/embed',
          'POST /api/phase5/embed/similarity',
          'GET  /api/phase5/rag/stats',
          'POST /api/phase5/rag/index',
          'POST /api/phase5/rag/query',
          'POST /api/phase5/rag/stream',
          'DELETE /api/phase5/rag/clear',
          'GET  /api/phase5/vector/stats',
          'POST /api/phase5/vector/search',
          'POST /api/phase5/chunk',
          'GET  /api/phase5/agent/tools',
          'POST /api/phase5/agent/run',
          'POST /api/phase5/agent/stream',
          'GET  /api/phase5/mcp/info',
          'POST /api/phase5/mcp/connect',
          'POST /api/phase5/mcp/tool'
        ]
      },

      phase6: {
        description: 'Enterprise Cloud — Multi-Tenancy, Audit, Feature Flags, Deploy, Dashboard',
        endpoints: [
          'GET    /api/phase6/tenants',
          'POST   /api/phase6/tenants',
          'GET    /api/phase6/tenant/me          [x-tenant-id header]',
          'GET    /api/phase6/tenant/data        [x-tenant-id header]',
          'GET    /api/phase6/tenant/subdomain   [Host header]',
          'GET    /api/phase6/audit/logs',
          'GET    /api/phase6/audit/stats',
          'POST   /api/phase6/audit/log',
          'DELETE /api/phase6/audit/clear',
          'GET    /api/phase6/flags',
          'POST   /api/phase6/flags',
          'GET    /api/phase6/flags/:name/check',
          'PATCH  /api/phase6/flags/:name',
          'POST   /api/phase6/flags/evaluate-batch',
          'GET    /api/phase6/deploy/info',
          'POST   /api/phase6/deploy/generate',
          'GET    /api/phase6/dashboard',
          'GET    /api/phase6/dashboard/html'
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

  // Index built-in REstJS knowledge into RAG
  await indexBuiltinKnowledge();

  // ── 2. Get the SAME server that is already listening on port 3000 ────────────
  // WSServer must attach to this server — not a new one
  const httpServer = app.getServer();

  if (!httpServer) {
    console.error('Could not get HTTP server — exiting');
    process.exit(1);
  }

  // ── 3. Attach WSServer to the existing HTTP server ───────────────────────────
  // Now ws://localhost:3000/ws will work correctly
  const wss = new WSServer(httpServer, {
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
      let parsed: any;

      try {
        parsed = JSON.parse(data.toString());
      } catch {
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
