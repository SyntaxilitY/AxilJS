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

import { Server, IncomingMessage } from 'http';
import { Socket } from 'net';
import { isWebSocketUpgrade, performHandshake, rejectUpgrade } from './handshake';
import { WSClient } from './ws-client';

// ─── Connection Handler ───────────────────────────────────────────────────────

type ConnectionHandler = (client: WSClient, request: IncomingMessage) => void;

// Guard function - decides whether to accept a connection
type ConnectionGuard = (
  request: IncomingMessage
) => boolean | Promise<boolean>;

// ─── WS Server Options ────────────────────────────────────────────────────────

export interface WSServerOptions {
  // URL path to accept WebSocket connections on (default: '/ws')
  path?: string;

  // Max clients (default: unlimited)
  maxClients?: number;

  // Guard function - return false to reject connection
  guard?: ConnectionGuard;
}

// ─── WebSocket Server ────────────────────────────────────────────────────────

export class WSServer {
  // All connected clients
  private clients = new Map<string, WSClient>();

  // Rooms: room name → Set of client IDs
  private rooms = new Map<string, Set<string>>();

  // Connection handlers
  private connectionHandlers: ConnectionHandler[] = [];

  // Server options
  private options: Required<WSServerOptions>;

  constructor(
    private httpServer: Server,
    options: WSServerOptions = {}
  ) {
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
  on(event: 'connection', handler: ConnectionHandler): this {
    if (event === 'connection') {
      this.connectionHandlers.push(handler);
    }
    return this;
  }

  // ─── Client Management ────────────────────────────────────────────────────────

  /**
   * Get all connected clients.
   */
  getClients(): WSClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get a specific client by ID.
   */
  getClient(id: string): WSClient | undefined {
    return this.clients.get(id);
  }

  /**
   * Get client count.
   */
  get clientCount(): number {
    return this.clients.size;
  }

  // ─── Broadcasting ─────────────────────────────────────────────────────────────

  /**
   * Send a message to all connected clients.
   */
  broadcast(data: string, exclude?: string[]): void {
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
  broadcastJSON(data: unknown, exclude?: string[]): void {
    this.broadcast(JSON.stringify(data), exclude);
  }

  // ─── Rooms ───────────────────────────────────────────────────────────────────

  /**
   * Add a client to a room.
   */
  join(client: WSClient, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(client.id);
    client.rooms.add(room);
  }

  /**
   * Remove a client from a room.
   */
  leave(client: WSClient, room: string): void {
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
  toRoom(room: string, data: string, exclude?: string[]): void {
    const clientIds = this.rooms.get(room);
    if (!clientIds) return;

    const excludeSet = new Set(exclude || []);

    for (const clientId of clientIds) {
      if (excludeSet.has(clientId)) continue;

      const client = this.clients.get(clientId);
      if (client?.isOpen) {
        client.send(data);
      }
    }
  }

  /**
   * Send JSON to all clients in a room.
   */
  toRoomJSON(room: string, data: unknown, exclude?: string[]): void {
    this.toRoom(room, JSON.stringify(data), exclude);
  }

  /**
   * Get all clients in a room.
   */
  getRoomClients(room: string): WSClient[] {
    const clientIds = this.rooms.get(room) || new Set();
    return Array.from(clientIds)
      .map(id => this.clients.get(id))
      .filter((c): c is WSClient => c !== undefined);
  }

  /**
   * Get all room names.
   */
  getRooms(): string[] {
    return Array.from(this.rooms.keys());
  }

  // ─── Upgrade Handler ──────────────────────────────────────────────────────────

  private async handleUpgrade(
    req: IncomingMessage,
    socket: Socket,
    _head: Buffer
  ): Promise<void> {
    // Only handle WebSocket upgrades
    if (!isWebSocketUpgrade(req)) {
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
      rejectUpgrade(socket, 503, 'Server at capacity');
      return;
    }

    // Run guard function
    try {
      const allowed = await this.options.guard(req);
      if (!allowed) {
        rejectUpgrade(socket, 403, 'Forbidden');
        return;
      }
    } catch {
      rejectUpgrade(socket, 500, 'Internal Server Error');
      return;
    }

    // Complete the WebSocket handshake
    const success = performHandshake(req, socket);
    if (!success) return;

    // Create client wrapper
    const client = new WSClient(socket as any, req);

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
      } catch (error) {
        console.error('[WSServer] Connection handler error:', error);
      }
    }
  }
}