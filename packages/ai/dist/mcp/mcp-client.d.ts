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
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
export interface MCPResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}
export interface MCPPrompt {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}
export interface MCPCallResult {
    content: Array<{
        type: 'text' | 'image' | 'resource';
        text?: string;
        data?: string;
        mimeType?: string;
    }>;
    isError?: boolean;
}
export interface MCPClientOptions {
    serverUrl: string;
    clientName?: string;
    clientVersion?: string;
    timeoutMs?: number;
}
export declare class MCPClient {
    private serverUrl;
    private clientInfo;
    private timeoutMs;
    private connected;
    private cachedTools;
    constructor(options: MCPClientOptions);
    /**
     * Initialize connection to the MCP server.
     * Sends the initialize handshake.
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the MCP server.
     */
    disconnect(): Promise<void>;
    /**
     * List all tools available on this MCP server.
     */
    listTools(): Promise<MCPTool[]>;
    /**
     * Call a tool on the MCP server.
     *
     * @param name  Tool name
     * @param args  Tool arguments
     */
    callTool(name: string, args?: Record<string, unknown>): Promise<MCPCallResult>;
    /**
     * List all resources available on this MCP server.
     */
    listResources(): Promise<MCPResource[]>;
    /**
     * Read a resource by URI.
     */
    readResource(uri: string): Promise<{
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
    }>;
    /**
     * List all prompt templates on this MCP server.
     */
    listPrompts(): Promise<MCPPrompt[]>;
    /**
     * Get a specific prompt template with arguments filled in.
     */
    getPrompt(name: string, args?: Record<string, string>): Promise<{
        description?: string;
        messages: Array<{
            role: string;
            content: {
                type: string;
                text: string;
            };
        }>;
    }>;
    /**
     * Convert MCP tools to @axiljsJS agent Tool format.
     * Use this to add MCP tools to an Agent.
     *
     * Usage:
     *   const mcpTools = await client.asAgentTools()
     *   const agent = new Agent({ provider, tools: mcpTools })
     */
    asAgentTools(): Promise<any[]>;
    private ensureConnected;
    /**
     * Send a JSON-RPC 2.0 request to the MCP server.
     */
    private request;
    /**
     * Send a JSON-RPC notification (no response expected).
     */
    private notify;
}
//# sourceMappingURL=mcp-client.d.ts.map