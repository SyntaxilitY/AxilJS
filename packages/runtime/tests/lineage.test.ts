import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tSensitive, tRedact } from '@axiljs/decorator';
import { createTestClient } from '@axiljs/testing';
import { Application } from '../../core/src';
import {
  runWithContext,
  requestContext,
  configureIntent,
  getIntentViolations,
  clearIntentViolations,
  IntentViolationError,
  redact,
  redactingTransport,
  trackSensitive,
  checkSink,
  allowSensitive,
  configureLineage,
  resetLineage,
  trackedSensitiveOrigins
} from '../src';

const OBSERVE = Symbol.for('axiljs.sensitive.observe');
const SINK = Symbol.for('axiljs.sensitive.sink');

class User {
  id = 7;
  name = 'Ann';
  @tSensitive('PII') email = 'ann@example.com';
  @tSensitive('PCI') card = 4242424242424242;
  @tRedact({ strategy: 'remove' }) passwordHash = 'scrypt$abcdef';
  @tSensitive('PII') nickname = 'Al';
}

const sink = (name: string, payload: unknown, target?: string) =>
  (globalThis as any)[SINK](name, payload, target);

beforeEach(() => {
  configureIntent({ mode: 'enforce' });
  clearIntentViolations();
  resetLineage();
});

afterEach(() => {
  configureIntent({ mode: 'enforce' });
});

describe('sources', () => {
  it('publishes the observe and sink hooks', () => {
    expect((globalThis as any)[OBSERVE]).toBe(trackSensitive);
    expect((globalThis as any)[SINK]).toBe(checkSink);
  });

  it('is a no-op outside a request context', () => {
    trackSensitive(new User());
    expect(trackedSensitiveOrigins()).toEqual([]);
    expect(checkSink('response', { email: 'ann@example.com' })).toEqual([]);
    expect(getIntentViolations()).toHaveLength(0);
  });

  it('tracks tSensitive and tRedact fields of class instances', () => {
    runWithContext({}, () => {
      trackSensitive(new User());
      expect(trackedSensitiveOrigins().sort()).toEqual(['User.card', 'User.email', 'User.passwordHash']);
    });
  });

  it('reads plain rows through the entity hint and column map', () => {
    runWithContext({}, () => {
      (globalThis as any)[OBSERVE](
        [{ id: 1, email_address: 'row@example.com' }],
        { entity: User, columns: { email: 'email_address' } }
      );
      expect(trackedSensitiveOrigins()).toEqual(['User.email']);
      configureIntent({ mode: 'warn' });
      expect(checkSink('log', 'sent to row@example.com')).toHaveLength(1);
    });
  });

  it('walks nested and cyclic structures', () => {
    runWithContext({}, () => {
      const wrapper: any = { page: { items: [new User()] } };
      wrapper.self = wrapper;
      wrapper.page.parent = wrapper;
      trackSensitive(new Map([['k', wrapper]]));
      expect(trackedSensitiveOrigins()).toContain('User.email');

      const payload: any = { deep: { list: [{ text: 'mail ann@example.com' }] } };
      payload.deep.loop = payload;
      expect(() => checkSink('response', payload)).toThrow(IntentViolationError);
    });
  });

  it('ignores short values (threshold avoids false positives)', () => {
    runWithContext({}, () => {
      trackSensitive(new User()); // nickname 'Al' is too short
      expect(trackedSensitiveOrigins()).not.toContain('User.nickname');
      expect(checkSink('response', { greeting: 'Al' })).toEqual([]);

      class Pin { @tSensitive('SECRET') pin = 123; @tSensitive('SECRET') code = 9876 }
      trackSensitive(new Pin());
      expect(trackedSensitiveOrigins()).toEqual(expect.arrayContaining(['Pin.code']));
      expect(trackedSensitiveOrigins()).not.toContain('Pin.pin');
    });
  });

  it('matches numbers only on digit boundaries', () => {
    configureIntent({ mode: 'warn' });
    runWithContext({}, () => {
      class Pin { @tSensitive('SECRET') code = 9876 }
      trackSensitive(new Pin());
      expect(checkSink('response', { id: 198765, ref: 'x98761' })).toEqual([]);
      expect(checkSink('response', { code: 9876 })).toHaveLength(1);
      expect(checkSink('log', 'pin was 9876.')).toHaveLength(1);
    });
  });

  it('caps the number of tracked values', () => {
    configureLineage({ maxValues: 2 });
    runWithContext({}, () => {
      trackSensitive(new User());
      expect(trackedSensitiveOrigins()).toHaveLength(2);
    });
  });
});

