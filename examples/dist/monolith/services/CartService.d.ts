/**
 * Cart Service — in-memory cart per user session.
 * In production, use Redis or database.
 */
interface CartItem {
    productId: number;
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
}
export declare class CartService {
    private productService;
    getCart(userId: number): {
        items: CartItem[];
        total: number;
    };
    addItem(userId: number, productId: number, quantity: number): Promise<{
        items: CartItem[];
        total: number;
    } | {
        error: string;
    }>;
    removeItem(userId: number, productId: number): {
        items: CartItem[];
        total: number;
    };
    clearCart(userId: number): {
        items: never[];
        total: number;
    };
}
export {};
//# sourceMappingURL=CartService.d.ts.map