"use strict";
/**
 * Cart Routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCartRoutes = registerCartRoutes;
const auth_1 = require("@axiljs/auth");
const validation_1 = require("@axiljs/validation");
const CartService_1 = require("../services/CartService");
function registerCartRoutes(app, jwt) {
    const cart = new CartService_1.CartService();
    const authMw = (0, auth_1.authenticate)(jwt);
    // GET /api/cart
    app.get('/api/cart', authMw, (req, res) => {
        const userId = Number(req.locals.user.sub);
        const result = cart.getCart(userId);
        res.success(result, 'Cart fetched');
    });
    // POST /api/cart/add
    app.post('/api/cart/add', authMw, (0, validation_1.validate)({
        body: validation_1.v.object({
            productId: validation_1.v.number().integer().positive(),
            quantity: validation_1.v.number().integer().positive()
        })
    }), async (req, res) => {
        const userId = Number(req.locals.user.sub);
        const body = req.body;
        const result = await cart.addItem(userId, body.productId, body.quantity);
        if ('error' in result)
            return res.badRequest(result.error);
        res.success(result, 'Item added to cart');
    });
    // DELETE /api/cart/remove/:productId
    app.delete('/api/cart/remove/:productId', authMw, (req, res) => {
        const userId = Number(req.locals.user.sub);
        const result = cart.removeItem(userId, Number(req.params.productId));
        res.success(result, 'Item removed from cart');
    });
    // DELETE /api/cart/clear
    app.delete('/api/cart/clear', authMw, (req, res) => {
        const userId = Number(req.locals.user.sub);
        const result = cart.clearCart(userId);
        res.success(result, 'Cart cleared');
    });
}
