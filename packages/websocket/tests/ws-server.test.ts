import { describe, it, expect, afterEach, vi } from 'vitest';
import { connect } from 'net';
import {
  startServer, Harness, closePayload, readClose, waitForClients, delay
} from './helpers';

let h: Harness | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (h) await h.close();
  h = undefined;
});

describe('handshake + messaging', () => {
  it('completes the handshake and echoes a masked text frame', async () => {
    h = await startServer();
    const c = await h.connect();
    c.sendText('hello');
    const f = await c.nextFrame();
    expect(f.opcode).toBe(0x1);
    expect(f.masked).toBe(false); // server → client frames are unmasked
    expect(f.payload.toString()).toBe('echo:hello');
  });

  it('accepts query strings on the configured path', async () => {
    h = await startServer({ path: '/socket' });
    const c = await h.connect('/socket?token=abc');
    c.sendText('x');
    expect((await c.nextFrame()).payload.toString()).toBe('echo:x');
  });

  it('echoes binary frames', async () => {
    h = await startServer();
    const c = await h.connect();
    const data = Buffer.from([0, 1, 2, 255]);
    c.send({ opcode: 0x2, payload: data });
    const f = await c.nextFrame();
    expect(f.opcode).toBe(0x2);
    expect(Buffer.compare(f.payload, data)).toBe(0);
  });

  it('handles frames split across TCP writes and multiple frames per write', async () => {
    h = await startServer();
    const c = await h.connect();
    const { encodeFrame } = await import('./helpers');
    const a = encodeFrame({ opcode: 0x1, payload: 'one' });
    const b = encodeFrame({ opcode: 0x1, payload: 'two' });
    const both = Buffer.concat([a, b]);
    c.socket.write(both.subarray(0, 3));
    await delay(20);
    c.socket.write(both.subarray(3));
    expect((await c.nextFrame()).payload.toString()).toBe('echo:one');
    expect((await c.nextFrame()).payload.toString()).toBe('echo:two');
  });

  it('reassembles fragmented messages with an interleaved ping', async () => {
    h = await startServer();
    const c = await h.connect();
    c.send({ opcode: 0x1, payload: 'hel', fin: false });
    c.send({ opcode: 0x9, payload: 'p' });
    c.send({ opcode: 0x0, payload: 'lo ', fin: false });
    c.send({ opcode: 0x0, payload: 'world', fin: true });
    const pong = await c.nextFrame();
    expect(pong.opcode).toBe(0xA);
    expect(pong.payload.toString()).toBe('p');
    const msg = await c.nextFrame();
    expect(msg.payload.toString()).toBe('echo:hello world');
  });

  it('accepts a multi-byte UTF-8 character split across fragments', async () => {
    h = await startServer();
    const c = await h.connect();
    const euro = Buffer.from('€', 'utf-8'); // e2 82 ac
    c.send({ opcode: 0x1, payload: euro.subarray(0, 1), fin: false });
    c.send({ opcode: 0x0, payload: euro.subarray(1), fin: true });
    expect((await c.nextFrame()).payload.toString()).toBe('echo:€');
  });

  it('supports 16-bit and 64-bit payload lengths in both directions', async () => {
    h = await startServer();
    const c = await h.connect();

    const medium = 'm'.repeat(300);
    c.send({ opcode: 0x1, payload: medium });
    expect((await c.nextFrame()).payload.toString()).toBe('echo:' + medium);

    // Small payload forced into the 64-bit length encoding
    c.send({ opcode: 0x1, payload: 'tiny', lengthBits: 64 });
    expect((await c.nextFrame()).payload.toString()).toBe('echo:tiny');

    const big = Buffer.alloc(70000, 7);
    c.send({ opcode: 0x2, payload: big });
    const f = await c.nextFrame();
    expect(f.payload.length).toBe(70000);
    expect(f.payload.every((b) => b === 7)).toBe(true);
  });

  it('answers pings with pongs carrying the same payload', async () => {
    h = await startServer();
    const c = await h.connect();
    c.send({ opcode: 0x9, payload: 'are-you-there' });
    const f = await c.nextFrame();
    expect(f.opcode).toBe(0xA);
    expect(f.payload.toString()).toBe('are-you-there');
  });

  it('emits ping/pong events on the server-side client', async () => {
    h = await startServer();
    const c = await h.connect();
    await waitForClients(h, 1);
    const pings: string[] = [];
    const pongs: string[] = [];
    h.serverClients[0].on('ping', (d) => pings.push(d.toString()));
    h.serverClients[0].on('pong', (d) => pongs.push(d.toString()));
    c.send({ opcode: 0x9, payload: 'a' });
    c.send({ opcode: 0xA, payload: 'b' });
    await c.nextFrame();
    await delay(20);
    expect(pings).toEqual(['a']);
    expect(pongs).toEqual(['b']);
  });
});

