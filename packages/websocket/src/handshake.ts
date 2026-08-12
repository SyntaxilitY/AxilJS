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

import { createHash } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';

// Magic GUID defined by RFC 6455
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Validate that an HTTP request is a valid WebSocket upgrade request.
 */
export function isWebSocketUpgrade(req: IncomingMessage): boolean {
  return (
    req.headers['upgrade']?.toLowerCase() === 'websocket' &&
    req.headers['connection']?.toLowerCase().includes('upgrade') === true &&
    req.headers['sec-websocket-key'] !== undefined &&
    req.headers['sec-websocket-version'] === '13'
  );
}

/**
 * Complete the WebSocket handshake.
 * Returns the raw socket for WebSocket communication.
 */
export function performHandshake(
  req: IncomingMessage,
  socket: any
): boolean {
  const key = req.headers['sec-websocket-key'] as string;

  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return false;
  }

  // Calculate the accept key: SHA1(key + magic) encoded as base64
  const acceptKey = createHash('sha1')
    .update(key + WS_MAGIC)
    .digest('base64');

  // Send the upgrade response
  const response = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n'
  ].join('\r\n');

  socket.write(response);
  return true;
}

/**
 * Reject a WebSocket upgrade with an HTTP error response.
 */
export function rejectUpgrade(socket: any, code: number, message: string): void {
  socket.write(
    `HTTP/1.1 ${code} ${message}\r\n` +
      'Content-Type: text/plain\r\n' +
      `Content-Length: ${message.length}\r\n` +
      '\r\n' +
      message
  );
  socket.destroy();
}