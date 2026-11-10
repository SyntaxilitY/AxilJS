"use strict";
/**
 * WebSocket Client connection wrapper.
 * Represents a single connected WebSocket client.
 * Handles frame parsing, message sending, and rooms.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSClient = exports.DEFAULT_MAX_PAYLOAD = void 0;
const crypto_1 = require("crypto");
const buffer_1 = require("buffer");
const frame_1 = require("./frame");
exports.DEFAULT_MAX_PAYLOAD = 16 * 1024 * 1024;
const DEFAULT_CLOSE_TIMEOUT_MS = 5000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;
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
    // Fragmented message reassembly (RFC 6455 §5.4)
    fragments = [];
    fragmentBytes = 0;
    fragmentOpcode = null;
    // Ensures 'close' is emitted exactly once
    closeEmitted = false;
    // Set after a protocol violation: all further input is ignored
    failed = false;
    // Event listeners
    listeners = new Map();
    // Ping interval for keeping connection alive
    pingInterval;
    // True while a heartbeat ping is outstanding (no pong yet)
    awaitingPong = false;
    // Close handshake timer (destroys the socket if the peer never answers)
    closeTimer;
    maxPayload;
    closeTimeoutMs;
    heartbeatIntervalMs;
    constructor(socket, request, // The original HTTP upgrade request
    options = {}) {
        this.socket = socket;
        this.request = request;
        this.id = (0, crypto_1.randomUUID)();
        this.connectedAt = new Date();
        this.maxPayload = options.maxPayload ?? exports.DEFAULT_MAX_PAYLOAD;
        this.closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
        this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
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
     * Sends a close frame and waits up to `closeTimeoutMs` for the peer's
     * close frame before destroying the socket.
     */
    close(code = 1000, reason = '') {
        if (!this._open)
            return;
        this._open = false;
        this.stopHeartbeat();
        this.socket.write((0, frame_1.buildCloseFrame)(code, reason));
        this.startCloseTimer();
    }
    /**
     * Destroy the connection immediately without a close handshake.
     */
    terminate() {
        this.clearCloseTimer();
        this.cleanup();
        this.socket.destroy();
        this.emitClose(1006, 'Connection terminated');
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
            if (this.failed)
                return;
            // Append to buffer
            this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
            // Parse all complete frames from buffer
            while (this.buffer.length > 0 && !this.failed) {
                // Validate the header before buffering a (possibly huge) payload
                const header = (0, frame_1.parseFrameHeader)(this.buffer);
                if (!header)
                    break; // Incomplete header - wait for more data
                if (!this.validateHeader(header))
                    return;
                const result = (0, frame_1.parseFrame)(this.buffer);
                if (!result)
                    break; // Incomplete frame - wait for more data
                const { frame, bytesConsumed } = result;
                this.buffer = this.buffer.subarray(bytesConsumed);
                this.handleFrame(frame);
            }
        });
        // The HTTP server's sockets allow half-open connections; when the peer
        // ends its side, end ours too so 'close' fires and resources are freed.
        this.socket.on('end', () => {
            this.socket.end();
        });
        this.socket.on('close', () => {
            this.clearCloseTimer();
            this.cleanup();
            this.emitClose(1006, 'Connection lost');
        });
        this.socket.on('error', (error) => {
            this.emit('error', error);
            this.cleanup();
        });
    }
    /**
     * Enforce RFC 6455 framing rules and maxPayload on a frame header.
     * Returns false (after failing the connection) on violation.
     */
    validateHeader(header) {
        // No extensions are negotiated, so RSV bits must be 0 (§5.2)
        if (header.rsv !== 0)
            return this.fail(1002, 'RSV bits must be 0');
        // Unknown / reserved opcodes (§5.2)
        if (!(0, frame_1.isKnownOpcode)(header.opcode))
            return this.fail(1002, 'Unknown opcode');
        // Client → server frames must be masked (§5.1)
        if (!header.masked)
            return this.fail(1002, 'Client frames must be masked');
        if ((0, frame_1.isControlOpcode)(header.opcode)) {
            // Control frames: payload ≤ 125 bytes and not fragmented (§5.5)
            if (header.payloadLength > 125)
                return this.fail(1002, 'Control frame too large');
            if (!header.fin)
                return this.fail(1002, 'Control frame must not be fragmented');
            return true;
        }
        // Size limits apply to the frame and to the reassembled message
        const pending = header.opcode === frame_1.OPCODES.CONTINUATION ? this.fragmentBytes : 0;
        if (header.payloadLength > this.maxPayload || pending + header.payloadLength > this.maxPayload) {
            return this.fail(1009, 'Message too big');
        }
        return true;
    }
    handleFrame(frame) {
        switch (frame.opcode) {
            case frame_1.OPCODES.TEXT:
            case frame_1.OPCODES.BINARY:
                if (this.fragmentOpcode !== null) {
                    // A new data frame may not interleave a fragmented message (§5.4)
                    this.fail(1002, 'Expected continuation frame');
                    return;
                }
                if (!frame.fin) {
                    // First fragment of a fragmented message - buffer until FIN
                    this.fragmentOpcode = frame.opcode;
                    this.fragments = [frame.payload];
                    this.fragmentBytes = frame.payload.length;
                    break;
                }
                this.emitMessage(frame.opcode, frame.payload);
                break;
            case frame_1.OPCODES.CONTINUATION:
                if (this.fragmentOpcode === null) {
                    this.fail(1002, 'Unexpected continuation frame');
                    return;
                }
                this.fragments.push(frame.payload);
                this.fragmentBytes += frame.payload.length;
                if (frame.fin) {
                    const opcode = this.fragmentOpcode;
                    const payload = Buffer.concat(this.fragments);
                    this.fragmentOpcode = null;
                    this.fragments = [];
                    this.fragmentBytes = 0;
                    this.emitMessage(opcode, payload);
                }
                break;
            case frame_1.OPCODES.CLOSE: {
                const payload = frame.payload;
                if (payload.length === 1) {
                    this.fail(1002, 'Invalid close frame');
                    return;
                }
                // Client initiated close
                const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
                if (payload.length >= 2 && !isValidCloseCode(code)) {
                    this.fail(1002, 'Invalid close code');
                    return;
                }
                const reasonBuf = payload.length > 2 ? payload.subarray(2) : Buffer.alloc(0);
                if (!(0, buffer_1.isUtf8)(reasonBuf)) {
                    this.fail(1007, 'Invalid UTF-8 in close reason');
                    return;
                }
                const reason = reasonBuf.toString('utf-8');
                if (this._open) {
                    // Peer initiated: echo the close frame back, then close TCP
                    this._open = false;
                    this.socket.write((0, frame_1.buildCloseFrame)(code, reason));
                    this.socket.end();
                    this.startCloseTimer();
                }
                else {
                    // We initiated: handshake complete, the server closes TCP first
                    this.clearCloseTimer();
                    this.socket.end();
                    this.startCloseTimer();
                }
                this.cleanup();
                this.emitClose(code, reason);
                break;
            }
            case frame_1.OPCODES.PING:
                // Auto-respond to pings with pong
                if (this._open)
                    this.socket.write((0, frame_1.buildPongFrame)(frame.payload));
                this.emit('ping', frame.payload);
                break;
            case frame_1.OPCODES.PONG:
                this.awaitingPong = false;
                this.emit('pong', frame.payload);
                break;
        }
    }
    emitMessage(opcode, payload) {
        if (opcode === frame_1.OPCODES.TEXT) {
            if (!(0, buffer_1.isUtf8)(payload)) {
                this.fail(1007, 'Invalid UTF-8 in text message');
                return;
            }
            this.emit('message', payload.toString('utf-8'), false);
        }
        else {
            this.emit('message', payload, true);
        }
    }
    emitClose(code, reason) {
        if (this.closeEmitted)
            return;
        this.closeEmitted = true;
        this.emit('close', code, reason);
    }
    /**
     * Fail the WebSocket connection (RFC 6455 §7.1.7): drop buffered data,
     * send a close frame with `code`, ignore further input and close TCP.
     * Always returns false for convenience.
     */
    fail(code, reason) {
        this.failed = true;
        this.buffer = Buffer.alloc(0);
        this.fragments = [];
        this.fragmentBytes = 0;
        this.fragmentOpcode = null;
        if (this._open) {
            this._open = false;
            this.socket.write((0, frame_1.buildCloseFrame)(code, reason));
        }
        this.socket.end();
        this.cleanup();
        this.startCloseTimer();
        this.emitClose(code, reason);
        return false;
    }
    startPingPong() {
        if (!this.heartbeatIntervalMs || this.heartbeatIntervalMs <= 0)
            return;
        // Ping every interval; terminate clients that didn't pong the previous ping
        this.pingInterval = setInterval(() => {
            if (!this._open) {
                this.stopHeartbeat();
                return;
            }
            if (this.awaitingPong) {
                this.terminate();
                return;
            }
            this.awaitingPong = true;
            this.ping();
        }, this.heartbeatIntervalMs);
        this.pingInterval.unref?.();
    }
    stopHeartbeat() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = undefined;
        }
    }
    startCloseTimer() {
        if (this.closeTimer)
            return;
        this.closeTimer = setTimeout(() => {
            this.closeTimer = undefined;
            this.socket.destroy();
            this.emitClose(1006, 'Close handshake timed out');
        }, this.closeTimeoutMs);
        this.closeTimer.unref?.();
    }
    clearCloseTimer() {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = undefined;
        }
    }
    cleanup() {
        this._open = false;
        this.stopHeartbeat();
    }
}
exports.WSClient = WSClient;
/**
 * Close codes a peer may legitimately send (RFC 6455 §7.4).
 */
function isValidCloseCode(code) {
    if (code >= 3000 && code <= 4999)
        return true;
    return code >= 1000 && code <= 1014 &&
        code !== 1004 && code !== 1005 && code !== 1006;
}
//# sourceMappingURL=ws-client.js.map