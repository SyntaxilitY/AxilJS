"use strict";
/**
 * MCP (Model Context Protocol) Client.
 * Connects to MCP servers to access external tools and resources.
 * MCP is Anthropic's open protocol for AI tool integration.
 *
 * MCP enables:
 *   - Connecting AI to databases, APIs, file systems
 *   - Standardized tool discovery
 *   - Resource access (files, databases, APIs)
 *   - Prompt templates from servers
 *
 * Usage:
 *   const client = new MCPClient({
 *     serverUrl: 'http://localhost:8080/mcp'
 *   })
 *
 *   await client.connect()
 *   const tools = await client.listTools()
 *   const result = await client.callTool('read_file', { path: '/etc/hosts' })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPClient = void 0;
const tool_1 = require("../agents/tool");
// ─── MCP Client ───────────────────────────────────────────────────────────────
class MCPClient {
    serverUrl;
    clientInfo;
    timeoutMs;
    connected = false;
    // Session ID assigned by Streamable HTTP servers (Mcp-Session-Id header)
    sessionId;
    // Cache of discovered tools
    cachedTools = [];
    constructor(options) {
        // Used exactly as given: path, trailing slash and query string are kept
        this.serverUrl = options.serverUrl;
        this.clientInfo = {
            name: options.clientName || 'AxilJS-MCP-Client',
            version: options.clientVersion || '0.1.0'
        };
        this.timeoutMs = options.timeoutMs || 30000;
    }
    // ─── Connection ───────────────────────────────────────────────────────────────
    /**
     * Initialize connection to the MCP server.
     * Sends the initialize handshake.
     */
    async connect() {
        const response = await this.request('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {
                roots: { listChanged: false },
                sampling: {}
            },
            clientInfo: this.clientInfo
        });
        if (!response.protocolVersion) {
            throw new Error('MCP server did not return protocol version');
        }
        this.connected = true;
        console.log(`\x1b[32m[AxilJS MCP]\x1b[0m Connected to MCP server: ${this.serverUrl}\n` +
            `  Server: ${response.serverInfo?.name || 'Unknown'} v${response.serverInfo?.version || '?'}\n` +
            `  Protocol: ${response.protocolVersion}`);
        // Send initialized notification
        await this.notify('notifications/initialized', {});
    }
    /**
     * Disconnect from the MCP server.
     */
    async disconnect() {
        this.connected = false;
        console.log('\x1b[33m[AxilJS MCP]\x1b[0m Disconnected from MCP server');
    }
    // ─── Tools ────────────────────────────────────────────────────────────────────
    /**
     * List all tools available on this MCP server.
     */
    async listTools() {
        this.ensureConnected();
        const response = await this.request('tools/list', {});
        this.cachedTools = response.tools || [];
        return this.cachedTools;
    }
    /**
     * Call a tool on the MCP server.
     *
     * @param name  Tool name
     * @param args  Tool arguments
     */
    async callTool(name, args = {}) {
        this.ensureConnected();
        const response = await this.request('tools/call', {
            name,
            arguments: args
        });
        return response;
    }
    // ─── Resources ────────────────────────────────────────────────────────────────
    /**
     * List all resources available on this MCP server.
     */
    async listResources() {
        this.ensureConnected();
        const response = await this.request('resources/list', {});
        return response.resources || [];
    }
    /**
     * Read a resource by URI.
     */
    async readResource(uri) {
        this.ensureConnected();
        const response = await this.request('resources/read', { uri });
        return response.contents?.[0] || {};
    }
    // ─── Prompts ─────────────────────────────────────────────────────────────────
    /**
     * List all prompt templates on this MCP server.
     */
    async listPrompts() {
        this.ensureConnected();
        const response = await this.request('prompts/list', {});
        return response.prompts || [];
    }
    /**
     * Get a specific prompt template with arguments filled in.
     */
    async getPrompt(name, args = {}) {
        this.ensureConnected();
        return await this.request('prompts/get', { name, arguments: args });
    }
    // ─── Bridge to Agent System ───────────────────────────────────────────────────
    /**
     * Convert MCP tools to AxilJS agent Tool format.
     * Use this to add MCP tools to an Agent.
     *
     * Usage:
     *   const mcpTools = await client.asAgentTools()
     *   const agent = new Agent({ provider, tools: mcpTools })
     */
    async asAgentTools() {
        const tools = await this.listTools();
        return tools.map(mcpTool => (0, tool_1.createTool)({
            name: mcpTool.name,
            description: mcpTool.description,
            parameters: mcpTool.inputSchema,
            handler: async (args) => {
                const result = await this.callTool(mcpTool.name, args);
                if (result.isError) {
                    throw new Error(result.content[0]?.text || 'MCP tool error');
                }
                // Return text content
                return result.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('\n');
            }
        }));
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    ensureConnected() {
        if (!this.connected) {
            throw new Error('MCP client not connected. Call client.connect() first.');
        }
    }
    /**
     * Send a JSON-RPC 2.0 request to the MCP server.
     * Handles both plain JSON responses and Streamable HTTP SSE responses;
     * for SSE the request resolves as soon as the matching message arrives,
     * even if the server keeps the stream open.
     */
    async request(method, params) {
        const id = Math.floor(Math.random() * 1000000);
        const body = JSON.stringify({
            jsonrpc: '2.0',
            id,
            method,
            params
        });
        return new Promise((resolve, reject) => {
            let settled = false;
            let res;
            const finish = (err, value) => {
                if (settled)
                    return;
                settled = true;
                if (err)
                    reject(err);
                else
                    resolve(value);
                // Close an SSE stream the server may keep open
                if (res && !res.complete)
                    res.destroy();
            };
            const handleMessage = (parsed) => {
                if (parsed.error) {
                    finish(new Error(`MCP error ${parsed.error.code}: ${parsed.error.message}`));
                    return;
                }
                finish(null, parsed.result);
            };
            const req = this.openRequest(body, (incoming) => {
                res = incoming;
                // Remember the session ID issued on initialize
                if (res.headers['mcp-session-id']) {
                    this.sessionId = String(res.headers['mcp-session-id']);
                }
                res.setEncoding('utf8');
                const isSSE = String(res.headers['content-type'] || '').includes('text/event-stream');
                let data = '';
                let lineBuffer = '';
                let eventData = [];
                // Last JSON-RPC message seen, used if none matches our id
                let lastMessage = null;
                const dispatchEvent = () => {
                    if (eventData.length === 0)
                        return;
                    const payload = eventData.join('\n');
                    eventData = [];
                    let message;
                    try {
                        message = JSON.parse(payload);
                    }
                    catch {
                        return;
                    }
                    if (!message || typeof message !== 'object')
                        return;
                    lastMessage = message;
                    if (message.id === id && ('result' in message || 'error' in message)) {
                        handleMessage(message);
                    }
                };
                res.on('data', (chunk) => {
                    if (!isSSE || res.statusCode >= 400) {
                        data += chunk;
                        return;
                    }
                    lineBuffer += chunk;
                    const lines = lineBuffer.split(/\r?\n/);
                    lineBuffer = lines.pop() || '';
                    for (const line of lines) {
                        if (line === '') {
                            dispatchEvent();
                        }
                        else if (line.startsWith('data:')) {
                            eventData.push(line.slice(5).replace(/^ /, ''));
                        }
                    }
                });
                res.on('end', () => {
                    if (settled)
                        return;
                    if (isSSE && res.statusCode < 400) {
                        if (lineBuffer.startsWith('data:'))
                            eventData.push(lineBuffer.slice(5).replace(/^ /, ''));
                        dispatchEvent();
                        if (settled)
                            return;
                        if (lastMessage) {
                            handleMessage(lastMessage);
                            return;
                        }
                        finish(new Error(`MCP: Invalid JSON response (HTTP ${res.statusCode})`));
                        return;
                    }
                    try {
                        handleMessage(JSON.parse(data));
                    }
                    catch {
                        finish(new Error(`MCP: Invalid JSON response (HTTP ${res.statusCode})`));
                    }
                });
                res.on('error', (err) => finish(err));
            });
            req.on('error', (err) => finish(err));
            req.setTimeout(this.timeoutMs, () => {
                req.destroy(new Error(`MCP request timeout: ${method}`));
            });
            req.write(body);
            req.end();
        });
    }
    /**
     * Send a JSON-RPC notification (no response expected).
     */
    async notify(method, params) {
        const body = JSON.stringify({ jsonrpc: '2.0', method, params });
        return new Promise((resolve, reject) => {
            const req = this.openRequest(body, (res) => {
                res.resume(); // Drain the response
                res.on('end', resolve);
                res.on('error', reject);
            });
            req.on('error', reject);
            req.setTimeout(this.timeoutMs, () => {
                req.destroy(new Error(`MCP request timeout: ${method}`));
            });
            req.write(body);
            req.end();
        });
    }
    /**
     * POST to the exact serverUrl (path and query string preserved).
     */
    openRequest(body, onResponse) {
        const url = new URL(this.serverUrl);
        const isHttps = url.protocol === 'https:';
        const transport = isHttps ? require('https') : require('http');
        return transport.request({
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: this.buildHeaders(body)
        }, onResponse);
    }
    /**
     * Request headers. Streamable HTTP servers reject POSTs (406) unless the
     * client accepts both JSON and SSE, and require the session ID afterwards.
     */
    buildHeaders(body) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Content-Length': String(Buffer.byteLength(body))
        };
        if (this.sessionId)
            headers['Mcp-Session-Id'] = this.sessionId;
        return headers;
    }
}
exports.MCPClient = MCPClient;
//# sourceMappingURL=mcp-client.js.map