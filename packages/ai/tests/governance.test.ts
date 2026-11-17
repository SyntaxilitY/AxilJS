import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { axilError } from '@axiljs/common';
import {
  AIProvider, CompletionOptions, CompletionResponse, CompletionStream, EmbeddingOptions, EmbeddingResponse, StreamChunk
} from '../src/types';
import { withBudget, InMemoryBudgetStore, windowFor } from '../src/governance/budget';
import { withRedaction, redactText, luhnValid, ibanValid, RedactionEvent } from '../src/governance/redaction';
import { recordingProvider, replayProvider, requestKey } from '../src/governance/recording';
import { AIBudgetExceededError, AIPolicyViolationError, AIReplayMissError } from '../src/governance/errors';
import * as api from '../src/index';
import { collect } from './helpers/mock-server';

// ─── Fake provider ────────────────────────────────────────────────────────────

class FakeProvider implements AIProvider {
  readonly name = 'fake';
  readonly defaultModel = 'fake-large';
  calls: CompletionOptions[] = [];
  embedCalls: EmbeddingOptions[] = [];
  usage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };
  // Reply builder; default echoes the last message
  reply: (o: CompletionOptions) => string = o => `echo: ${o.messages[o.messages.length - 1].content}`;
  fail = false;

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    this.calls.push(options);
    if (this.fail) throw new Error('upstream down');
    return {
      content: this.reply(options),
      finishReason: 'stop',
      usage: { ...this.usage },
      model: options.model ?? this.defaultModel
    };
  }

  async *stream(options: CompletionOptions): CompletionStream {
    this.calls.push(options);
    const text = this.reply(options);
    // Deliberately awkward 3-character deltas (splits placeholders)
    for (let i = 0; i < text.length; i += 3) yield { delta: text.slice(i, i + 3), done: false };
    yield {
      delta: '',
      done: true,
      response: { content: text, finishReason: 'stop', usage: { ...this.usage }, model: options.model ?? this.defaultModel }
    };
  }

  async embed(options: EmbeddingOptions): Promise<EmbeddingResponse> {
    this.embedCalls.push(options);
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    return { embeddings: inputs.map(s => [s.length, 1]), model: options.model ?? 'fake-embed', usage: { totalTokens: 7 } };
  }
}

const user = (content: string): CompletionOptions => ({ messages: [{ role: 'user', content }] });

// ─── Budgets ──────────────────────────────────────────────────────────────────

