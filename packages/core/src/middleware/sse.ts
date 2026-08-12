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

import { REstResponse } from '@restjs/common';

// ─── SSE Event ────────────────────────────────────────────────────────────────

export interface SSEEvent {
  // Event data (will be JSON-stringified if object)
  data: unknown;

  // Event type (default: 'message')
  // Client listens with: source.addEventListener('update', handler)
  event?: string;

  // Event ID for reconnection (browser sends Last-Event-ID header)
  id?: string;

  // Reconnection delay in milliseconds
  retry?: number;
}

// ─── SSE Connection ───────────────────────────────────────────────────────────

export interface SSEConnection {
  // Send an event to the client
  send(data: unknown, event?: string, id?: string): void;

  // Send a comment (keeps connection alive, not visible to client)
  comment(text: string): void;

  // Close the SSE connection
  close(): void;

  // Whether the connection is still open
  readonly isOpen: boolean;
}

/**
 * Create an SSE connection on a response object.
 * Sets all required SSE headers and returns a controller.
 */
export function createSSE(res: REstResponse): SSEConnection {
  let open = true;

  // Set SSE-required headers
  res.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    // Allow CORS for SSE
    'Access-Control-Allow-Origin': '*',
    // Disable nginx buffering
    'X-Accel-Buffering': 'no'
  });

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

    send(data: unknown, event?: string, id?: string): void {
      if (!open) return;

      let message = '';

      // Event ID (for reconnection)
      if (id !== undefined) {
        message += `id: ${id}\n`;
      }

      // Event type
      if (event) {
        message += `event: ${event}\n`;
      }

      // Data payload
      const payload =
        typeof data === 'string' ? data : JSON.stringify(data);

      // SSE data must have "data: " prefix and each line separated
      payload.split('\n').forEach(line => {
        message += `data: ${line}\n`;
      });

      // Double newline marks end of event
      message += '\n';

      res.raw.write(message);
    },

    comment(text: string): void {
      if (!open) return;
      // SSE comments start with colon
      res.raw.write(`: ${text}\n\n`);
    },

    close(): void {
      if (!open) return;
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
export function sseHeartbeat(
  sse: SSEConnection,
  intervalMs: number = 30000
): () => void {
  const timer = setInterval(() => {
    if (!sse.isOpen) {
      clearInterval(timer);
      return;
    }
    sse.comment('heartbeat');
  }, intervalMs);

  return () => clearInterval(timer);
}