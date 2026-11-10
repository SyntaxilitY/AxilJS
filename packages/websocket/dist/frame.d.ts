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
export declare const OPCODES: {
    readonly CONTINUATION: 0;
    readonly TEXT: 1;
    readonly BINARY: 2;
    readonly CLOSE: 8;
    readonly PING: 9;
    readonly PONG: 10;
};
export type Opcode = typeof OPCODES[keyof typeof OPCODES];
export interface WSFrame {
    fin: boolean;
    opcode: Opcode;
    masked: boolean;
    maskKey?: Buffer;
    payload: Buffer;
}
export interface WSFrameHeader {
    fin: boolean;
    rsv: number;
    opcode: number;
    masked: boolean;
    payloadLength: number;
    headerLength: number;
}
/**
 * Parse only the frame header (without waiting for the payload).
 * Lets callers enforce limits on the declared length before buffering it.
 * Returns null if the buffer doesn't contain a complete header yet.
 */
export declare function parseFrameHeader(buffer: Buffer): WSFrameHeader | null;
/**
 * Is this one of the opcodes defined by RFC 6455?
 */
export declare function isKnownOpcode(opcode: number): opcode is Opcode;
/**
 * Is this a control frame opcode (close/ping/pong or reserved 0xB-0xF)?
 */
export declare function isControlOpcode(opcode: number): boolean;
/**
 * Parse a WebSocket frame from a Buffer.
 * Returns the parsed frame and how many bytes were consumed.
 * Returns null if the buffer doesn't contain a complete frame yet.
 */
export declare function parseFrame(buffer: Buffer): {
    frame: WSFrame;
    bytesConsumed: number;
} | null;
/**
 * Serialize data into a WebSocket frame Buffer.
 * Server → client frames are NOT masked (RFC 6455 requirement).
 *
 * @param data     The payload to send
 * @param opcode   Frame type (default: TEXT)
 */
export declare function buildFrame(data: Buffer | string, opcode?: Opcode): Buffer;
/**
 * Build a close frame with optional close code and reason.
 */
export declare function buildCloseFrame(code?: number, reason?: string): Buffer;
/**
 * Build a ping frame.
 */
export declare function buildPingFrame(data?: Buffer): Buffer;
/**
 * Build a pong frame.
 */
export declare function buildPongFrame(data?: Buffer): Buffer;
//# sourceMappingURL=frame.d.ts.map