describe('withBudget', () => {
  let fake: FakeProvider;
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    fake = new FakeProvider();
    clock = Date.UTC(2026, 10, 17, 12, 30, 15);
  });

  it('is exported from the package entry point', () => {
    expect(api.withBudget).toBe(withBudget);
    expect(api.withRedaction).toBe(withRedaction);
    expect(api.recordingProvider).toBe(recordingProvider);
    expect(api.replayProvider).toBe(replayProvider);
    expect(api.AIBudgetExceededError).toBe(AIBudgetExceededError);
  });

  it('rejects before calling the provider when the estimate exceeds the token limit', async () => {
    const ai = withBudget(fake, { limits: { window: 'minute', tokens: 100 }, scope: () => 't1', now });
    // 400 chars ~ 100 prompt tokens + 50 max output tokens > 100
    const err = await ai.complete({ ...user('x'.repeat(400)), maxTokens: 50 }).catch(e => e);

    expect(err).toBeInstanceOf(AIBudgetExceededError);
    expect(err).toBeInstanceOf(axilError);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('AI_BUDGET_EXCEEDED');
    expect(err.details).toMatchObject({ scope: 't1', window: 'minute', metric: 'tokens', limit: 100, used: 0, requested: 150 });
    expect(err.retryAfterMs).toBe(45_000);
    expect(fake.calls).toHaveLength(0);
    // The rejected reservation was rolled back
    const [usage] = await ai.getUsage('t1');
    expect(usage.used).toEqual({ tokens: 0, costUsd: 0, requests: 0 });
  });

  it('records the usage the provider actually reported, not the estimate', async () => {
    const ai = withBudget(fake, {
      limits: [{ window: 'day', tokens: 10_000 }, { window: 'month', costUsd: 1 }],
      scope: () => 'acme',
      pricing: { 'fake-large': { inputPerMTok: 1000, outputPerMTok: 2000 } },
      now
    });
    await ai.complete({ ...user('hello there'), maxTokens: 100 });

    const usage = await ai.getUsage('acme');
    expect(usage.map(u => u.window)).toEqual(['day', 'month']);
    expect(usage[0].used.tokens).toBe(30);
    expect(usage[0].used.requests).toBe(1);
    // 10 * 1000/1e6 + 20 * 2000/1e6
    expect(usage[1].used.costUsd).toBeCloseTo(0.05, 10);
    expect(usage[0].remaining.tokens).toBe(9_970);
    expect(usage[1].remaining.costUsd).toBeCloseTo(0.95, 10);
  });

  it('keeps separate counters per scope and per window', async () => {
    let tenant = 'a';
    const ai = withBudget(fake, {
      limits: [{ window: 'minute', requests: 2 }, { window: 'hour', requests: 3 }],
      scope: () => tenant,
      now
    });

    await ai.complete(user('1'));
    await ai.complete(user('2'));
    await expect(ai.complete(user('3'))).rejects.toMatchObject({ details: { window: 'minute', metric: 'requests', scope: 'a' } });

    // Tenant b is unaffected
    tenant = 'b';
    await ai.complete(user('b1'));

    // Next minute: the minute window resets, the hour window does not
    tenant = 'a';
    clock += 60_000;
    await ai.complete(user('4'));
    await expect(ai.complete(user('5'))).rejects.toMatchObject({ details: { window: 'hour', metric: 'requests' } });

    // Next hour: everything resets
    clock += 3_600_000;
    await ai.complete(user('6'));
    expect(fake.calls).toHaveLength(5);
    expect((await ai.getUsage('a')).map(u => u.used.requests)).toEqual([1, 1]);
    expect((await ai.getUsage('b'))[1].used.requests).toBe(0);
  });

  it('falls back to a cheaper model when the cost limit would be exceeded', async () => {
    const ai = withBudget(fake, {
      limits: { window: 'month', costUsd: 0.01 },
      scope: () => 't',
      pricing: {
        'fake-large': { inputPerMTok: 100_000, outputPerMTok: 100_000 },
        'fake-small': { inputPerMTok: 1, outputPerMTok: 1 }
      },
      onExceeded: 'fallback-model',
      fallbackModel: 'fake-small',
      now
    });
    const res = await ai.complete({ ...user('a fairly long question about budgets'), maxTokens: 100 });
    expect(res.model).toBe('fake-small');
    expect(fake.calls[0].model).toBe('fake-small');

    // Without fallback the same call is rejected
    const strict = withBudget(new FakeProvider(), {
      limits: { window: 'month', costUsd: 0.01 },
      pricing: { 'fake-large': { inputPerMTok: 100_000, outputPerMTok: 100_000 } },
      now
    });
    await expect(strict.complete({ ...user('a fairly long question about budgets'), maxTokens: 100 }))
      .rejects.toBeInstanceOf(AIBudgetExceededError);
  });

  it('releases the reservation when the provider fails', async () => {
    const ai = withBudget(fake, { limits: { window: 'day', requests: 1 }, scope: () => 's', now });
    fake.fail = true;
    await expect(ai.complete(user('x'))).rejects.toThrow('upstream down');
    fake.fail = false;
    await expect(ai.complete(user('x'))).resolves.toMatchObject({ content: 'echo: x' });
  });

  it('accounts streamed and embedding usage', async () => {
    const store = new InMemoryBudgetStore();
    const ai = withBudget(fake, { limits: { window: 'day', tokens: 1000 }, scope: () => 's', store, now });
    const chunks = await collect(ai.stream(user('stream me')));
    expect(chunks[chunks.length - 1].done).toBe(true);
    await ai.embed({ input: ['a', 'b'] });
    expect(store.get('s', windowFor('day', clock))).toEqual({ tokens: 37, costUsd: 0, requests: 2 });
  });

  it('matches pricing by model prefix and uses the default scope', async () => {
    const ai = withBudget(fake, {
      limits: { window: 'day', costUsd: 100 },
      pricing: { fake: { inputPerMTok: 1_000_000, outputPerMTok: 0 } },
      now
    });
    await ai.complete(user('x'));
    const [usage] = await ai.getUsage();
    expect(usage.scope).toBe('global');
    expect(usage.used.costUsd).toBe(10);
  });

  it('defaults the scope to the @axiljs/runtime tenant when a request context is active', async () => {
    const { createRequire } = await import('node:module');
    const runtime = createRequire(__filename)('@axiljs/runtime');
    const ai = withBudget(fake, { limits: { window: 'day', requests: 5 }, now });
    await runtime.runWithContext({ tenantId: 'tenant-42' }, () => ai.complete(user('x')));
    expect((await ai.getUsage('tenant-42'))[0].used.requests).toBe(1);
    expect((await ai.getUsage('global'))[0].used.requests).toBe(0);
  });

  it('validates its options', () => {
    expect(() => withBudget(fake, { limits: [] })).toThrow(/at least one limit/);
    expect(() => withBudget(fake, { limits: { window: 'day', tokens: 1 }, onExceeded: 'fallback-model' })).toThrow(/fallbackModel/);
  });
});

