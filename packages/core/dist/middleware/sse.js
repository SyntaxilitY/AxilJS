"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSSE = createSSE;
exports.sseHeartbeat = sseHeartbeat;
/**
 * Create an SSE connection on a response object.
 * Sets all required SSE headers and returns a controller.
 */
function createSSE(res) {
    let open = true;
    // Set SSE-required headers
    const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        // Disable nginx buffering
        'X-Accel-Buffering': 'no'
    };
    // Allow CORS for SSE - unless cors() (or the handler) already decided
    // the allowed origin; writeHead would otherwise override it
    if (res.raw.getHeader('Access-Control-Allow-Origin') === undefined) {
        headers['Access-Control-Allow-Origin'] = '*';
    }
    res.raw.writeHead(200, headers);
    // Send initial comment to establish connection
    res.raw.write(': connected\n\n');
    // Handle client disconnect
    res.raw.on('close', () => {
        open = false;
    });
    return {
        get isOpen() {
            return open;
        },
        send(data, event, id) {
            if (!open)
                return;
            let message = '';
            // Event ID (for reconnection)
            // Line breaks would inject extra SSE fields/events - strip them
            if (id !== undefined) {
                message += `id: ${String(id).replace(/[\r\n]/g, '')}\n`;
            }
            // Event type
            if (event) {
                message += `event: ${event.replace(/[\r\n]/g, '')}\n`;
            }
            // Data payload
            const payload = typeof data === 'string' ? data : (JSON.stringify(data) ?? '');
            // SSE data must have "data: " prefix and each line separated.
            // SSE treats \r\n, \r and \n all as line terminators.
            payload.split(/\r\n|\r|\n/).forEach(line => {
                message += `data: ${line}\n`;
            });
            // Double newline marks end of event
            message += '\n';
            res.raw.write(message);
        },
        comment(text) {
            if (!open)
                return;
            // SSE comments start with colon
            res.raw.write(`: ${text.replace(/[\r\n]/g, ' ')}\n\n`);
        },
        close() {
            if (!open)
                return;
            open = false;
            res.raw.end();
        }
    };
}
/**
 * SSE heartbeat helper.
 * Keeps the connection alive by sending periodic comments.
 * Without this, proxies/load balancers may close idle connections.
 *
 * @param sse        SSE connection
 * @param intervalMs Interval in milliseconds (default: 30000)
 * @returns          Function to stop the heartbeat
 */
function sseHeartbeat(sse, intervalMs = 30000) {
    const timer = setInterval(() => {
        if (!sse.isOpen) {
            clearInterval(timer);
            return;
        }
        sse.comment('heartbeat');
    }, intervalMs);
    return () => clearInterval(timer);
}
//# sourceMappingURL=sse.js.map