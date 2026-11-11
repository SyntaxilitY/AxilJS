import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tAudit, tRetry, tTimeout, tRedact, tSensitive, tIdempotent } from '@axiljs/decorator';
import { getGlobalEventBus } from '@axiljs/events';
import { Application } from '@axiljs/core';
import { createTestClient } from '@axiljs/testing';
import {
  wire,
  wireAll,
  unwrap,
  registerInterceptor,
  unregisterInterceptor,
  getContext,
  runWithContext,
  requestContext,
  redact,
  redactResponses,
  redactingTransport,
  TimeoutError
} from '../src';

const tick = () => new Promise(r => setImmediate(r));

let events: Array<{ type: string; payload: any }> = [];
let subs: Array<{ unsubscribe(): void }> = [];

beforeEach(() => {
  events = [];
  const bus = getGlobalEventBus();
  subs = ['audit.log', 'runtime.retry'].map(type =>
    bus.on(type, (e: any) => { events.push({ type, payload: e.payload }); })
  );
});

afterEach(() => {
  subs.forEach(s => s.unsubscribe());
});

// ─── tRetry / tTimeout ────────────────────────────────────────────────────────

describe('tRetry', () => {
  it('retries until success and emits runtime.retry', async () => {
    class Svc {
      calls = 0;
      @tRetry({ attempts: 3, delay: 1, backoff: 'fixed' })
      async flaky() {
        if (++this.calls < 3) throw new Error('boom');
        return 'ok';
      }
    }
    wire(Svc);
    const s = new Svc();
    await expect(s.flaky()).resolves.toBe('ok');
    expect(s.calls).toBe(3);
    await tick();
    expect(events.filter(e => e.type === 'runtime.retry')).toHaveLength(2);
    expect(events[0].payload.target).toBe('Svc.flaky');
  });

  it('only retries errors listed in retryOn (by name or code)', async () => {
    class Svc {
      calls = 0;
      @tRetry({ attempts: 5, delay: 1, retryOn: ['ECONNRESET'] })
      async call(code: string) {
        this.calls++;
        throw Object.assign(new Error(code), { code });
      }
    }
    wire(Svc);
    const a = new Svc();
    await expect(a.call('EACCES')).rejects.toThrow('EACCES');
    expect(a.calls).toBe(1);
    const b = new Svc();
    await expect(b.call('ECONNRESET')).rejects.toThrow('ECONNRESET');
    expect(b.calls).toBe(5);
  });

  it('wraps synchronous methods and sync throws', async () => {
    class Svc {
      calls = 0;
      @tRetry({ attempts: 2, delay: 1 })
      sync() {
        if (++this.calls < 2) throw new Error('sync');
        return 42;
      }
    }
    wire(Svc);
    await expect(new Svc().sync()).resolves.toBe(42);
  });
});

describe('tTimeout', () => {
  it('rejects with TimeoutError, and composes with tRetry per attempt', async () => {
    class Svc {
      calls = 0;
      @tRetry({ attempts: 2, delay: 1, retryOn: ['TimeoutError'] })
      @tTimeout(20)
      async slow() {
        this.calls++;
        await new Promise(r => setTimeout(r, 200));
        return 'late';
      }
    }
    wire(Svc);
    const s = new Svc();
    const err = await s.slow().catch(e => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err.message).toBe('Svc.slow timed out after 20ms');
    expect(s.calls).toBe(2);
  });
});

// ─── tAudit ───────────────────────────────────────────────────────────────────

