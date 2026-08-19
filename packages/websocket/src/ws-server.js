"use strict";
/**
 * WebSocket Server.
 * Integrates with Node.js HTTP server to handle WebSocket upgrades.
 * Supports rooms for organized broadcasting.
 *
 * Usage:
 *   const app = new Application()
 *   const wss = new WSServer(app)
 *
 *   wss.on('connection', (client) => {
 *     console.log('Client connected:', client.id)
 *
 *     client.on('message', (data) => {
 *       // Echo back
 *       client.send(`Echo: ${data}`)
 *
 *       // Broadcast to all
 *       wss.broadcast(`${client.id}: ${data}`)
 *
 *       // Join a room
 *       wss.join(client, 'chat-room')
 *       wss.toRoom('chat-room', `New message: ${data}`)
 *     })
 *
 *     client.on('close', () => {
 *       console.log('Client disconnected:', client.id)
 *     })
 *   })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSServer = void 0;
const handshake_1 = require("./handshake");
const ws_client_1 = require("./ws-client");
// ─── WebSocket Server ────────────────────────────────────────────────────────
class WSServer {
    httpServer;
    // All connected clients
    clients = new Map();
    // Rooms: room name → Set of client IDs
    rooms = new Map();
    // Connection handlers
    connectionHandlers = [];
    // Server options
    options;
    constructor(httpServer, options = {}) {
        this.httpServer = httpServer;
        this.options = {
            path: options.path || '/ws',
            maxClients: options.maxClients || Infinity,
            guard: options.guard || (() => true)
        };
        // Listen for HTTP upgrade requests
        this.httpServer.on('upgrade', this.handleUpgrade.bind(this));
    }
    // ─── Event Registration ───────────────────────────────────────────────────────
    /**
     * Register a handler for new WebSocket connections.
     */
    on(event, handler) {
        if (event === 'connection') {
            this.connectionHandlers.push(handler);
        }
        return this;
    }
    // ─── Client Management ────────────────────────────────────────────────────────
    /**
     * Get all connected clients.
     */
    getClients() {
        return Array.from(this.clients.values());
    }
    /**
     * Get a specific client by ID.
     */
    getClient(id) {
        return this.clients.get(id);
    }
    /**
     * Get client count.
     */
    get clientCount() {
        return this.clients.size;
    }
    // ─── Broadcasting ─────────────────────────────────────────────────────────────
    /**
     * Send a message to all connected clients.
     */
    broadcast(data, exclude) {
        const excludeSet = new Set(exclude || []);
        for (const client of this.clients.values()) {
            if (!excludeSet.has(client.id) && client.isOpen) {
                client.send(data);
            }
        }
    }
    /**
     * Send JSON to all connected clients.
     */
    broadcastJSON(data, exclude) {
        this.broadcast(JSON.stringify(data), exclude);
    }
    // ─── Rooms ───────────────────────────────────────────────────────────────────
    /**
     * Add a client to a room.
     */
    join(client, room) {
        if (!this.rooms.has(room)) {
            this.rooms.set(room, new Set());
        }
        this.rooms.get(room).add(client.id);
        client.rooms.add(room);
    }
    /**
     * Remove a client from a room.
     */
    leave(client, room) {
        this.rooms.get(room)?.delete(client.id);
        client.rooms.delete(room);
        // Clean up empty rooms
        if (this.rooms.get(room)?.size === 0) {
            this.rooms.delete(room);
        }
    }
    /**
     * Send a message to all clients in a room.
     */
    toRoom(room, data, exclude) {
        const clientIds = this.rooms.get(room);
        if (!clientIds)
            return;
        const excludeSet = new Set(exclude || []);
        for (const clientId of clientIds) {
            if (excludeSet.has(clientId))
                continue;
            const client = this.clients.get(clientId);
            if (client?.isOpen) {
                client.send(data);
            }
        }
    }
    /**
     * Send JSON to all clients in a room.
     */
    toRoomJSON(room, data, exclude) {
        this.toRoom(room, JSON.stringify(data), exclude);
    }
    /**
     * Get all clients in a room.
     */
    getRoomClients(room) {
        const clientIds = this.rooms.get(room) || new Set();
        return Array.from(clientIds)
            .map(id => this.clients.get(id))
            .filter((c) => c !== undefined);
    }
    /**
     * Get all room names.
     */
    getRooms() {
        return Array.from(this.rooms.keys());
    }
    // ─── Upgrade Handler ──────────────────────────────────────────────────────────
    async handleUpgrade(req, socket, _head) {
        // Only handle WebSocket upgrades
        if (!(0, handshake_1.isWebSocketUpgrade)(req)) {
            socket.destroy();
            return;
        }
        // Only handle our configured path
        const url = req.url || '/';
        const path = url.split('?')[0];
        if (path !== this.options.path) {
            // Not our path - let other handlers deal with it
            return;
        }
        // Check client limit
        if (this.clients.size >= this.options.maxClients) {
            (0, handshake_1.rejectUpgrade)(socket, 503, 'Server at capacity');
            return;
        }
        // Run guard function
        try {
            const allowed = await this.options.guard(req);
            if (!allowed) {
                (0, handshake_1.rejectUpgrade)(socket, 403, 'Forbidden');
                return;
            }
        }
        catch {
            (0, handshake_1.rejectUpgrade)(socket, 500, 'Internal Server Error');
            return;
        }
        // Complete the WebSocket handshake
        const success = (0, handshake_1.performHandshake)(req, socket);
        if (!success)
            return;
        // Create client wrapper
        const client = new ws_client_1.WSClient(socket, req);
        // Register client
        this.clients.set(client.id, client);
        // Remove from all data structures on disconnect
        client.on('close', () => {
            this.clients.delete(client.id);
            // Remove from all rooms
            for (const room of client.rooms) {
                this.rooms.get(room)?.delete(client.id);
                if (this.rooms.get(room)?.size === 0) {
                    this.rooms.delete(room);
                }
            }
        });
        // Notify connection handlers
        for (const handler of this.connectionHandlers) {
            try {
                handler(client, req);
            }
            catch (error) {
                console.error('[WSServer] Connection handler error:', error);
            }
        }
    }
}
exports.WSServer = WSServer;
//# sourceMappingURL=ws-server.js.map