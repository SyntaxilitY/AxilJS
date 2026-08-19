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
import { WSClient } from './ws-client';
type ConnectionHandler = (client: WSClient, request: IncomingMessage) => void;
type ConnectionGuard = (request: IncomingMessage) => boolean | Promise<boolean>;
export interface WSServerOptions {
    path?: string;
    maxClients?: number;
    guard?: ConnectionGuard;
}
export declare class WSServer {
    private httpServer;
    private clients;
    private rooms;
    private connectionHandlers;
    private options;
    constructor(httpServer: Server, options?: WSServerOptions);
    /**
     * Register a handler for new WebSocket connections.
     */
    on(event: 'connection', handler: ConnectionHandler): this;
    /**
     * Get all connected clients.
     */
    getClients(): WSClient[];
    /**
     * Get a specific client by ID.
     */
    getClient(id: string): WSClient | undefined;
    /**
     * Get client count.
     */
    get clientCount(): number;
    /**
     * Send a message to all connected clients.
     */
    broadcast(data: string, exclude?: string[]): void;
    /**
     * Send JSON to all connected clients.
     */
    broadcastJSON(data: unknown, exclude?: string[]): void;
    /**
     * Add a client to a room.
     */
    join(client: WSClient, room: string): void;
    /**
     * Remove a client from a room.
     */
    leave(client: WSClient, room: string): void;
    /**
     * Send a message to all clients in a room.
     */
    toRoom(room: string, data: string, exclude?: string[]): void;
    /**
     * Send JSON to all clients in a room.
     */
    toRoomJSON(room: string, data: unknown, exclude?: string[]): void;
    /**
     * Get all clients in a room.
     */
    getRoomClients(room: string): WSClient[];
    /**
     * Get all room names.
     */
    getRooms(): string[];
    private handleUpgrade;
}
export {};
//# sourceMappingURL=ws-server.d.ts.map