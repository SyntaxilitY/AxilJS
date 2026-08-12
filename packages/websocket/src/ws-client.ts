/**
 * WebSocket Client connection wrapper.
 * Represents a single connected WebSocket client.
 * Handles frame parsing, message sending, and rooms.
 */

import { randomUUID } from 'crypto';
import { Socket } from 'net';
import {
  parseFrame,
  buildFrame,
  buildCloseFrame,
  buildPingFrame,
  buildPongFrame,
  OPCODES
} from './frame';

// ─── Event Map ────────────────────────────────────────────────────────────────

export interface WSClientEvents {
  message: (data: string | Buffer, isBinary: boolean) => void;
  close:   (code: number, reason: string) => void;
  error:   (error: Error) => void;
  ping:    (data: Buffer) => void;
  pong:    (data: Buffer) => void;
}

// ─── WS Client ────────────────────────────────────────────────────────────────

export class WSClient {
  // Unique ID for this connection
  readonly id: string;

  // When this client connected
  readonly connectedAt: Date;

  // Rooms this client has joined
  readonly rooms = new Set<string>();

  // Arbitrary data attached by application code (like req.locals)
  data: Record<string, unknown> = {};

  // Is the connection still open?
  private _open: boolean = true;

  // Buffer for incomplete frames
  private buffer: Buffer = Buffer.alloc(0);

  // Event listeners
  private listeners = new Map<string, Function[]>();

  // Ping interval for keeping connection alive
  private pingInterval?: ReturnType<typeof setInterval>;

  constructor(
    private socket: Socket,
    public readonly request: any // The original HTTP upgrade request
  ) {
    this.id = randomUUID();
    this.connectedAt = new Date();

    // Start reading data from the socket
    this.startReading();

    // Start ping/pong keepalive
    this.startPingPong();
  }

  // ─── Properties ──────────────────────────────────────────────────────────────

  get isOpen(): boolean {
    return this._open;
  }

  get remoteAddress(): string {
    return this.socket.remoteAddress || '0.0.0.0';
  }

  // ─── Send ─────────────────────────────────────────────────────────────────────

  /**
   * Send a text message to this client.
   */
  send(data: string): void {
    if (!this._open) return;
    this.socket.write(buildFrame(data, OPCODES.TEXT));
  }

  /**
   * Send a JSON-serializable object as a text message.
   */
  sendJSON(data: unknown): void {
    this.send(JSON.stringify(data));
  }

  /**
   * Send binary data to this client.
   */
  sendBinary(data: Buffer): void {
    if (!this._open) return;
    this.socket.write(buildFrame(data, OPCODES.BINARY));
  }

  /**
   * Send a ping to check if client is alive.
   */
  ping(data?: Buffer): void {
    if (!this._open) return;
    this.socket.write(buildPingFrame(data));
  }

  /**
   * Close the connection gracefully.
   */
  close(code: number = 1000, reason: string = ''): void {
    if (!this._open) return;

    this._open = false;
    this.socket.write(buildCloseFrame(code, reason));

    // Give client time to receive the close frame
    setTimeout(() => {
      this.socket.destroy();
    }, 1000);
  }

  // ─── Event Emitter ────────────────────────────────────────────────────────────

  on<K extends keyof WSClientEvents>(
    event: K,
    listener: WSClientEvents[K]
  ): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }

  off<K extends keyof WSClientEvents>(event: K, listener: Function): this {
    const list = this.listeners.get(event) || [];
    const index = list.indexOf(listener);
    if (index !== -1) list.splice(index, 1);
    return this;
  }

  private emit(event: string, ...args: any[]): void {
    const list = this.listeners.get(event) || [];
    list.forEach(fn => {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[WSClient] Error in '${event}' listener:`, err);
      }
    });
  }

  // ─── Frame Reading ────────────────────────────────────────────────────────────

  private startReading(): void {
    this.socket.on('data', (chunk: Buffer) => {
      // Append to buffer
      this.buffer = Buffer.concat([this.buffer, chunk]);

      // Parse all complete frames from buffer
      while (this.buffer.length > 0) {
        const result = parseFrame(this.buffer);
        if (!result) break; // Incomplete frame - wait for more data

        const { frame, bytesConsumed } = result;
        this.buffer = this.buffer.slice(bytesConsumed);

        this.handleFrame(frame);
      }
    });

    this.socket.on('close', () => {
      this.cleanup();
      this.emit('close', 1006, 'Connection lost');
    });

    this.socket.on('error', (error: Error) => {
      this.emit('error', error);
      this.cleanup();
    });
  }

  private handleFrame(frame: any): void {
    switch (frame.opcode) {
      case OPCODES.TEXT:
        // Text message
        this.emit('message', frame.payload.toString('utf-8'), false);
        break;

      case OPCODES.BINARY:
        // Binary message
        this.emit('message', frame.payload, true);
        break;

      case OPCODES.CLOSE: {
        // Client initiated close
        const code = frame.payload.length >= 2
          ? frame.payload.readUInt16BE(0)
          : 1000;
        const reason = frame.payload.length > 2
          ? frame.payload.slice(2).toString('utf-8')
          : '';

        // Echo the close frame back
        this.socket.write(buildCloseFrame(code, reason));
        this.cleanup();
        this.emit('close', code, reason);
        break;
      }

      case OPCODES.PING:
        // Auto-respond to pings with pong
        this.socket.write(buildPongFrame(frame.payload));
        this.emit('ping', frame.payload);
        break;

      case OPCODES.PONG:
        this.emit('pong', frame.payload);
        break;
    }
  }

  private startPingPong(): void {
    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (!this._open) {
        clearInterval(this.pingInterval);
        return;
      }
      this.ping();
    }, 30000);
  }

  private cleanup(): void {
    this._open = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }
}