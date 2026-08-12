"use strict";
/**
 * Example: Full Phase 2 application setup.
 * Shows all new Phase 2 features working together.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@restjs/core");
const config_1 = require("@restjs/config");
const security_1 = require("@restjs/security");
// ── Step 1: Load environment variables ──────────────────────────────────────
// Loads .env file into process.env before anything else
(0, config_1.loadEnv)();
// ── Step 2: Validate and type configuration ──────────────────────────────────
const config = (0, config_1.defineConfig)({
    PORT: { type: 'number', default: 3000 },
    HOST: { type: 'string', default: '0.0.0.0' },
    NODE_ENV: { type: 'string', default: 'development' },
    DATABASE_URL: { type: 'string', required: false },
    API_KEY: { type: 'string', required: false },
    RATE_LIMIT: { type: 'number', default: 100 }
});
// ── Step 3: Create application ───────────────────────────────────────────────
const app = new core_1.Application({
    server: { port: config.PORT, host: config.HOST },
    env: config.NODE_ENV
});
// ── Step 4: Security middleware (applied globally) ───────────────────────────
app.use((0, security_1.helmet)()); // Security headers
app.use((0, core_1.cors)({ origin: '*' })); // CORS
app.use((0, security_1.rateLimit)({ max: config.RATE_LIMIT, windowMs: 60000 })); // Rate limiting
app.use((0, security_1.sanitize)()); // Input sanitization
// ── Step 5: Static files ─────────────────────────────────────────────────────
app.use((0, core_1.serveStatic)({ root: './public', prefix: '/static' }));
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
    const sse = (0, core_1.createSSE)(res);
    // Keep connection alive
    const stopHeartbeat = (0, core_1.sseHeartbeat)(sse, 15000);
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
//# sourceMappingURL=main.js.map