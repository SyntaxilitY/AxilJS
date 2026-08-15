/**
 * Product Service — CRUD with PostgreSQL
 */
export declare class ProductService {
    private get driver();
    list(options: {
        page: number;
        limit: number;
        category?: string;
    }): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        limit: number;
    }>;
    findById(id: number): Promise<Record<string, unknown>>;
    create(data: {
        name: string;
        description?: string;
        price: number;
        stock: number;
        category?: string;
    }): Promise<Record<string, unknown>>;
    update(id: number, data: Partial<{
        name: string;
        description: string;
        price: number;
        stock: number;
        category: string;
    }>): Promise<Record<string, unknown> | null>;
    delete(id: number): Promise<boolean>;
}
//# sourceMappingURL=ProductService.d.ts.map