describe('sinks', () => {
  for (const name of ['response', 'log', 'event', 'queue', 'ai']) {
    it(`reports a leak to the '${name}' sink`, () => {
      runWithContext({}, () => {
        trackSensitive(new User());
        let error: unknown;
        try {
          sink(name, { nested: { value: 'ann@example.com' } });
        } catch (err) {
          error = err;
        }
        expect(error).toBeInstanceOf(IntentViolationError);
        const v = getIntentViolations()[0];
        expect(v).toMatchObject({ decorator: 'tSensitive', target: name, detail: `User.email (PII) reached ${name}` });
        expect(JSON.stringify(v)).not.toContain('ann@example.com');
        expect((error as Error).message).not.toContain('ann@example.com');
      });
    });
  }

  it('names every leaking origin once and uses the given target', () => {
    configureIntent({ mode: 'warn' });
    runWithContext({}, () => {
      trackSensitive([new User(), new User()]);
      const leaks = checkSink('ai', [{ role: 'user', content: 'ann@example.com 4242424242424242 ann@example.com' }], 'Chat.ask');
      expect(leaks).toEqual([
        { origin: 'User.email', classification: 'PII', sink: 'ai' },
        { origin: 'User.card', classification: 'PCI', sink: 'ai' }
      ]);
      expect(getIntentViolations()[0]).toMatchObject({
        target: 'Chat.ask',
        detail: 'User.email (PII), User.card (PCI) reached ai'
      });
    });
  });

  it('finds values in serialized JSON text (escaped forms too)', () => {
    configureIntent({ mode: 'warn' });
    runWithContext({}, () => {
      class Note { @tSensitive('PII') body = 'say "hello" to Ann' }
      trackSensitive(new Note());
      expect(checkSink('response', JSON.stringify({ text: 'say "hello" to Ann' }))).toHaveLength(1);
      expect(checkSink('response', Buffer.from('raw: say "hello" to Ann'))).toHaveLength(1);
    });
  });

  it('lets redacted values pass', () => {
    runWithContext({}, () => {
      trackSensitive(new User());
      expect(checkSink('log', redact(new User()))).toEqual([]);
      // tRedact-only redaction keeps the email, so that still leaks
      expect(() => checkSink('log', redact(new User(), { includeSensitive: false }))).toThrow(IntentViolationError);
    });
  });

  it('warn mode records, does not throw, and returns the leaks', () => {
    configureIntent({ mode: 'warn' });
    const warn = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    runWithContext({}, () => {
      trackSensitive(new User());
      expect(checkSink('event', { to: 'ann@example.com' })).toHaveLength(1);
      expect(checkSink('event', { to: 'ann@example.com' })).toHaveLength(1);
    });
    expect(getIntentViolations()).toHaveLength(2);
    expect(warn.mock.calls.filter(c => String(c[1]) === 'IntentViolationWarning')).toHaveLength(1);
    warn.mockRestore();
  });

  it('off mode disables the checks', () => {
    configureIntent({ mode: 'off' });
    runWithContext({}, () => {
      trackSensitive(new User());
      expect(checkSink('response', 'ann@example.com')).toEqual([]);
    });
    expect(getIntentViolations()).toHaveLength(0);
  });

  it('configureLineage({ enabled: false }) disables tracking', () => {
    configureLineage({ enabled: false });
    runWithContext({}, () => {
      trackSensitive(new User());
      expect(trackedSensitiveOrigins()).toEqual([]);
    });
  });

  it('keeps taint per request', async () => {
    await runWithContext({}, async () => trackSensitive(new User()));
    runWithContext({}, () => {
      expect(checkSink('response', 'ann@example.com')).toEqual([]);
    });
  });

  it('redactingTransport checks after redaction and reports once', () => {
    configureIntent({ mode: 'warn' });
    const written: unknown[] = [];
    // An inner transport that checks the 'log' sink itself, like ConsoleTransport
    const inner = { write(entry: object) { sink('log', entry); written.push(entry); } };
    runWithContext({}, () => {
      trackSensitive(new User());
      redactingTransport(inner).write({ message: 'login', user: new User() });
      expect(getIntentViolations()).toHaveLength(0);

      redactingTransport(inner, { includeSensitive: false }).write({ message: 'login', user: new User() });
      expect(getIntentViolations()).toHaveLength(1);
      expect(written).toHaveLength(2);
    });
  });
});

