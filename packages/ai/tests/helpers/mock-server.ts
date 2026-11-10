import * as http from 'http';
import { AddressInfo } from 'net';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  raw: string;
  body: any;
}

export type MockHandler = (
  req: RecordedRequest,
  res: http.ServerResponse,
  index: number
) => void | Promise<void>;

export interface MockServer {
  url: string;
  requests: RecordedRequest[];
  // Number of requests whose socket was closed by the client
  closedEarly: () => number;
  setHandler: (handler: MockHandler) => void;
  close: () => Promise<void>;
}

/**
 * Local HTTP server that records requests and delegates responses.
 */
export async function startMockServer(handler: MockHandler): Promise<MockServer> {
  let current = handler;
  const requests: RecordedRequest[] = [];
  let early = 0;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', c => (raw += c));
    req.on('end', async () => {
      let body: any = undefined;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
      const rec: RecordedRequest = {
        method: req.method || '',
        url: req.url || '',
        headers: req.headers,
        raw,
        body
      };
      requests.push(rec);
      res.on('close', () => { if (!res.writableFinished) early++; });
      try {
        await current(rec, res, requests.length - 1);
      } catch {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    closedEarly: () => early,
    setHandler: h => { current = h; },
    close: () => new Promise<void>(resolve => {
      server.closeAllConnections();
      server.close(() => resolve());
    })
  };
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(text);
}

const tick = () => new Promise(r => setTimeout(r, 2));

/**
 * Write `text` in deliberately awkward byte-sized pieces (splitting lines,
 * "data:" prefixes and multi-byte UTF-8 characters) with a pause between
 * writes so the client sees separate chunks.
 */
export async function writeAwkward(
  res: http.ServerResponse,
  text: string,
  sizes: number[] = [1, 3, 7, 2, 11, 5]
): Promise<void> {
  const buf = Buffer.from(text, 'utf8');
  let offset = 0;
  let i = 0;
  while (offset < buf.length) {
    const size = sizes[i++ % sizes.length];
    res.write(buf.subarray(offset, offset + size));
    offset += size;
    await tick();
  }
  res.end();
}

export function sse(events: unknown[], { done = false }: { done?: boolean } = {}): string {
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : '');
}

export function ndjson(lines: unknown[]): string {
  return lines.map(l => JSON.stringify(l)).join('\n') + '\n';
}

export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

export function silenceConsole(vi: any): void {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
}
