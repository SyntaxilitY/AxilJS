"use strict";
/**
 * Order Service — checkout, list orders, update status
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const db_1 = require("../db");
const CartService_1 = require("./CartService");
const ProductService_1 = require("./ProductService");
class OrderService {
    cartService = new CartService_1.CartService();
    productService = new ProductService_1.ProductService();
    get driver() { return (0, db_1.getDB)().getDriver(); }
    async checkout(userId, address) {
        const cart = this.cartService.getCart(userId);
        if (cart.items.length === 0)
            return { error: 'Cart is empty' };
        // Transaction: create order + items + reduce stock
        const order = await this.driver.transaction(async (trx) => {
            // Create order
            const orderResult = await trx.query(`INSERT INTO orders (user_id, status, total, address) VALUES ($1, 'pending', $2, $3) RETURNING *`, [userId, cart.total, address]);
            const order = orderResult.rows[0];
            // Create order items and reduce stock
            for (const item of cart.items) {
                await trx.query(`INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)`, [order.id, item.productId, item.quantity, item.price]);
                // Reduce stock
                const stockResult = await trx.query(`UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND stock >= $1 RETURNING id`, [item.quantity, item.productId]);
                if (stockResult.rows.length === 0) {
                    throw new Error(`Insufficient stock for product ${item.name}`);
                }
            }
            return order;
        });
        // Clear cart after successful checkout
        this.cartService.clearCart(userId);
        return order;
    }
    async listByUser(userId, page, limit) {
        const offset = (page - 1) * limit;
        const countResult = await this.driver.query('SELECT COUNT(*) as total FROM orders WHERE user_id = $1', [userId]);
        const ordersResult = await this.driver.query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);
        // Get items for each order
        const orders = [];
        for (const order of ordersResult.rows) {
            const itemsResult = await this.driver.query(`SELECT oi.*, p.name as product_name
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`, [order.id]);
            orders.push({ ...order, items: itemsResult.rows });
        }
        return {
            data: orders,
            total: parseInt(countResult.rows[0]?.total || '0', 10),
            page,
            limit
        };
    }
    async findById(orderId, userId) {
        let query = 'SELECT * FROM orders WHERE id = $1';
        const params = [orderId];
        if (userId) {
            query += ' AND user_id = $2';
            params.push(userId);
        }
        const result = await this.driver.query(query, params);
        if (result.rows.length === 0)
            return null;
        const order = result.rows[0];
        const itemsResult = await this.driver.query(`SELECT oi.*, p.name as product_name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`, [orderId]);
        return { ...order, items: itemsResult.rows };
    }
    async updateStatus(orderId, status) {
        const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status))
            return { error: `Invalid status. Use: ${validStatuses.join(', ')}` };
        const result = await this.driver.query(`UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [status, orderId]);
        return result.rows[0] || null;
    }
}
exports.OrderService = OrderService;