describe('tAudit', () => {
  class Account {
    @tRedact({ strategy: 'remove' }) pin = '';
    constructor(public id: string, pin: string) { this.pin = pin; }
  }

  class Bank {
    attempts = 0;

    @tAudit({ action: 'funds.transferred', compliance: ['SOC2'], includeRequest: true, includeResponse: true })
    @tRetry({ attempts: 3, delay: 1 })
    async transfer(account: Account, amount: number) {
      if (++this.attempts < 2) throw new Error('transient');
      return { ok: true, amount };
    }

    @tAudit({ action: 'account.closed' })
    async close() {
      throw new Error('denied');
    }
  }
  wire(Bank);

  it('emits one event per logical call with actor and request from context', async () => {
    const bank = new Bank();
    await runWithContext({ requestId: 'req-1', user: { id: 7 }, tenantId: 't1' }, () =>
      bank.transfer(new Account('a1', '1234'), 50)
    );
    await tick();
    const audits = events.filter(e => e.type === 'audit.log');
    expect(audits).toHaveLength(1);
    const ev = audits[0].payload;
    expect(ev).toMatchObject({
      action: 'funds.transferred',
      actor: { id: 7, type: 'user' },
      tenantId: 't1',
      requestId: 'req-1',
      success: true,
      metadata: { target: 'Bank.transfer', compliance: ['SOC2'], result: { ok: true, amount: 50 } }
    });
    // args are redacted: the pin never reaches the audit trail
    expect(ev.metadata.args).toEqual([{ id: 'a1' }, 50]);
  });

  it('records failures as system actor outside a request and rethrows', async () => {
    await expect(new Bank().close()).rejects.toThrow('denied');
    await tick();
    const ev = events.find(e => e.type === 'audit.log')!.payload;
    expect(ev).toMatchObject({ action: 'account.closed', success: false, error: 'denied', actor: { type: 'system' } });
  });
});

// ─── wiring ───────────────────────────────────────────────────────────────────

describe('wire', () => {
  it('is idempotent and never double-wraps in subclasses', async () => {
    class Base {
      calls = 0;
      @tRetry({ attempts: 2, delay: 1 })
      async op() {
        this.calls++;
        throw new Error('x');
      }
    }
    class Child extends Base {}
    wire(Base); wire(Base); wire(Child);
    const c = new Child();
    await expect(c.op()).rejects.toThrow('x');
    expect(c.calls).toBe(2); // 2, not 4
    expect(unwrap(Child.prototype.op)).toBe(unwrap(Base.prototype.op));
  });

  it('wires static methods and leaves undecorated ones alone', async () => {
    class Util {
      static calls = 0;
      @tRetry({ attempts: 3, delay: 1 })
      static async go() {
        if (++Util.calls < 3) throw new Error('again');
        return 'done';
      }
      plain() { return 1; }
    }
    wire(Util);
    await expect(Util.go()).resolves.toBe('done');
    expect(new Util().plain()).toBe(1);
  });

  it('wireAll wires every decorated class registered so far', async () => {
    class Late {
      calls = 0;
      @tRetry({ attempts: 2, delay: 1 })
      async op() {
        if (++this.calls < 2) throw new Error('x');
        return 'y';
      }
    }
    expect(wireAll()).toBeGreaterThanOrEqual(1);
    await expect(new Late().op()).resolves.toBe('y');
  });

  it('runs custom interceptors in order (lower = outer)', async () => {
    const trace: string[] = [];
    registerInterceptor({
      decorator: 'tIdempotent',
      order: 50,
      async intercept(inv, opts, proceed) {
        trace.push(`in:${opts.key}`);
        const r = await proceed();
        trace.push('out');
        return r;
      }
    });
    try {
      class Svc {
        @tIdempotent({ key: 'k' })
        @tTimeout(1000)
        async op() { trace.push('body'); return 1; }
      }
      wire(Svc);
      await new Svc().op();
      expect(trace).toEqual(['in:k', 'body', 'out']);
    } finally {
      unregisterInterceptor('tIdempotent');
    }
  });
});

// ─── context ──────────────────────────────────────────────────────────────────

