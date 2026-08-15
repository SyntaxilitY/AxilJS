/**
 * Server-Sent Events (SSE) utility.
 * Enables real-time server → client streaming.
 * Foundation for AI streaming responses (Phase 5).
 *
 * SSE is a W3C standard. The browser automatically reconnects.
 * Works through HTTP/1.1 - no WebSocket upgrade needed.
 *
 * Usage:
 *   app.get('/events', (req, res) => {
 *     const sse = createSSE(res)
 *     sse.send({ message: 'hello' })
 *     sse.send({ message: 'world' }, 'update')
 *     sse.close()
 *   })
 */
import { @axiljsResponse } from '@axiljs/common';
export interface SSEEvent {
    data: unknown;
    event?: string;
    id?: string;
    retry?: number;
}
export interface SSEConnection {
    send(data: unknown, event?: string, id?: string): void;
    comment(text: string): void;
    close(): void;
    readonly isOpen: boolean;
}
/**
 * Create an SSE connection on a response object.
 * Sets all required SSE headers and returns a controller.
 */
export declare function createSSE(res: @axiljsResponse): SSEConnection;
/**
 * SSE heartbeat helper.
 * Keeps the connection alive by sending periodic comments.
 * Without this, proxies/load balancers may close idle connections.
 *
 * @param sse        SSE connection
 * @param intervalMs Interval in milliseconds (default: 30000)
 * @returns          Function to stop the heartbeat
 */
export declare function sseHeartbeat(sse: SSEConnection, intervalMs?: number): () => void;
//# sourceMappingURL=sse.d.ts.map