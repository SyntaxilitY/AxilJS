"use strict";
/**
 * Cart Service — in-memory cart per user session.
 * In production, use Redis or database.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartService = void 0;
const ProductService_1 = require("./ProductService");
// In-memory carts: userId → items
const carts = new Map();
class CartService {
    productService = new ProductService_1.ProductService();
    getCart(userId) {
        const items = carts.get(userId) || [];
        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        return { items, total: parseFloat(total.toFixed(2)) };
    }
    async addItem(userId, productId, quantity) {
        const product = await this.productService.findById(productId);
        if (!product)
            return { error: 'Product not found' };
        if (product.stock < quantity)
            return { error: `Only ${product.stock} in stock` };
        const items = carts.get(userId) || [];
        const existing = items.find(i => i.productId === productId);
        if (existing) {
            existing.quantity += quantity;
            existing.subtotal = parseFloat((existing.price * existing.quantity).toFixed(2));
        }
        else {
            items.push({
                productId,
                name: product.name,
                price: parseFloat(product.price),
                quantity,
                subtotal: parseFloat((parseFloat(product.price) * quantity).toFixed(2))
            });
        }
        carts.set(userId, items);
        return this.getCart(userId);
    }
    removeItem(userId, productId) {
        const items = carts.get(userId) || [];
        const filtered = items.filter(i => i.productId !== productId);
        carts.set(userId, filtered);
        return this.getCart(userId);
    }
    clearCart(userId) {
        carts.delete(userId);
        return { items: [], total: 0 };
    }
}
exports.CartService = CartService;
//# sourceMappingURL=CartService.js.map