// ─── Redaction ────────────────────────────────────────────────────────────────

describe('withRedaction', () => {
  const cases: Array<[string, string, string]> = [
    ['email', 'mail jane.doe+work@example.co.uk now', 'mail [EMAIL] now'],
    ['phone', 'call +1 415 555 2671 or (415) 555-2671', 'call [PHONE] or [PHONE]'],
    ['card', 'card 4111 1111 1111 1111 exp', 'card [CARD] exp'],
    ['iban', 'iban DE89 3704 0044 0532 0130 00 ok', 'iban [IBAN] ok'],
    ['ssn', 'ssn 123-45-6789.', 'ssn [SSN].'],
    ['apiKey', 'key sk-proj-abcdefghijklmnopqrstuvwxyz123456 and AKIAIOSFODNN7EXAMPLE', 'key [API_KEY] and [API_KEY]'],
    ['jwt', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', 'Bearer [JWT]'],
    ['ipv4', 'from 192.168.10.254 today', 'from [IP] today']
  ];

  for (const [type, input, expected] of cases) {
    it(`masks ${type}`, () => {
      const { text, findings } = redactText(input, { mode: 'mask', detect: [type as any] });
      expect(text).toBe(expected);
      expect(findings.every(f => f.type === type)).toBe(true);
    });
  }

  it('does not flag look-alikes (Luhn, mod-97, dates, versions, order ids, timestamps)', () => {
    expect(luhnValid('4111 1111 1111 1111')).toBe(true);
    expect(luhnValid('4111 1111 1111 1112')).toBe(false);
    expect(ibanValid('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(ibanValid('DE88 3704 0044 0532 0130 00')).toBe(false);

    const benign = [
      'card 4111 1111 1111 1112 is invalid',
      'iban DE88 3704 0044 0532 0130 00',
      'released 2026-11-17, build 1700000000000',
      'order ORD-2024-123456 and invoice 12345678',
      'version 1.2.3 and 999.1.1.1',
      'ssn-like 000-12-3456 and 666-12-3456'
    ];
    for (const text of benign) {
      expect(redactText(text, { mode: 'mask' }).text).toBe(text);
    }
  });

  it('applies custom patterns', () => {
    const { text, findings } = redactText('employee EMP-00412 joined', { mode: 'mask', detect: [], custom: [/EMP-\d{5}/] });
    expect(text).toBe('employee [REDACTED] joined');
    expect(findings).toEqual([{ type: 'custom', location: 'text' }]);
  });

  it('masks every outgoing message, the system prompt and tool arguments, and reports it', async () => {
    const fake = new FakeProvider();
    const events: RedactionEvent[] = [];
    const ai = withRedaction(fake, { mode: 'mask', onRedact: e => events.push(e) });
    await ai.complete({
      system: 'Support agent. Escalate to boss@corp.com',
      messages: [
        { role: 'user', content: 'I am jane@example.com' },
        { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'lookup', arguments: { email: 'jane@example.com' } }] },
        { role: 'tool', toolCallId: '1', content: '{"card":"5555 5555 5555 4444"}' }
      ]
    });
    const sent = fake.calls[0];
    expect(sent.system).toBe('Support agent. Escalate to [EMAIL]');
    expect(sent.messages[0].content).toBe('I am [EMAIL]');
    expect(sent.messages[1].toolCalls![0].arguments).toEqual({ email: '[EMAIL]' });
    expect(sent.messages[2].content).toBe('{"card":"[CARD]"}');
    expect(events).toHaveLength(1);
    expect(events[0].counts).toEqual({ email: 3, card: 1 });
    expect(events[0].findings.map(f => f.location)).toContain('messages[1].toolCalls');
    expect(JSON.stringify(events)).not.toContain('jane@example.com');
  });

  it('tokenize + restore: the model sees placeholders, the caller sees the original data', async () => {
    const fake = new FakeProvider();
    fake.reply = o => `I will email ${o.messages[0].content.match(/‹EMAIL_\d+›/)![0]} about card ‹CARD_1›.`;
    const ai = withRedaction(fake, { mode: 'tokenize', restore: true });
    const prompt = 'Me: ann@example.org, again ann@example.org, card 4111-1111-1111-1111, cc bob@example.org';

    const res = await ai.complete(user(prompt));
    expect(fake.calls[0].messages[0].content).toBe('Me: ‹EMAIL_1›, again ‹EMAIL_1›, card ‹CARD_1›, cc ‹EMAIL_2›');
    expect(res.content).toBe('I will email ann@example.org about card 4111-1111-1111-1111.');

    // Streaming restores placeholders even when split across deltas
    const chunks = await collect(ai.stream(user(prompt)));
    const text = chunks.map(c => c.delta).join('');
    expect(text).toBe('I will email ann@example.org about card 4111-1111-1111-1111.');
    expect(chunks[chunks.length - 1].response!.content).toBe(text);
    expect(fake.calls[1].messages[0].content).toBe(fake.calls[0].messages[0].content);

    // Without restore the placeholders are returned as-is
    const raw = await withRedaction(fake, { mode: 'tokenize' }).complete(user(prompt));
    expect(raw.content).toContain('‹EMAIL_1›');
  });

  it('block mode rejects with AIPolicyViolationError and never calls the provider', async () => {
    const fake = new FakeProvider();
    const events: RedactionEvent[] = [];
    const ai = withRedaction(fake, { mode: 'block', detect: ['ssn', 'apiKey'], onRedact: e => events.push(e) });

    const err = await ai.complete(user('my ssn is 123-45-6789')).catch(e => e);
    expect(err).toBeInstanceOf(AIPolicyViolationError);
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('AI_POLICY_VIOLATION');
    expect(err.details).toEqual({ types: ['ssn'], locations: ['messages[0]'] });
    expect(err.message).not.toContain('123-45-6789');
    expect(events).toHaveLength(1);

    await expect(collect(ai.stream(user('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')))).rejects.toBeInstanceOf(AIPolicyViolationError);
    await expect(ai.embed({ input: ['fine', '123-45-6789'] })).rejects.toBeInstanceOf(AIPolicyViolationError);
    expect(fake.calls).toHaveLength(0);
    expect(fake.embedCalls).toHaveLength(0);

    // Clean content passes through
    await expect(ai.complete(user('hello'))).resolves.toMatchObject({ content: 'echo: hello' });
  });

  it('redacts embedding inputs', async () => {
    const fake = new FakeProvider();
    await withRedaction(fake, { mode: 'mask' }).embed({ input: 'contact x@y.io' });
    expect(fake.embedCalls[0].input).toBe('contact [EMAIL]');
  });
});

// ─── Record / replay ──────────────────────────────────────────────────────────

describe('recordingProvider / replayProvider', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'axil-ai-rec-'));
    file = path.join(dir, 'nested', 'fixture.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('records complete, stream and embed calls, then replays them without the provider', async () => {
    const fake = new FakeProvider();
    const rec = recordingProvider(fake, { file });
    const req: CompletionOptions = {
      model: 'fake-large',
      temperature: 0,
      messages: [{ role: 'user', content: 'What is AxilJS?' }],
      tools: [{ name: 't', description: 'd', parameters: { type: 'object', properties: {} } }]
    };
    const live = await rec.complete(req);
    const liveChunks = await collect(rec.stream({ messages: [{ role: 'user', content: 'stream it' }] }));
    const liveEmbed = await rec.embed({ input: ['a', 'bb'] });
    expect(fake.calls).toHaveLength(2);

    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(saved.version).toBe(1);
    expect(Object.keys(saved.entries)).toHaveLength(3);
    expect(saved.entries[requestKey('complete', req)].request.temperature).toBe(0);

    const replay = replayProvider({ file });
    // Same request with different key order / an AbortSignal still matches
    const again = await replay.complete({
      tools: req.tools, messages: [{ content: 'What is AxilJS?', role: 'user' }], temperature: 0, model: 'fake-large',
      signal: new AbortController().signal
    });
    expect(again).toEqual(live);

    const replayed: StreamChunk[] = [];
    for await (const chunk of replay.stream({ messages: [{ role: 'user', content: 'stream it' }] })) replayed.push(chunk);
    expect(replayed).toEqual(liveChunks);
    expect(replayed.map(c => c.delta).join('')).toBe('echo: stream it');

    expect(await replay.embed({ input: ['a', 'bb'] })).toEqual(liveEmbed);
    expect(fake.calls).toHaveLength(2);
  });

  it('strict replay names the unrecorded request', async () => {
    await recordingProvider(new FakeProvider(), { file }).complete(user('recorded'));
    const replay = replayProvider({ file, strict: true });

    const err = await replay.complete({ ...user('never recorded'), temperature: 0.2 }).catch(e => e);
    expect(err).toBeInstanceOf(AIReplayMissError);
    expect(err.message).toContain('No recorded complete response');
    expect(err.message).toContain('"never recorded"');
    expect(err.message).toContain(file);
    expect(err.key).toBe(requestKey('complete', { ...user('never recorded'), temperature: 0.2 }));

    // A different temperature is a different request
    await expect(replay.complete({ ...user('recorded'), temperature: 0.9 })).rejects.toBeInstanceOf(AIReplayMissError);
    await expect(collect(replay.stream(user('recorded')))).rejects.toBeInstanceOf(AIReplayMissError);
    // Missing file behaves like an empty fixture
    await expect(replayProvider({ file: path.join(dir, 'none.json') }).complete(user('x'))).rejects.toBeInstanceOf(AIReplayMissError);
  });

  it('non-strict replay records misses through a fallback provider', async () => {
    const fake = new FakeProvider();
    const replay = replayProvider({ file, strict: false, fallback: fake });
    expect((await replay.complete(user('new'))).content).toBe('echo: new');
    expect(fake.calls).toHaveLength(1);
    expect((await replayProvider({ file }).complete(user('new'))).content).toBe('echo: new');

    const empty = await replayProvider({ file, strict: false }).complete(user('other'));
    expect(empty).toMatchObject({ content: '', finishReason: 'stop' });
  });

  it('composes: budget(redaction(recording(provider))) records only redacted requests', async () => {
    const fake = new FakeProvider();
    const ai = withBudget(
      withRedaction(recordingProvider(fake, { file }), { mode: 'tokenize', restore: true }),
      { limits: { window: 'day', requests: 10 }, scope: () => 'tenant-1' }
    );
    const res = await ai.complete(user('reach me at amy@example.com'));
    expect(res.content).toBe('echo: reach me at amy@example.com');
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).not.toContain('amy@example.com');
    expect(raw).toContain('‹EMAIL_1›');

    // Replaying through the same wrappers reproduces the answer offline
    const offline = withRedaction(replayProvider({ file }), { mode: 'tokenize', restore: true });
    expect((await offline.complete(user('reach me at amy@example.com'))).content).toBe('echo: reach me at amy@example.com');
    expect((await ai.getUsage('tenant-1'))[0].used.requests).toBe(1);
  });
});
