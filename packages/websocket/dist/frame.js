"use strict";
/**
 * WebSocket Frame Parser & Serializer.
 * Implements RFC 6455 WebSocket frame format.
 * Pure Node.js - no external dependencies.
 *
 * WebSocket frame structure:
 *
 *  0                   1                   2                   3
 *  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-------+-+-------------+-------------------------------+
 * |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
 * |I|S|S|S|  (4)  |A|     (7)    |             (16/64)           |
 * |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 * | |1|2|3|       |K|             |                               |
 * +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - -+
 * |     Extended payload length continued, if payload len == 127  |
 * + - - - - - - - - - - - - - - -+-------------------------------+
 * |                               |Masking-key, if MASK set to 1  |
 * +-------------------------------+-------------------------------+
 * | Masking-key (continued)       |          Payload Data         |
 * +-------------------------------- - - - - - - - - - - - - - - -+
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPCODES = void 0;
exports.parseFrame = parseFrame;
exports.buildFrame = buildFrame;
exports.buildCloseFrame = buildCloseFrame;
exports.buildPingFrame = buildPingFrame;
exports.buildPongFrame = buildPongFrame;
// ─── Opcodes ──────────────────────────────────────────────────────────────────
exports.OPCODES = {
    CONTINUATION: 0x0,
    TEXT: 0x1,
    BINARY: 0x2,
    CLOSE: 0x8,
    PING: 0x9,
    PONG: 0xA
};
// ─── Frame Parser ─────────────────────────────────────────────────────────────
/**
 * Parse a WebSocket frame from a Buffer.
 * Returns the parsed frame and how many bytes were consumed.
 * Returns null if the buffer doesn't contain a complete frame yet.
 */
function parseFrame(buffer) {
    // Need at least 2 bytes for the header
    if (buffer.length < 2)
        return null;
    const firstByte = buffer[0];
    const secondByte = buffer[1];
    const fin = (firstByte & 0x80) !== 0; // Bit 7
    const opcode = (firstByte & 0x0F); // Bits 0-3
    const masked = (secondByte & 0x80) !== 0; // Bit 15
    let payloadLength = secondByte & 0x7F; // Bits 8-14
    let headerLength = 2;
    // Extended payload length
    if (payloadLength === 126) {
        // Next 2 bytes are the actual payload length
        if (buffer.length < 4)
            return null;
        payloadLength = buffer.readUInt16BE(2);
        headerLength = 4;
    }
    else if (payloadLength === 127) {
        // Next 8 bytes are the actual payload length (we only support up to 32-bit here)
        if (buffer.length < 10)
            return null;
        payloadLength = buffer.readUInt32BE(6); // Read last 4 bytes of 8-byte length
        headerLength = 10;
    }
    // Masking key (4 bytes if masked)
    let maskKey;
    if (masked) {
        if (buffer.length < headerLength + 4)
            return null;
        maskKey = buffer.slice(headerLength, headerLength + 4);
        headerLength += 4;
    }
    // Check we have the full payload
    const totalLength = headerLength + payloadLength;
    if (buffer.length < totalLength)
        return null;
    // Extract and unmask payload
    let payload = buffer.slice(headerLength, totalLength);
    if (masked && maskKey) {
        // XOR each byte with the corresponding mask key byte
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) {
            payload[i] ^= maskKey[i % 4];
        }
    }
    return {
        frame: { fin, opcode, masked, maskKey, payload },
        bytesConsumed: totalLength
    };
}
// ─── Frame Serializer ─────────────────────────────────────────────────────────
/**
 * Serialize data into a WebSocket frame Buffer.
 * Server → client frames are NOT masked (RFC 6455 requirement).
 *
 * @param data     The payload to send
 * @param opcode   Frame type (default: TEXT)
 */
function buildFrame(data, opcode = exports.OPCODES.TEXT) {
    const payload = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    const payloadLength = payload.length;
    let headerLength = 2;
    let extendedLengthBytes = 0;
    if (payloadLength > 65535) {
        extendedLengthBytes = 8;
        headerLength += 8;
    }
    else if (payloadLength > 125) {
        extendedLengthBytes = 2;
        headerLength += 2;
    }
    const frame = Buffer.allocUnsafe(headerLength + payloadLength);
    // First byte: FIN + opcode
    frame[0] = 0x80 | opcode; // FIN = 1, no RSV bits
    // Second byte: no mask (server → client), payload length
    if (extendedLengthBytes === 0) {
        frame[1] = payloadLength;
    }
    else if (extendedLengthBytes === 2) {
        frame[1] = 126;
        frame.writeUInt16BE(payloadLength, 2);
    }
    else {
        frame[1] = 127;
        frame.writeUInt32BE(0, 2); // High 32 bits (always 0 for us)
        frame.writeUInt32BE(payloadLength, 6); // Low 32 bits
    }
    // Copy payload
    payload.copy(frame, headerLength);
    return frame;
}
/**
 * Build a close frame with optional close code and reason.
 */
function buildCloseFrame(code = 1000, reason = '') {
    const reasonBuffer = Buffer.from(reason, 'utf-8');
    const payload = Buffer.allocUnsafe(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    return buildFrame(payload, exports.OPCODES.CLOSE);
}
/**
 * Build a ping frame.
 */
function buildPingFrame(data = Buffer.alloc(0)) {
    return buildFrame(data, exports.OPCODES.PING);
}
/**
 * Build a pong frame.
 */
function buildPongFrame(data = Buffer.alloc(0)) {
    return buildFrame(data, exports.OPCODES.PONG);
}
//# sourceMappingURL=frame.js.map