describe('RFC 6455 enforcement', () => {
  async function expectClose(payloadOpts: Parameters<import('./helpers').RawClient['send']>[0], code: number, server = {}) {
    h = await startServer(server);
    const c = await h.connect();
    await waitForClients(h, 1);
    const closes: number[] = [];
    h.serverClients[0].on('close', (cc) => closes.push(cc));
    c.send(payloadOpts);
    const f = await c.nextFrame();
    expect(f.opcode).toBe(0x8);
    expect(readClose(f).code).toBe(code);
    await c.waitClosed();
    expect(closes).toEqual([code]);
    return c;
  }

  it('rejects unmasked client frames with 1002', async () => {
    await expectClose({ opcode: 0x1, payload: 'x', mask: false }, 1002);
  });

  it('rejects control frames > 125 bytes with 1002', async () => {
    await expectClose({ opcode: 0x9, payload: Buffer.alloc(126) }, 1002);
  });

  it('rejects fragmented control frames with 1002', async () => {
    await expectClose({ opcode: 0x9, payload: 'p', fin: false }, 1002);
  });

  it('rejects unknown opcodes with 1002', async () => {
    await expectClose({ opcode: 0x3, payload: 'x' }, 1002);
  });

  it('rejects RSV bits without a negotiated extension with 1002', async () => {
    await expectClose({ opcode: 0x1, payload: 'x', rsv: 4 }, 1002);
  });

  it('rejects a continuation frame with no message in progress with 1002', async () => {
    await expectClose({ opcode: 0x0, payload: 'x' }, 1002);
  });

  it('rejects invalid UTF-8 in text frames with 1007', async () => {
    await expectClose({ opcode: 0x1, payload: Buffer.from([0xc3, 0x28]) }, 1007);
  });

  it('rejects a new data frame while a fragmented message is in progress', async () => {
    h = await startServer();
    const c = await h.connect();
    c.send({ opcode: 0x1, payload: 'a', fin: false });
    c.send({ opcode: 0x1, payload: 'b' });
    const f = await c.nextFrame();
    expect(readClose(f).code).toBe(1002);
  });

  it('rejects invalid close codes with 1002', async () => {
    await expectClose({ opcode: 0x8, payload: closePayload(1005) }, 1002);
  });
});

describe('maxPayload', () => {
  it('closes with 1009 when a frame exceeds maxPayload', async () => {
    const c = await (async () => {
      h = await startServer({ maxPayload: 1024 });
      return h.connect();
    })();
    const messages: unknown[] = [];
    await waitForClients(h!, 1);
    h!.serverClients[0].on('message', (m) => messages.push(m));
    c.send({ opcode: 0x2, payload: Buffer.alloc(2000) });
    const f = await c.nextFrame();
    expect(readClose(f).code).toBe(1009);
    await c.waitClosed();
    expect(messages).toEqual([]);
  });

  it('rejects on the declared length alone (no payload buffered)', async () => {
    h = await startServer({ maxPayload: 1024 });
    const c = await h.connect();
    // Declare ~1 GiB via the 64-bit length but send only the header
    c.send({ opcode: 0x2, declaredLength: 2 ** 30, lengthBits: 64, headerOnly: true });
    const f = await c.nextFrame();
    expect(readClose(f).code).toBe(1009);
  });

  it('applies to reassembled fragmented messages', async () => {
    h = await startServer({ maxPayload: 1000 });
    const c = await h.connect();
    c.send({ opcode: 0x1, payload: 'a'.repeat(600), fin: false });
    c.send({ opcode: 0x0, payload: 'a'.repeat(600), fin: true });
    const f = await c.nextFrame();
    expect(readClose(f).code).toBe(1009);
  });

  it('accepts messages exactly at the limit', async () => {
    h = await startServer({ maxPayload: 1000 });
    const c = await h.connect();
    c.send({ opcode: 0x2, payload: Buffer.alloc(1000, 1) });
    const f = await c.nextFrame();
    expect(f.opcode).toBe(0x2);
    expect(f.payload.length).toBe(1000);
  });

  it('ignores data received after the failure', async () => {
    h = await startServer({ maxPayload: 10 });
    const c = await h.connect();
    await waitForClients(h, 1);
    const messages: unknown[] = [];
    h.serverClients[0].on('message', (m) => messages.push(m));
    c.send({ opcode: 0x1, payload: 'x'.repeat(11) });
    c.sendText('after');
    await c.nextFrame();
    await delay(20);
    expect(messages).toEqual([]);
  });
});

