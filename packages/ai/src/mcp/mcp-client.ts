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

// ─── MCP Types ────────────────────────────────────────────────────────────────

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

// ─── MCP Client Options ───────────────────────────────────────────────────────

export interface MCPClientOptions {
  // MCP server URL
  serverUrl: string;

  // Client name (sent to server for identification)
  clientName?: string;

  // Client version
  clientVersion?: string;

  // Request timeout (default: 30000)
  timeoutMs?: number;
}

// ─── MCP Client ───────────────────────────────────────────────────────────────

export class MCPClient {
  private serverUrl: string;
  private clientInfo: { name: string; version: string };
  private timeoutMs: number;
  private connected = false;

  // Cache of discovered tools
  private cachedTools: MCPTool[] = [];

  constructor(options: MCPClientOptions) {
    this.serverUrl = options.serverUrl.replace(/\/$/, ''); // Remove trailing slash
    this.clientInfo = {
      name:    options.clientName    || '@axiljsJS-MCP-Client',
      version: options.clientVersion || '0.1.0'
    };
    this.timeoutMs = options.timeoutMs || 30000;
  }

  // ─── Connection ───────────────────────────────────────────────────────────────

  /**
   * Initialize connection to the MCP server.
   * Sends the initialize handshake.
   */
  async connect(): Promise<void> {
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

    console.log(
      `\x1b[32m[@axiljsJS MCP]\x1b[0m Connected to MCP server: ${this.serverUrl}\n` +
      `  Server: ${response.serverInfo?.name || 'Unknown'} v${response.serverInfo?.version || '?'}\n` +
      `  Protocol: ${response.protocolVersion}`
    );

    // Send initialized notification
    await this.notify('notifications/initialized', {});
  }

  /**
   * Disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    console.log('\x1b[33m[@axiljsJS MCP]\x1b[0m Disconnected from MCP server');
  }

  // ─── Tools ────────────────────────────────────────────────────────────────────

  /**
   * List all tools available on this MCP server.
   */
  async listTools(): Promise<MCPTool[]> {
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
  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<MCPCallResult> {
    this.ensureConnected();

    const response = await this.request('tools/call', {
      name,
      arguments: args
    });

    return response as MCPCallResult;
  }

  // ─── Resources ────────────────────────────────────────────────────────────────

  /**
   * List all resources available on this MCP server.
   */
  async listResources(): Promise<MCPResource[]> {
    this.ensureConnected();
    const response = await this.request('resources/list', {});
    return response.resources || [];
  }

  /**
   * Read a resource by URI.
   */
  async readResource(uri: string): Promise<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }> {
    this.ensureConnected();
    const response = await this.request('resources/read', { uri });
    return response.contents?.[0] || {};
  }

  // ─── Prompts ─────────────────────────────────────────────────────────────────

  /**
   * List all prompt templates on this MCP server.
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    this.ensureConnected();
    const response = await this.request('prompts/list', {});
    return response.prompts || [];
  }

  /**
   * Get a specific prompt template with arguments filled in.
   */
  async getPrompt(
    name: string,
    args: Record<string, string> = {}
  ): Promise<{
    description?: string;
    messages: Array<{ role: string; content: { type: string; text: string } }>;
  }> {
    this.ensureConnected();
    return await this.request('prompts/get', { name, arguments: args });
  }

  // ─── Bridge to Agent System ───────────────────────────────────────────────────

  /**
   * Convert MCP tools to @axiljsJS agent Tool format.
   * Use this to add MCP tools to an Agent.
   *
   * Usage:
   *   const mcpTools = await client.asAgentTools()
   *   const agent = new Agent({ provider, tools: mcpTools })
   */
  async asAgentTools() {
    const { createTool } = require('../agents/tool');
    const tools = await this.listTools();

    return tools.map(mcpTool => createTool({
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: mcpTool.inputSchema as any,
      handler: async (args: Record<string, unknown>) => {
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

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error(
        'MCP client not connected. Call client.connect() first.'
      );
    }
  }

  /**
   * Send a JSON-RPC 2.0 request to the MCP server.
   */
  private async request(method: string, params: unknown): Promise<any> {
    const id = Math.floor(Math.random() * 1000000);

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    });

    return new Promise((resolve, reject) => {
      const url = new URL(`${this.serverUrl}/`);
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? require('https') : require('http');

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type':   'application/json',
            'Content-Length': String(Buffer.byteLength(body))
          }
        },
        (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);

              if (parsed.error) {
                reject(new Error(
                  `MCP error ${parsed.error.code}: ${parsed.error.message}`
                ));
                return;
              }

              resolve(parsed.result);
            } catch {
              reject(new Error(`MCP: Invalid JSON response`));
            }
          });
          res.on('error', reject);
        }
      );

      req.on('error', reject);
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
  private async notify(method: string, params: unknown): Promise<void> {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params });

    return new Promise((resolve, reject) => {
      const url = new URL(`${this.serverUrl}/`);
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? require('https') : require('http');

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type':   'application/json',
            'Content-Length': String(Buffer.byteLength(body))
          }
        },
        (res: any) => {
          res.resume(); // Drain the response
          res.on('end', resolve);
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}