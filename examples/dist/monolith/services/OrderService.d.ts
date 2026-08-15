/**
 * Order Service — checkout, list orders, update status
 */
export declare class OrderService {
    private cartService;
    private productService;
    private get driver();
    checkout(userId: number, address: string): Promise<Record<string, unknown>>;
    listByUser(userId: number, page: number, limit: number): Promise<{
        data: {
            items: Record<string, unknown>[];
        }[];
        total: number;
        page: number;
        limit: number;
    }>;
    findById(orderId: number, userId?: number): Promise<{
        items: Record<string, unknown>[];
    } | null>;
    updateStatus(orderId: number, status: string): Promise<Record<string, unknown>>;
}
//# sourceMappingURL=OrderService.d.ts.map