describe('close handshake', () => {
  it('echoes a client-initiated close and closes TCP', async () => {
    h = await startServer();
    const c = await h.connect();
    await waitForClients(h, 1);
    const closes: Array<[number, string]> = [];
    h.serverClients[0].on('close', (code, reason) => closes.push([code, reason]));
    c.send({ opcode: 0x8, payload: closePayload(1000, 'bye') });
    const f = await c.nextFrame();
    expect(f.opcode).toBe(0x8);
    expect(readClose(f)).toEqual({ code: 1000, reason: 'bye' });
    await c.waitClosed();
    expect(closes).toEqual([[1000, 'bye']]);
    expect(h.wss.clientCount).toBe(0);
  });

  it('server-initiated close completes as soon as the peer answers', async () => {
    h = await startServer({ closeTimeoutMs: 10000 });
    const c = await h.connect();
    await waitForClients(h, 1);
    const closes: number[] = [];
    const sc = h.serverClients[0];
    sc.on('close', (code) => closes.push(code));
    sc.close(4000, 'done');
    expect(sc.isOpen).toBe(false);
    const f = await c.nextFrame();
    expect(readClose(f)).toEqual({ code: 4000, reason: 'done' });
    c.send({ opcode: 0x8, payload: closePayload(4000) });
    const start = Date.now();
    await c.waitClosed();
    expect(Date.now() - start).toBeLessThan(1000);
    expect(closes).toEqual([4000]);
  });

  it('destroys the socket when the peer never answers the close', async () => {
    h = await startServer({ closeTimeoutMs: 100 });
    const c = await h.connect();
    await waitForClients(h, 1);
    const closes: number[] = [];
    h.serverClients[0].on('close', (code) => closes.push(code));
    h.serverClients[0].close();
    const f = await c.nextFrame();
    expect(readClose(f).code).toBe(1000);
    // Don't answer; the server must give up after closeTimeoutMs
    await c.waitClosed(1000);
    expect(closes).toEqual([1006]);
  });

  it('send() after close is a no-op', async () => {
    h = await startServer({ closeTimeoutMs: 100 });
    const c = await h.connect();
    await waitForClients(h, 1);
    const sc = h.serverClients[0];
    sc.close();
    sc.send('ignored');
    const f = await c.nextFrame();
    expect(f.opcode).toBe(0x8);
    await c.waitClosed();
    expect(c.frames).toEqual([]);
  });

  it('WSServer.close() closes every client with 1001', async () => {
    h = await startServer({ closeTimeoutMs: 100 });
    const a = await h.connect();
    const b = await h.connect();
    await waitForClients(h, 2);
    h.wss.close();
    expect(readClose(await a.nextFrame()).code).toBe(1001);
    expect(readClose(await b.nextFrame()).code).toBe(1001);
  });
});

describe('heartbeat', () => {
  it('terminates clients that miss a pong', async () => {
    h = await startServer({ heartbeatIntervalMs: 40 });
    const c = await h.connect();
    await waitForClients(h, 1);
    const closes: number[] = [];
    h.serverClients[0].on('close', (code) => closes.push(code));
    const ping = await c.nextFrame();
    expect(ping.opcode).toBe(0x9);
    await c.waitClosed(1000);
    expect(closes).toEqual([1006]);
    expect(h.wss.clientCount).toBe(0);
  });

  it('keeps clients that answer pings', async () => {
    h = await startServer({ heartbeatIntervalMs: 40 });
    const c = await h.connect();
    c.autoPong = true;
    await delay(250);
    expect(c.isClosed).toBe(false);
    c.sendText('still here');
    expect((await c.nextNonPing()).payload.toString()).toBe('echo:still here');
  });

  it('can be disabled with heartbeatIntervalMs: 0', async () => {
    h = await startServer({ heartbeatIntervalMs: 0 });
    const c = await h.connect();
    await delay(60);
    expect(c.frames).toEqual([]);
    expect(c.isClosed).toBe(false);
  });
});

