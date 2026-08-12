/**
 * WebSocket HTTP Upgrade Handshake.
 * Implements the RFC 6455 opening handshake.
 *
 * The handshake converts an HTTP connection to a WebSocket connection.
 *
 * Client sends:
 *   GET /ws HTTP/1.1
 *   Upgrade: websocket
 *   Connection: Upgrade
 *   Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
 *   Sec-WebSocket-Version: 13
 *
 * Server responds:
 *   HTTP/1.1 101 Switching Protocols
 *   Upgrade: websocket
 *   Connection: Upgrade
 *   Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
 */
import { IncomingMessage } from 'http';
/**
 * Validate that an HTTP request is a valid WebSocket upgrade request.
 */
export declare function isWebSocketUpgrade(req: IncomingMessage): boolean;
/**
 * Complete the WebSocket handshake.
 * Returns the raw socket for WebSocket communication.
 */
export declare function performHandshake(req: IncomingMessage, socket: any): boolean;
/**
 * Reject a WebSocket upgrade with an HTTP error response.
 */
export declare function rejectUpgrade(socket: any, code: number, message: string): void;
//# sourceMappingURL=handshake.d.ts.map