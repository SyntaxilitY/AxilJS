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
export declare class WSClient {
    private socket;
    readonly request: any;
    readonly id: string;
    readonly connectedAt: Date;
    readonly rooms: Set<string>;
    data: Record<string, unknown>;
    private _open;
    private buffer;
    private listeners;
    private pingInterval?;
    constructor(socket: Socket, request: any);
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
     */
    close(code?: number, reason?: string): void;
    on<K extends keyof WSClientEvents>(event: K, listener: WSClientEvents[K]): this;
    off<K extends keyof WSClientEvents>(event: K, listener: Function): this;
    private emit;
    private startReading;
    private handleFrame;
    private startPingPong;
    private cleanup;
}
//# sourceMappingURL=ws-client.d.ts.map