describe('allowing', () => {
  it('allowSensitive(sinks, fn) allows only inside fn', async () => {
    await runWithContext({}, async () => {
      trackSensitive(new User());
      const out = await allowSensitive('response', async () => {
        await Promise.resolve();
        return checkSink('response', 'ann@example.com');
      });
      expect(out).toEqual([]);
      allowSensitive(['log'], () => {
        // Nested scopes add to the outer ones; other sinks stay checked
        allowSensitive('event', () => {
          expect(checkSink('log', 'ann@example.com')).toEqual([]);
          expect(checkSink('event', 'ann@example.com')).toEqual([]);
          expect(() => checkSink('queue', 'ann@example.com')).toThrow(IntentViolationError);
        });
      });
      expect(() => checkSink('response', 'ann@example.com')).toThrow(IntentViolationError);
    });
  });

  it('allowSensitive(sinks) allows for the rest of the request', () => {
    runWithContext({}, () => {
      trackSensitive(new User());
      allowSensitive('response');
      expect(checkSink('response', 'ann@example.com')).toEqual([]);
      expect(() => checkSink('log', 'ann@example.com')).toThrow(IntentViolationError);
    });
    allowSensitive('*'); // outside a context: no-op
  });

  it('configureLineage allow-list by origin, class wildcard and classification', () => {
    configureLineage({ allow: { response: ['User.email'], log: ['User.*'], ai: ['PCI'] } });
    configureIntent({ mode: 'warn' });
    runWithContext({}, () => {
      trackSensitive(new User());
      expect(checkSink('response', 'ann@example.com')).toEqual([]);
      expect(checkSink('response', '4242424242424242')).toHaveLength(1);
      expect(checkSink('log', 'ann@example.com 4242424242424242')).toEqual([]);
      expect(checkSink('ai', '4242424242424242')).toEqual([]);
      expect(checkSink('ai', 'ann@example.com')).toHaveLength(1);
    });
    resetLineage();
    runWithContext({}, () => {
      trackSensitive(new User());
      expect(checkSink('response', 'ann@example.com')).toHaveLength(1);
    });
  });
});

describe('end to end with @axiljs/core', () => {
  const quiet = () => vi.spyOn(console, 'log').mockImplementation(() => {});

  function app() {
    const a = new Application({ logging: false } as any);
    a.use(requestContext());
    a.get('/users/:id', async (_req, res) => {
      const user = new User();
      trackSensitive(user); // what @axiljs/orm does when it loads a row
      res.success({ id: user.id, email: user.email });
    });
    a.get('/me', async (_req, res) => {
      const user = new User();
      trackSensitive(user);
      allowSensitive('response', () => res.success({ id: user.id, email: user.email }));
    });
    a.get('/safe', async (_req, res) => {
      const user = new User();
      trackSensitive(user);
      res.success(redact(user));
    });
    return createTestClient(a as any);
  }

  it('enforce mode turns a leak into an error response without the value', async () => {
    const spy = quiet();
    const res = await app().get('/users/7');
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTENT_VIOLATION');
    expect(res.text).not.toContain('ann@example.com');
    expect(getIntentViolations()[0]).toMatchObject({
      decorator: 'tSensitive',
      target: 'GET /users/7',
      detail: 'User.email (PII) reached response'
    });
  });

  it('allowSensitive and redaction let the response through', async () => {
    const spy = quiet();
    const client = app();
    const me = await client.get('/me');
    const safe = await client.get('/safe');
    spy.mockRestore();
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('ann@example.com');
    expect(safe.status).toBe(200);
    expect(safe.text).not.toContain('ann@example.com');
    expect(getIntentViolations()).toHaveLength(0);
  });
});
