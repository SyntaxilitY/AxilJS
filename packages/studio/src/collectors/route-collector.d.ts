/**
 * Collects route information from AxilJS app source files.
 * Scans src/ directory for route definitions.
 */
import type { RouteInfo, WebSocketInfo, SSEInfo } from '../types.js';
export declare class RouteCollector {
    private cwd;
    constructor(cwd: string);
    collect(): {
        routes: RouteInfo[];
        websockets: WebSocketInfo[];
        sse: SSEInfo[];
    };
    private scanFiles;
    private extractRoutes;
    private extractWebSockets;
    private extractWSEvents;
    private extractSSE;
    private extractHandlerName;
    private extractMiddleware;
}
//# sourceMappingURL=route-collector.d.ts.map