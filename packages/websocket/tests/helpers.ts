import { createServer, Server } from 'http';
import { connect, Socket, AddressInfo } from 'net';
import { createHash, randomBytes } from 'crypto';
import { parseFrame, WSFrame } from '../src/frame';
import { WSServer, WSServerOptions } from '../src/ws-server';
import { WSClient } from '../src/ws-client';

// ─── Frame encoding (client side: masked by default) ────────────────────────

export interface EncodeOptions {
  opcode: number;
  payload?: Buffer | string;
  fin?: boolean;
  mask?: boolean;
  rsv?: number;
  // Force a particular length encoding (7 / 16 / 64 bit)
  lengthBits?: 7 | 16 | 64;
  // Override the declared length (for header-only / lying frames)
  declaredLength?: number;
  // Only emit the header (no payload bytes)
  headerOnly?: boolean;
}

export function encodeFrame(opts: EncodeOptions): Buffer {
  const payload = typeof opts.payload === 'string'
    ? Buffer.from(opts.payload, 'utf-8')
    : (opts.payload ?? Buffer.alloc(0));
  const fin = opts.fin ?? true;
  const mask = opts.mask ?? true;
  const rsv = opts.rsv ?? 0;
  const len = opts.declaredLength ?? payload.length;

  let bits = opts.lengthBits;
  if (!bits) bits = len > 65535 ? 64 : len > 125 ? 16 : 7;

  const parts: Buffer[] = [];
  const first = (fin ? 0x80 : 0) | ((rsv & 0x7) << 4) | (opts.opcode & 0x0F);
  const maskBit = mask ? 0x80 : 0;
  if (bits === 7) {
    parts.push(Buffer.from([first, maskBit | len]));
  } else if (bits === 16) {
    const h = Buffer.alloc(4);
    h[0] = first; h[1] = maskBit | 126; h.writeUInt16BE(len, 2);
    parts.push(h);
  } else {
    const h = Buffer.alloc(10);
    h[0] = first; h[1] = maskBit | 127; h.writeBigUInt64BE(BigInt(len), 2);
    parts.push(h);
  }

  if (mask) {
    const key = randomBytes(4);
    parts.push(key);
    if (!opts.headerOnly) {
      const masked = Buffer.from(payload);
      for (let i = 0; i < masked.length; i++) masked[i] ^= key[i % 4];
      parts.push(masked);
    }
  } else if (!opts.headerOnly) {
    parts.push(payload);
  }
  return Buffer.concat(parts);
}

export function closePayload(code: number, reason = ''): Buffer {
  const b = Buffer.alloc(2 + Buffer.byteLength(reason));
  b.writeUInt16BE(code, 0);
  b.write(reason, 2);
  return b;
}

export function readClose(frame: WSFrame): { code: number; reason: string } {
  return {
    code: frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1005,
    reason: frame.payload.subarray(2).toString('utf-8')
  };
}

// ─── Raw socket client ───────────────────────────────────────────────────────

export class RawClient {
  readonly frames: WSFrame[] = [];
  readonly closed: Promise<void>;
  isClosed = false;
  autoPong = false;
  responseHead = '';

  private buf = Buffer.alloc(0);
  private handshakeDone = false;
  private waiters: Array<() => void> = [];

  constructor(public readonly socket: Socket) {
    this.closed = new Promise((resolve) => {
      socket.on('close', () => { this.isClosed = true; this.notify(); resolve(); });
    });
    socket.on('error', () => { /* surfaced through 'close' */ });
    socket.on('data', (chunk: Buffer) => this.onData(chunk));
  }

  static async connect(
    port: number,
    path = '/ws',
    headers: Record<string, string> = {},
    expectUpgrade = true
  ): Promise<RawClient> {
    const socket = connect(port, '127.0.0.1');
    const client = new RawClient(socket);
    const key = randomBytes(16).toString('base64');
    const allHeaders: Record<string, string> = {
      Host: `127.0.0.1:${port}`,
      Upgrade: 'websocket',
      Connection: 'Upgrade',
      'Sec-WebSocket-Key': key,
      'Sec-WebSocket-Version': '13',
      ...headers
    };
    const lines = [`GET ${path} HTTP/1.1`];
    for (const [k, v] of Object.entries(allHeaders)) if (v !== '') lines.push(`${k}: ${v}`);
    socket.write(lines.join('\r\n') + '\r\n\r\n');

    await client.waitUntil(() => client.handshakeDone || client.isClosed);
    if (expectUpgrade) {
      const expected = createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
      if (!client.responseHead.startsWith('HTTP/1.1 101') ||
          !client.responseHead.includes(`Sec-WebSocket-Accept: ${expected}`)) {
        throw new Error('Bad handshake response: ' + client.responseHead);
      }
    }
    return client;
  }