describe('rooms and broadcasting', () => {
  it('broadcast, exclude, rooms, leave and cleanup on disconnect', async () => {
    h = await startServer({}, false);
    const a = await h.connect();
    const b = await h.connect();
    const c = await h.connect();
    await waitForClients(h, 3);
    const [sa, sb, sc] = h.serverClients;
    expect(h.wss.clientCount).toBe(3);
    expect(h.wss.getClient(sa.id)).toBe(sa);
    expect(h.wss.getClients()).toHaveLength(3);

    h.wss.broadcast('all', [sb.id]);
    expect((await a.nextFrame()).payload.toString()).toBe('all');
    expect((await c.nextFrame()).payload.toString()).toBe('all');

    h.wss.join(sa, 'r1');
    h.wss.join(sb, 'r1');
    expect(h.wss.getRooms()).toEqual(['r1']);
    expect(h.wss.getRoomClients('r1').map((x) => x.id).sort()).toEqual([sa.id, sb.id].sort());
    expect(sa.rooms.has('r1')).toBe(true);

    h.wss.toRoomJSON('r1', { hi: 1 }, [sa.id]);
    expect(JSON.parse((await b.nextFrame()).payload.toString())).toEqual({ hi: 1 });

    h.wss.leave(sb, 'r1');
    h.wss.toRoom('r1', 'only-a');
    expect((await a.nextFrame()).payload.toString()).toBe('only-a');

    // Disconnect removes the client from rooms; empty rooms disappear
    a.destroy();
    await new Promise<void>((r) => sa.on('close', () => r()));
    expect(h.wss.getRooms()).toEqual([]);
    expect(h.wss.clientCount).toBe(2);

    h.wss.broadcastJSON({ x: 1 });
    expect(JSON.parse((await b.nextFrame()).payload.toString())).toEqual({ x: 1 });
    expect(JSON.parse((await c.nextFrame()).payload.toString())).toEqual({ x: 1 });
    // Sanity: nothing extra queued
    await delay(20);
    expect(b.frames).toEqual([]);
    expect(sc.isOpen).toBe(true);
  });
});

describe('upgrade routing', () => {
  it('leaves upgrades on other paths for other handlers', async () => {
    h = await startServer();
    h.http.on('upgrade', (req, socket) => {
      if (req.url === '/other') {
        socket.end('HTTP/1.1 418 I am a teapot\r\nConnection: close\r\n\r\n');
      }
    });
    // Non-WebSocket upgrade (previously destroyed regardless of path)
    const c = await h.connect('/other', { Upgrade: 'h2c', 'Sec-WebSocket-Key': '', 'Sec-WebSocket-Version': '' }, false);
    expect(c.responseHead).toMatch(/^HTTP\/1\.1 418/);
  });

  it('rejects a non-WebSocket upgrade on the configured path with 400', async () => {
    h = await startServer();
    const c = await h.connect('/ws', { Upgrade: 'h2c' }, false);
    expect(c.responseHead).toMatch(/^HTTP\/1\.1 400/);
    await c.waitClosed();
  });

  it('rejects a bad Sec-WebSocket-Version on the configured path with 400', async () => {
    h = await startServer();
    const c = await h.connect('/ws', { 'Sec-WebSocket-Version': '8' }, false);
    expect(c.responseHead).toMatch(/^HTTP\/1\.1 400/);
  });

  it('enforces maxClients with 503', async () => {
    h = await startServer({ maxClients: 1 });
    await h.connect();
    await waitForClients(h, 1);
    const c = await h.connect('/ws', {}, false);
    expect(c.responseHead).toMatch(/^HTTP\/1\.1 503/);
  });

  it('runs the guard (403 on false, 500 on throw)', async () => {
    h = await startServer({
      guard: (req) => {
        if (req.url?.includes('boom')) throw new Error('x');
        return req.url?.includes('ok') ?? false;
      }
    });
    const denied = await h.connect('/ws?no', {}, false);
    expect(denied.responseHead).toMatch(/^HTTP\/1\.1 403/);
    const err = await h.connect('/ws?boom', {}, false);
    expect(err.responseHead).toMatch(/^HTTP\/1\.1 500/);
    const ok = await h.connect('/ws?ok');
    ok.sendText('y');
    expect((await ok.nextFrame()).payload.toString()).toBe('echo:y');
  });

  it('processes frames sent in the same packet as the upgrade request', async () => {
    h = await startServer();
    const { encodeFrame, RawClient } = await import('./helpers');
    const socket = connect(h.port, '127.0.0.1');
    const raw = new RawClient(socket);
    h.raws.push(raw);
    const req =
      'GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n';
    socket.write(Buffer.concat([Buffer.from(req), encodeFrame({ opcode: 0x1, payload: 'early' })]));
    const f = await raw.nextFrame();
    expect(raw.responseHead).toContain('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
    expect(f.payload.toString()).toBe('echo:early');
  });
});
