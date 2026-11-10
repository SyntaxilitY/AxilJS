import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MCPClient } from '../src/mcp/mcp-client';
import { startMockServer, MockServer, sendJson, silenceConsole, RecordedRequest } from './helpers/mock-server';
import * as http from 'http';

type Mode = 'json' | 'sse' | 'sse-open';

/**
 * Minimal Streamable-HTTP MCP server: answers JSON-RPC with plain JSON,
 * an SSE stream that ends, or an SSE stream that stays open.
 */
function mcpHandler(getMode: () => Mode) {
  return (req: RecordedRequest, res: http.ServerResponse) => {
    const msg = req.body;
    if (msg.id === undefined) {
      res.writeHead(202);
      res.end();
      return;
    }

    let result: unknown;
    switch (msg.method) {
      case 'initialize':
        result = { protocolVersion: '2024-11-05', serverInfo: { name: 'mock', version: '1.0' }, capabilities: {} };
        break;
      case 'tools/list':
        result = { tools: [{ name: 'shout', description: 'Upper-case text', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] };
        break;
      case 'tools/call':
        if (msg.params.name === 'fail') {
          result = { content: [{ type: 'text', text: 'tool exploded' }], isError: true };
        } else {
          result = { content: [{ type: 'text', text: String(msg.params.arguments.text).toUpperCase() }] };
        }
        break;
      case 'resources/read':
        result = { contents: [{ uri: msg.params.uri, text: 'file body' }] };
        break;
      default: {
        const error = { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } };
        sendJson(res, 200, error);
        return;
      }
    }

    const reply = { jsonrpc: '2.0', id: msg.id, result };
    const mode = getMode();
    const headers: Record<string, string> = {};
    if (msg.method === 'initialize') headers['Mcp-Session-Id'] = 'sess-42';

    if (mode === 'json') {
      sendJson(res, 200, reply, headers);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', ...headers });
    // A server notification first, then the response split across writes
    res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: {} })}\n\n`);
    const text = `event: message\ndata: ${JSON.stringify(reply)}\n\n`;
    res.write(text.slice(0, 10));
    setTimeout(() => {
      res.write(text.slice(10));
      if (mode === 'sse') res.end();
      // 'sse-open': keep the stream open, the client must not wait for it
    }, 5);
  };
}

describe('MCPClient', () => {
  let server: MockServer;
  let mode: Mode = 'json';

  beforeAll(async () => {
    server = await startMockServer(mcpHandler(() => mode));
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    silenceConsole(vi);
    server.requests.length = 0;
  });

  for (const m of ['json', 'sse', 'sse-open'] as Mode[]) {
    it(`connects, lists and calls tools (${m} responses)`, async () => {
      mode = m;
      const client = new MCPClient({ serverUrl: `${server.url}/mcp?token=abc`, timeoutMs: 2000 });

      await client.connect();
      const tools = await client.listTools();
      expect(tools.map(t => t.name)).toEqual(['shout']);

      const result = await client.callTool('shout', { text: 'hi' });
      expect(result.content[0].text).toBe('HI');

      expect(await client.readResource('file:///a')).toEqual({ uri: 'file:///a', text: 'file body' });

      // Exact URL: no forced trailing slash, query string kept
      expect(server.requests.every(r => r.url === '/mcp?token=abc')).toBe(true);

      // Handshake, initialized notification, then session id on later calls
      expect(server.requests[0].body.method).toBe('initialize');
      expect(server.requests[0].headers.accept).toBe('application/json, text/event-stream');
      expect(server.requests[1].body).toMatchObject({ method: 'notifications/initialized' });
      expect(server.requests[1].body.id).toBeUndefined();
      expect(server.requests[2].headers['mcp-session-id']).toBe('sess-42');

      await client.disconnect();
    });
  }

  it('keeps a trailing slash when given one', async () => {
    mode = 'json';
    const client = new MCPClient({ serverUrl: `${server.url}/mcp/` });
    await client.connect();
    expect(server.requests[0].url).toBe('/mcp/');
  });

  it('surfaces JSON-RPC errors and requires connect()', async () => {
    mode = 'sse';
    const client = new MCPClient({ serverUrl: `${server.url}/mcp` });
    await expect(client.listTools()).rejects.toThrow(/not connected/);
    await client.connect();
    await expect(client.listPrompts()).rejects.toThrow('MCP error -32601: Method not found');
  });

  it('bridges MCP tools to agent tools', async () => {
    mode = 'json';
    const client = new MCPClient({ serverUrl: `${server.url}/mcp` });
    await client.connect();
    const [tool] = await client.asAgentTools();
    expect(tool.definition.name).toBe('shout');
    expect(await tool.handler({ text: 'abc' })).toBe('ABC');
  });

  it('times out when the server never answers', async () => {
    const silent = await startMockServer(() => { /* hang */ });
    try {
      const client = new MCPClient({ serverUrl: `${silent.url}/mcp`, timeoutMs: 50 });
      await expect(client.connect()).rejects.toThrow('MCP request timeout: initialize');
    } finally {
      await silent.close();
    }
  });
});
