/**
 * Axil ORM Studio Server
 * Runs alongside the dev server on port+1.
 * Opens automatically when axil run is used.
 */
import type { StudioConfig } from './types.js';
export declare class StudioServer {
    private server;
    private config;
    private dbCollector;
    private cachedData;
    private lastRefresh;
    private cwd;
    constructor(config: StudioConfig);
    setDriver(driver: any, driverType: string): void;
    start(): Promise<void>;
    stop(): Promise<void>;
    private refreshData;
    private handleRequest;
    private json;
    private generateOpenAPI;
    private openBrowser;
}
//# sourceMappingURL=server.d.ts.map