describe('requestContext', () => {
  function fakeReq(headers: Record<string, string> = {}) {
    return { headers, locals: {} as Record<string, unknown> } as any;
  }
  const fakeRes = () => {
    const h: Record<string, string> = {};
    return { h, header(n: string, v: string) { h[n] = v; return this; } } as any;
  };

  it('opens a context visible to async code downstream', async () => {
    const req = fakeReq({ 'x-request-id': 'abc-123' });
    const res = fakeRes();
    let seen: any;
    await requestContext()(req, res, async () => {
      await tick();
      req.locals.user = { id: 'u1', tenantId: 'acme' }; // auth runs later
      seen = getContext();
    });
    expect(seen.requestId).toBe('abc-123');
    expect(seen.user.id).toBe('u1');
    expect(seen.tenantId).toBe('acme');
    expect(res.h['x-request-id']).toBe('abc-123');
    expect(getContext()).toBeUndefined();
  });

  it('ignores malformed incoming IDs', async () => {
    const req = fakeReq({ 'x-request-id': 'bad id\r\nSet-Cookie: x' });
    await requestContext()(req, fakeRes(), () => {});
    expect(req.locals.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

// ─── redaction ────────────────────────────────────────────────────────────────

describe('redact', () => {
  class User {
    @tRedact({ strategy: 'remove' }) password = 'hunter2';
    @tRedact({ strategy: 'mask', visibleChars: 4 }) card = '4111111111114242';
    @tRedact({ strategy: 'hash' }) ssn = '123-45-6789';
    @tSensitive('PII') email = 'a@b.c';
    name = 'Ann';
  }

  it('applies tRedact strategies and masks tSensitive by default', () => {
    const u = new User();
    const out: any = redact({ user: u, list: [u] });
    expect(out.user).toEqual({
      card: '************4242',
      ssn: expect.stringMatching(/^sha256:[0-9a-f]{16}$/),
      email: '***',
      name: 'Ann'
    });
    expect(out.list[0]).toEqual(out.user);
    expect(u.password).toBe('hunter2'); // input untouched
  });

  it('keeps tSensitive with includeSensitive: false, and supports field rules', () => {
    const out: any = redact({ u: new User(), authorization: 'Bearer x' }, {
      includeSensitive: false,
      fields: { authorization: 'mask' }
    });
    expect(out.u.email).toBe('a@b.c');
    expect(out.authorization).toBe('***');
  });

  it('handles cycles', () => {
    const a: any = { name: 'a' };
    a.self = a;
    expect(redact(a)).toEqual({ name: 'a', self: '[Circular]' });
  });

  it('redactingTransport redacts log entries', () => {
    const written: any[] = [];
    const t = redactingTransport({ write: (e: any) => written.push(e) }, { fields: { token: 'remove' } });
    t.write({ level: 'info', message: 'login', user: new User(), token: 'secret' });
    expect(written[0].token).toBeUndefined();
    expect(written[0].user.password).toBeUndefined();
  });
});

// ─── end to end over HTTP ─────────────────────────────────────────────────────

describe('integration with @axiljs/core', () => {
  class Profile {
    @tRedact({ strategy: 'remove' }) passwordHash = 'scrypt$...';
    @tSensitive('PII') email = 'ann@example.com';
    id = 1;
  }

  class ProfileService {
    @tAudit({ action: 'profile.read' })
    async load() {
      return { profile: new Profile(), requestId: getContext()?.requestId };
    }
  }
  wire(ProfileService);

  it('carries context into services and redacts envelope and json bodies', async () => {
    const app = new Application();
    app.use(requestContext());
    app.use(redactResponses());
    app.use((req, _res, next) => { req.locals.user = { id: 'u9' }; next(); });
    const svc = new ProfileService();
    app.get('/me', async (_req, res) => res.success(await svc.load()));
    app.get('/raw', async (_req, res) => res.json(new Profile()));

    const client = createTestClient(app);
    const me = await client.get('/me').set('x-request-id', 'r-42');
    expect(me.status).toBe(200);
    expect(me.body.data).toEqual({
      profile: { email: 'ann@example.com', id: 1 },
      requestId: 'r-42'
    });

    const raw = await client.get('/raw');
    expect(raw.body).toEqual({ email: 'ann@example.com', id: 1 });

    await tick();
    const ev = events.find(e => e.type === 'audit.log')!.payload;
    expect(ev).toMatchObject({ action: 'profile.read', requestId: 'r-42', actor: { id: 'u9' } });
  });
});