  send(opts: EncodeOptions): void {
    this.socket.write(encodeFrame(opts));
  }

  sendText(text: string): void {
    this.send({ opcode: 0x1, payload: text });
  }

  async nextFrame(timeoutMs = 2000): Promise<WSFrame> {
    await this.waitUntil(() => this.frames.length > 0 || this.isClosed, timeoutMs);
    const f = this.frames.shift();
    if (!f) throw new Error('Connection closed before a frame arrived');
    return f;
  }

  /** Next frame that isn't a ping (pings are common with short heartbeats). */
  async nextNonPing(timeoutMs = 2000): Promise<WSFrame> {
    for (;;) {
      const f = await this.nextFrame(timeoutMs);
      if (f.opcode !== 0x9) return f;
    }
  }

  async waitClosed(timeoutMs = 2000): Promise<void> {
    await this.waitUntil(() => this.isClosed, timeoutMs);
  }

  destroy(): void {
    this.socket.destroy();
  }

  waitUntil(cond: () => boolean, timeoutMs = 2000): Promise<void> {
    if (cond()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== check);
        reject(new Error('waitUntil timed out'));
      }, timeoutMs);
      const check = () => {
        if (cond()) {
          clearTimeout(timer);
          this.waiters = this.waiters.filter(w => w !== check);
          resolve();
        }
      };
      this.waiters.push(check);
    });
  }

  private notify(): void {
    for (const w of [...this.waiters]) w();
  }

  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (!this.handshakeDone) {
      const idx = this.buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      this.responseHead = this.buf.subarray(0, idx).toString('latin1');
      this.buf = this.buf.subarray(idx + 4);
      this.handshakeDone = true;
    }
    for (;;) {
      const r = parseFrame(this.buf);
      if (!r) break;
      this.buf = this.buf.subarray(r.bytesConsumed);
      this.frames.push(r.frame);
      if (this.autoPong && r.frame.opcode === 0x9) {
        this.send({ opcode: 0xA, payload: r.frame.payload });
      }
    }
    this.notify();
  }
}

// ─── Test server harness ─────────────────────────────────────────────────────

export interface Harness {
  http: Server;
  wss: WSServer;
  port: number;
  serverClients: WSClient[];
  raws: RawClient[];
  connect(path?: string, headers?: Record<string, string>, expectUpgrade?: boolean): Promise<RawClient>;
  close(): Promise<void>;
}

export async function startServer(options: WSServerOptions = {}, echo = true): Promise<Harness> {
  const http = createServer((_req, res) => { res.end('ok'); });
  const wss = new WSServer(http, options);
  const serverClients: WSClient[] = [];
  wss.on('connection', (client) => {
    serverClients.push(client);
    if (echo) {
      client.on('message', (data, isBinary) => {
        if (isBinary) client.sendBinary(data as Buffer);
        else client.send(`echo:${data}`);
      });
    }
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
  const port = (http.address() as AddressInfo).port;
  const raws: RawClient[] = [];

  return {
    http, wss, port, serverClients, raws,
    async connect(path = '/ws', headers = {}, expectUpgrade = true) {
      const c = await RawClient.connect(port, path, headers, expectUpgrade);
      raws.push(c);
      return c;
    },
    async close() {
      for (const c of raws) c.destroy();
      for (const c of serverClients) c.terminate();
      http.closeAllConnections();
      await new Promise<void>((r) => http.close(() => r()));
    }
  };
}

/** Resolve once the server has registered `n` connections. */
export async function waitForClients(h: Harness, n: number, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (h.serverClients.length < n) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for clients');
    await new Promise((r) => setTimeout(r, 5));
  }
}

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
