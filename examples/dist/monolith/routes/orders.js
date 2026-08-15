"use strict";
/**
 * Order Routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerOrderRoutes = registerOrderRoutes;
const core_1 = require("@axil/core");
const auth_1 = require("@axil/auth");
const validation_1 = require("@axil/validation");
const OrderService_1 = require("../services/OrderService");
function registerOrderRoutes(app, jwt) {
    const orders = new OrderService_1.OrderService();
    const authMw = (0, auth_1.authenticate)(jwt);
    const adminMw = (0, auth_1.requireRole)('admin');
    // POST /api/orders/checkout
    app.post('/api/orders/checkout', authMw, (0, validation_1.validate)({
        body: validation_1.v.object({
            address: validation_1.v.string().min(10).max(500)
        })
    }), async (req, res) => {
        const userId = Number(req.locals.user.sub);
        const body = req.body;
        try {
            const result = await orders.checkout(userId, body.address);
            if ('error' in result)
                return res.badRequest(result.error);
            res.created(result, 'Order placed');
        }
        catch (err) {
            res.badRequest(err.message);
        }
    });
    // GET /api/orders — user sees own, admin sees all
    app.get('/api/orders', authMw, async (req, res) => {
        const userId = Number(req.locals.user.sub);
        const { page, limit } = core_1.Response.getPaginationParams(req);
        const result = await orders.listByUser(userId, page, limit);
        res.paginated(result.data, result.total, result.page, result.limit, 'Orders fetched');
    });
    // GET /api/orders/:id
    app.get('/api/orders/:id', authMw, async (req, res) => {
        const userId = Number(req.locals.user.sub);
        const role = req.locals.user.role;
        // Admin can see any order, customer only their own
        const order = await orders.findById(Number(req.params.id), role === 'admin' ? undefined : userId);
        if (!order)
            return res.notFound('Order not found');
        res.success(order, 'Order fetched');
    });
    // PATCH /api/orders/:id/status — admin only
    app.patch('/api/orders/:id/status', authMw, adminMw, (0, validation_1.validate)({
        body: validation_1.v.object({
            status: validation_1.v.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
        })
    }), async (req, res) => {
        const body = req.body;
        const result = await orders.updateStatus(Number(req.params.id), body.status);
        if (!result)
            return res.notFound('Order not found');
        if ('error' in result)
            return res.badRequest(result.error);
        res.success(result, `Order status updated to ${body.status}`);
    });
}
