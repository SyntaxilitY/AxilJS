/**
 * Database connection using @axiljs/orm
 * Configured for NeonDB (PostgreSQL with SSL)
 */
import { ConnectionManager } from '@axiljs/orm';
export declare function connectDB(): Promise<ConnectionManager>;
export declare function getDB(): ConnectionManager;
//# sourceMappingURL=db.d.ts.map