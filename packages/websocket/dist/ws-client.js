"use strict";
/**
 * WebSocket Client connection wrapper.
 * Represents a single connected WebSocket client.
 * Handles frame parsing, message sending, and rooms.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSClient = void 0;
const crypto_1 = require("crypto");
const frame_1 = require("./frame");
// ─── WS Client ────────────────────────────────────────────────────────────────
class WSClient {
    socket;
    request;
    // Unique ID for this connection
    id;
    // When this client connected
    connectedAt;
    // Rooms this client has joined
    rooms = new Set();
    // Arbitrary data attached by application code (like req.locals)
    data = {};
    // Is the connection still open?
    _open = true;
    // Buffer for incomplete frames
    buffer = Buffer.alloc(0);
    // Event listeners
    listeners = new Map();
    // Ping interval for keeping connection alive
    pingInterval;
    constructor(socket, request // The original HTTP upgrade request
    ) {
        this.socket = socket;
        this.request = request;
        this.id = (0, crypto_1.randomUUID)();
        this.connectedAt = new Date();
        // Start reading data from the socket
        this.startReading();
        // Start ping/pong keepalive
        this.startPingPong();
    }
    // ─── Properties ──────────────────────────────────────────────────────────────
    get isOpen() {
        return this._open;
    }
    get remoteAddress() {
        return this.socket.remoteAddress || '0.0.0.0';
    }
    // ─── Send ─────────────────────────────────────────────────────────────────────
    /**
     * Send a text message to this client.
     */
    send(data) {
        if (!this._open)
            return;
        this.socket.write((0, frame_1.buildFrame)(data, frame_1.OPCODES.TEXT));
    }
    /**
     * Send a JSON-serializable object as a text message.
     */
    sendJSON(data) {
        this.send(JSON.stringify(data));
    }
    /**
     * Send binary data to this client.
     */
    sendBinary(data) {
        if (!this._open)
            return;
        this.socket.write((0, frame_1.buildFrame)(data, frame_1.OPCODES.BINARY));
    }
    /**
     * Send a ping to check if client is alive.
     */
    ping(data) {
        if (!this._open)
            return;
        this.socket.write((0, frame_1.buildPingFrame)(data));
    }
    /**
     * Close the connection gracefully.
     */
    close(code = 1000, reason = '') {
        if (!this._open)
            return;
        this._open = false;
        this.socket.write((0, frame_1.buildCloseFrame)(code, reason));
        // Give client time to receive the close frame
        setTimeout(() => {
            this.socket.destroy();
        }, 1000);
    }
    // ─── Event Emitter ────────────────────────────────────────────────────────────
    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(listener);
        return this;
    }
    off(event, listener) {
        const list = this.listeners.get(event) || [];
        const index = list.indexOf(listener);
        if (index !== -1)
            list.splice(index, 1);
        return this;
    }
    emit(event, ...args) {
        const list = this.listeners.get(event) || [];
        list.forEach(fn => {
            try {
                fn(...args);
            }
            catch (err) {
                console.error(`[WSClient] Error in '${event}' listener:`, err);
            }
        });
    }
    // ─── Frame Reading ────────────────────────────────────────────────────────────
    startReading() {
        this.socket.on('data', (chunk) => {
            // Append to buffer
            this.buffer = Buffer.concat([this.buffer, chunk]);
            // Parse all complete frames from buffer
            while (this.buffer.length > 0) {
                const result = (0, frame_1.parseFrame)(this.buffer);
                if (!result)
                    break; // Incomplete frame - wait for more data
                const { frame, bytesConsumed } = result;
                this.buffer = this.buffer.slice(bytesConsumed);
                this.handleFrame(frame);
            }
        });
        this.socket.on('close', () => {
            this.cleanup();
            this.emit('close', 1006, 'Connection lost');
        });
        this.socket.on('error', (error) => {
            this.emit('error', error);
            this.cleanup();
        });
    }
    handleFrame(frame) {
        switch (frame.opcode) {
            case frame_1.OPCODES.TEXT:
                // Text message
                this.emit('message', frame.payload.toString('utf-8'), false);
                break;
            case frame_1.OPCODES.BINARY:
                // Binary message
                this.emit('message', frame.payload, true);
                break;
            case frame_1.OPCODES.CLOSE: {
                // Client initiated close
                const code = frame.payload.length >= 2
                    ? frame.payload.readUInt16BE(0)
                    : 1000;
                const reason = frame.payload.length > 2
                    ? frame.payload.slice(2).toString('utf-8')
                    : '';
                // Echo the close frame back
                this.socket.write((0, frame_1.buildCloseFrame)(code, reason));
                this.cleanup();
                this.emit('close', code, reason);
                break;
            }
            case frame_1.OPCODES.PING:
                // Auto-respond to pings with pong
                this.socket.write((0, frame_1.buildPongFrame)(frame.payload));
                this.emit('ping', frame.payload);
                break;
            case frame_1.OPCODES.PONG:
                this.emit('pong', frame.payload);
                break;
        }
    }
    startPingPong() {
        // Send ping every 30 seconds to keep connection alive
        this.pingInterval = setInterval(() => {
            if (!this._open) {
                clearInterval(this.pingInterval);
                return;
            }
            this.ping();
        }, 30000);
    }
    cleanup() {
        this._open = false;
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
    }
}
exports.WSClient = WSClient;
//# sourceMappingURL=ws-client.js.map