"use strict";
/**
 * AxilJS Monolith Example — E-Commerce API
 *
 * Architecture: Monolith with Service Layer
 * Database:     PostgreSQL via @axiljs/orm
 * Auth:         JWT via @axiljs/auth
 * Validation:   Schema via @axiljs/validation
 * Response:     SyntaxilitY built-in manager
 *
 * Run:
 *   1. Create database: createdb axil_shop
 *   2. npx ts-node src/monolith/main.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@axiljs/core");
const security_1 = require("@axiljs/security");
const auth_1 = require("@axiljs/auth");
const orm_1 = require("@axiljs/orm");
const observability_1 = require("@axiljs/observability");
const config_1 = require("./config");
const db_1 = require("./db");
const auth_2 = require("./routes/auth");
const products_1 = require("./routes/products");
const cart_1 = require("./routes/cart");
const orders_1 = require("./routes/orders");
const path_1 = __importDefault(require("path"));
const logger = new observability_1.Logger({ name: 'Shop' });
const jwt = new auth_1.JWT(config_1.config.JWT_SECRET);
const app = new core_1.Application({
    server: { port: config_1.config.PORT, host: config_1.config.HOST },
    env: config_1.config.NODE_ENV
});
// Global middleware
app.use((0, security_1.helmet)());
app.use((0, core_1.cors)({ origin: '*' }));
app.use((0, security_1.rateLimit)({ max: 200, windowMs: 60000 }));
// Register routes
(0, auth_2.registerAuthRoutes)(app, jwt);
(0, products_1.registerProductRoutes)(app, jwt);
(0, cart_1.registerCartRoutes)(app, jwt);
(0, orders_1.registerOrderRoutes)(app, jwt);
// Info endpoint
app.get('/', (req, res) => {
    res.success({
        name: 'AxilJS Monolith — E-Commerce API',
        architecture: 'Monolith + Service Layer',
        database: 'PostgreSQL',
        endpoints: {
            auth: [
                'POST /api/auth/register',
                'POST /api/auth/login',
                'GET  /api/auth/me [auth]'
            ],
            products: [
                'GET    /api/products',
                'GET    /api/products/:id',
                'POST   /api/products [admin]',
                'PUT    /api/products/:id [admin]',
                'DELETE /api/products/:id [admin]'
            ],
            cart: [
                'GET    /api/cart [auth]',
                'POST   /api/cart/add [auth]',
                'DELETE /api/cart/remove/:productId [auth]',
                'DELETE /api/cart/clear [auth]'
            ],
            orders: [
                'POST  /api/orders/checkout [auth]',
                'GET   /api/orders [auth]',
                'GET   /api/orders/:id [auth]',
                'PATCH /api/orders/:id/status [admin]'
            ]
        },
        quickStart: [
            '1. POST /api/auth/register { name, email, password, role: "admin" }',
            '2. POST /api/auth/login { email, password }',
            '3. POST /api/products { name, price, stock } [admin token]',
            '4. POST /api/cart/add { productId: 1, quantity: 2 } [customer token]',
            '5. POST /api/orders/checkout { address: "..." } [customer token]'
        ]
    }, 'E-Commerce API ready');
});
// Bootstrap
async function start() {
    // Connect to PostgreSQL
    const db = await (0, db_1.connectDB)();
    logger.info('PostgreSQL connected');
    const runner = new orm_1.MigrationRunner(db.getDriver(), path_1.default.join(__dirname, 'migrations'));
    await runner.up();
    logger.info('Migrations complete');
    // Start server
    await app.listen(config_1.config.PORT, config_1.config.HOST);
    logger.info('E-Commerce API started', {
        url: `http://${config_1.config.HOST}:${config_1.config.PORT}`,
        db: 'PostgreSQL',
        arch: 'Monolith'
    });
}
start().catch(err => {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
});
