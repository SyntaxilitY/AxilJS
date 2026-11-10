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

// ─── Opcodes ──────────────────────────────────────────────────────────────────

export const OPCODES = {
  CONTINUATION: 0x0,
  TEXT:         0x1,
  BINARY:       0x2,
  CLOSE:        0x8,
  PING:         0x9,
  PONG:         0xA
} as const;

export type Opcode = typeof OPCODES[keyof typeof OPCODES];

// ─── Parsed Frame ─────────────────────────────────────────────────────────────

export interface WSFrame {
  // Is this the final fragment?
  fin: boolean;

  // Frame type
  opcode: Opcode;

  // Is the payload masked? (client → server must be masked)
  masked: boolean;

  // Masking key (4 bytes, only when masked = true)
  maskKey?: Buffer;

  // The actual payload data (already unmasked)
  payload: Buffer;
}

// ─── Frame Header ─────────────────────────────────────────────────────────────

export interface WSFrameHeader {
  fin: boolean;
  // RSV1-3 bits (must be 0 unless an extension was negotiated)
  rsv: number;
  // Raw opcode (may be a reserved/unknown value)
  opcode: number;
  masked: boolean;
  // Declared payload length (may exceed Number.MAX_SAFE_INTEGER precision for absurd 64-bit values)
  payloadLength: number;
  // Header size in bytes, including the masking key
  headerLength: number;
}

/**
 * Parse only the frame header (without waiting for the payload).
 * Lets callers enforce limits on the declared length before buffering it.
 * Returns null if the buffer doesn't contain a complete header yet.
 */
export function parseFrameHeader(buffer: Buffer): WSFrameHeader | null {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  let payloadLength = secondByte & 0x7F;
  let headerLength = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    headerLength = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = buffer.readUInt32BE(2) * 0x100000000 + buffer.readUInt32BE(6);
    headerLength = 10;
  }

  const masked = (secondByte & 0x80) !== 0;
  if (masked) headerLength += 4;

  return {
    fin: (firstByte & 0x80) !== 0,
    rsv: (firstByte & 0x70) >> 4,
    opcode: firstByte & 0x0F,
    masked,
    payloadLength,
    headerLength
  };
}

/**
 * Is this one of the opcodes defined by RFC 6455?
 */
export function isKnownOpcode(opcode: number): opcode is Opcode {
  return opcode === 0x0 || opcode === 0x1 || opcode === 0x2 ||
    opcode === 0x8 || opcode === 0x9 || opcode === 0xA;
}

/**
 * Is this a control frame opcode (close/ping/pong or reserved 0xB-0xF)?
 */
export function isControlOpcode(opcode: number): boolean {
  return (opcode & 0x08) !== 0;
}

// ─── Frame Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a WebSocket frame from a Buffer.
 * Returns the parsed frame and how many bytes were consumed.
 * Returns null if the buffer doesn't contain a complete frame yet.
 */
export function parseFrame(
  buffer: Buffer
): { frame: WSFrame; bytesConsumed: number } | null {
  // Need at least 2 bytes for the header
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  const fin = (firstByte & 0x80) !== 0;      // Bit 7
  const opcode = (firstByte & 0x0F) as Opcode; // Bits 0-3
  const masked = (secondByte & 0x80) !== 0;   // Bit 15
  let payloadLength = secondByte & 0x7F;       // Bits 8-14

  let headerLength = 2;

  // Extended payload length
  if (payloadLength === 126) {
    // Next 2 bytes are the actual payload length
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    headerLength = 4;
  } else if (payloadLength === 127) {
    // Next 8 bytes are the actual payload length (high 32 bits + low 32 bits)
    if (buffer.length < 10) return null;
    payloadLength = buffer.readUInt32BE(2) * 0x100000000 + buffer.readUInt32BE(6);
    headerLength = 10;
  }

  // Masking key (4 bytes if masked)
  let maskKey: Buffer | undefined;
  if (masked) {
    if (buffer.length < headerLength + 4) return null;
    maskKey = buffer.slice(headerLength, headerLength + 4);
    headerLength += 4;
  }

  // Check we have the full payload
  const totalLength = headerLength + payloadLength;
  if (buffer.length < totalLength) return null;

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
export function buildFrame(
  data: Buffer | string,
  opcode: Opcode = OPCODES.TEXT
): Buffer {
  const payload = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  const payloadLength = payload.length;

  let headerLength = 2;
  let extendedLengthBytes = 0;

  if (payloadLength > 65535) {
    extendedLengthBytes = 8;
    headerLength += 8;
  } else if (payloadLength > 125) {
    extendedLengthBytes = 2;
    headerLength += 2;
  }

  const frame = Buffer.allocUnsafe(headerLength + payloadLength);

  // First byte: FIN + opcode
  frame[0] = 0x80 | opcode; // FIN = 1, no RSV bits

  // Second byte: no mask (server → client), payload length
  if (extendedLengthBytes === 0) {
    frame[1] = payloadLength;
  } else if (extendedLengthBytes === 2) {
    frame[1] = 126;
    frame.writeUInt16BE(payloadLength, 2);
  } else {
    frame[1] = 127;
    frame.writeUInt32BE(Math.floor(payloadLength / 0x100000000), 2); // High 32 bits
    frame.writeUInt32BE(payloadLength >>> 0, 6);                      // Low 32 bits
  }

  // Copy payload
  payload.copy(frame, headerLength);

  return frame;
}

/**
 * Build a close frame with optional close code and reason.
 */
export function buildCloseFrame(code: number = 1000, reason: string = ''): Buffer {
  const reasonBuffer = Buffer.from(reason, 'utf-8');
  const payload = Buffer.allocUnsafe(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  return buildFrame(payload, OPCODES.CLOSE);
}

/**
 * Build a ping frame.
 */
export function buildPingFrame(data: Buffer = Buffer.alloc(0)): Buffer {
  return buildFrame(data, OPCODES.PING);
}

/**
 * Build a pong frame.
 */
export function buildPongFrame(data: Buffer = Buffer.alloc(0)): Buffer {
  return buildFrame(data, OPCODES.PONG);
}