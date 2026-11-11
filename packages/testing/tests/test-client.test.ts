import { describe, it, expect } from 'vitest';
import { IncomingMessage, ServerResponse } from 'http';
import { createTestClient, TestRequest } from '../src/http/test-client';
import * as Index from '../src/index';

/** Minimal app double: echoes the raw request back as JSON. */
function echoApp(): any {
  return {
    async handleRequest(req: IncomingMessage, res: ServerResponse) {
      let body = '';
      req.setEncoding('utf8');
      for await (const chunk of req) body += chunk;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        authorization: req.headers['authorization'] ?? null,
        length: req.headers['content-length'] ?? null,
        body
      }));
    }
  };
}

describe('TestClient', () => {
  it('JSON-encodes object bodies by default', async () => {
    const res = await createTestClient(echoApp()).post('/users').send({ name: 'Tariq' });
    expect(res.status).toBe(200);
    expect(res.body.contentType).toBe('application/json');
    expect(res.body.body).toBe('{"name":"Tariq"}');
  });

  it('sends pre-serialized JSON strings as-is (bug fix: was double-encoded)', async () => {
    const raw = '{"name":"Tariq",  "n":1}';
    const res = await createTestClient(echoApp()).post('/x').send(raw);
    expect(res.body.contentType).toBe('application/json');
    expect(res.body.body).toBe(raw);
    expect(res.body.length).toBe(String(Buffer.byteLength(raw)));
  });

  it('sends Buffers as-is with a JSON content-type', async () => {
    const res = await createTestClient(echoApp())
      .post('/x')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(Buffer.from('[1,2]'));
    expect(res.body.body).toBe('[1,2]');
  });

  it('exports TestRequest (bug fix: helpers returning it failed declaration emit)', () => {
    const req: TestRequest = createTestClient(echoApp()).post('/x');
    expect(req).toBeInstanceOf(TestRequest);
    expect(Index.TestRequest).toBe(TestRequest);
  });

  it('sends string bodies as-is with a non-JSON content-type', async () => {
    const res = await createTestClient(echoApp())
      .post('/form')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('a=1&b=two');
    expect(res.body.contentType).toBe('application/x-www-form-urlencoded');
    expect(res.body.body).toBe('a=1&b=two');
    expect(res.body.length).toBe('9');

    const text = await createTestClient(echoApp())
      .put('/t')
      .set('content-type', 'text/plain; charset=utf-8')
      .send('héllo');
    expect(text.body.body).toBe('héllo');
    expect(text.body.length).toBe(String(Buffer.byteLength('héllo')));
  });

  it('sends Buffers as-is with a non-JSON content-type', async () => {
    const res = await createTestClient(echoApp())
      .post('/bin')
      .set('content-type', 'application/octet-stream')
      .send(Buffer.from('raw-bytes'));
    expect(res.body.body).toBe('raw-bytes');
  });

  it('still JSON-encodes objects with a non-JSON content-type', async () => {
    const res = await createTestClient(echoApp())
      .post('/x')
      .set('content-type', 'text/plain')
      .send({ a: 1 });
    expect(res.body.body).toBe('{"a":1}');
  });

  it('sets bearer auth and supports every verb', async () => {
    const client = createTestClient(echoApp());
    const res = await client.delete('/users/1').auth('tok');
    expect(res.body.method).toBe('DELETE');
    expect(res.body.authorization).toBe('Bearer tok');
    expect((await client.patch('/p')).body.method).toBe('PATCH');
    expect((await client.get('/g')).body.url).toBe('/g');
  });
});
