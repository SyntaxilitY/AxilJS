/**
 * WebSocket Client connection wrapper.
 * Represents a single connected WebSocket client.
 * Handles frame parsing, message sending, and rooms.
 */
import { Socket } from 'net';
export interface WSClientEvents {
    message: (data: string | Buffer, isBinary: boolean) => void;
    close: (code: number, reason: string) => void;
    error: (error: Error) => void;
    ping: (data: Buffer) => void;
    pong: (data: Buffer) => void;
}
export interface WSClientOptions {
    maxPayload?: number;
    closeTimeoutMs?: number;
    heartbeatIntervalMs?: number;
}
export declare const DEFAULT_MAX_PAYLOAD: number;
export declare class WSClient {
    private socket;
    readonly request: any;
    readonly id: string;
    readonly connectedAt: Date;
    readonly rooms: Set<string>;
    data: Record<string, unknown>;
    private _open;
    private buffer;
    private fragments;
    private fragmentBytes;
    private fragmentOpcode;
    private closeEmitted;
    private failed;
    private listeners;
    private pingInterval?;
    private awaitingPong;
    private closeTimer?;
    private readonly maxPayload;
    private readonly closeTimeoutMs;
    private readonly heartbeatIntervalMs;
    constructor(socket: Socket, request: any, // The original HTTP upgrade request
    options?: WSClientOptions);
    get isOpen(): boolean;
    get remoteAddress(): string;
    /**
     * Send a text message to this client.
     */
    send(data: string): void;
    /**
     * Send a JSON-serializable object as a text message.
     */
    sendJSON(data: unknown): void;
    /**
     * Send binary data to this client.
     */
    sendBinary(data: Buffer): void;
    /**
     * Send a ping to check if client is alive.
     */
    ping(data?: Buffer): void;
    /**
     * Close the connection gracefully.
     * Sends a close frame and waits up to `closeTimeoutMs` for the peer's
     * close frame before destroying the socket.
     */
    close(code?: number, reason?: string): void;
    /**
     * Destroy the connection immediately without a close handshake.
     */
    terminate(): void;
    on<K extends keyof WSClientEvents>(event: K, listener: WSClientEvents[K]): this;
    off<K extends keyof WSClientEvents>(event: K, listener: Function): this;
    private emit;
    private startReading;
    /**
     * Enforce RFC 6455 framing rules and maxPayload on a frame header.
     * Returns false (after failing the connection) on violation.
     */
    private validateHeader;
    private handleFrame;
    private emitMessage;
    private emitClose;
    /**
     * Fail the WebSocket connection (RFC 6455 §7.1.7): drop buffered data,
     * send a close frame with `code`, ignore further input and close TCP.
     * Always returns false for convenience.
     */
    private fail;
    private startPingPong;
    private stopHeartbeat;
    private startCloseTimer;
    private clearCloseTimer;
    private cleanup;
}
//# sourceMappingURL=ws-client.d.ts.map