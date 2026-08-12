/**
 * Example: Full Phase 2 application setup.
 * Shows all new Phase 2 features working together.
 */

import { Application, cors, serveStatic, createSSE, sseHeartbeat } from '@restjs/core';
import { loadEnv, defineConfig } from '@restjs/config';
import { helmet, rateLimit, sanitize } from '@restjs/security';

// ── Step 1: Load environment variables ──────────────────────────────────────

// Loads .env file into process.env before anything else
loadEnv();

// ── Step 2: Validate and type configuration ──────────────────────────────────

const config = defineConfig({
  PORT:         { type: 'number',  default: 3000 },
  HOST:         { type: 'string',  default: '0.0.0.0' },
  NODE_ENV:     { type: 'string',  default: 'development' },
  DATABASE_URL: { type: 'string',  required: false },
  API_KEY:      { type: 'string',  required: false },
  RATE_LIMIT:   { type: 'number',  default: 100 }
});

// ── Step 3: Create application ───────────────────────────────────────────────

const app = new Application({
  server: { port: config.PORT, host: config.HOST },
  env: config.NODE_ENV
});

// ── Step 4: Security middleware (applied globally) ───────────────────────────

app.use(helmet());                        // Security headers
app.use(cors({ origin: '*' }));           // CORS
app.use(rateLimit({ max: config.RATE_LIMIT, windowMs: 60000 })); // Rate limiting
app.use(sanitize());                      // Input sanitization

// ── Step 5: Static files ─────────────────────────────────────────────────────

app.use(serveStatic({ root: './public', prefix: '/static' }));

// ── Step 6: Routes ───────────────────────────────────────────────────────────

// Health check (exclude from rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime()
  });
});

// SSE endpoint - real-time updates
app.get('/events', (req, res) => {
  const sse = createSSE(res);

  // Keep connection alive
  const stopHeartbeat = sseHeartbeat(sse, 15000);

  // Send updates every 2 seconds (demo)
  let count = 0;
  const interval = setInterval(() => {
    if (!sse.isOpen) {
      clearInterval(interval);
      stopHeartbeat();
      return;
    }

    sse.send({ count, timestamp: Date.now() }, 'update');
    count++;

    if (count >= 5) {
      sse.send({ message: 'Stream complete' }, 'done');
      sse.close();
      clearInterval(interval);
      stopHeartbeat();
    }
  }, 2000);
});

// ── Step 7: Start server ──────────────────────────────────────────────────────

app.listen().catch(console.error);