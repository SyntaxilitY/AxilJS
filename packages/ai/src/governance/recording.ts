/**
 * recordingProvider() / replayProvider() - deterministic AI tests.
 *
 *   // once, against the real API:
 *   const ai = recordingProvider(new OpenAIProvider({ apiKey }), { file: 'tests/fixtures/chat.json' })
 *
 *   // in CI, no network:
 *   const ai = replayProvider({ file: 'tests/fixtures/chat.json' })
 *
 * Requests are keyed by a SHA-256 hash of the normalized request (kind,
 * model, system, messages, tools, toolChoice, temperature, maxTokens,
 * stopSequences, topP), so the same call always finds the same recording.
 * Streams are recorded as their full chunk list and replayed as an async
 * iterable. Signals and timeouts are not part of the key.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AIProvider, CompletionOptions, CompletionResponse, CompletionStream,
  EmbeddingOptions, EmbeddingResponse, StreamChunk
} from '../types';
import { AIReplayMissError } from './errors';

// ─── Fixture format ───────────────────────────────────────────────────────────

export type RecordedKind = 'complete' | 'stream' | 'embed';

export interface RecordedEntry {
  kind: RecordedKind;
  request: Record<string, unknown>;
  response?: CompletionResponse | EmbeddingResponse;
  chunks?: StreamChunk[];
  recordedAt: string;
}

export interface RecordingFile {
  version: 1;
  entries: Record<string, RecordedEntry>;
}

export interface RecordingOptions {
  // JSON fixture path (created with parent directories; existing entries kept)
  file: string;
}

export interface ReplayOptions {
  file: string;

  // true (default): an unrecorded request throws AIReplayMissError.
  // false: it goes to `fallback` (and is recorded into the file), or, with
  // no fallback, gets an empty 'stop' response.
  strict?: boolean;

  // Provider used for misses when strict is false
  fallback?: AIProvider;

  // Reported as the provider's name / defaultModel (default: 'replay')
  name?: string;
  defaultModel?: string;
}

// ─── Hashing ──────────────────────────────────────────────────────────────────

/** JSON with sorted object keys and undefined values dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(v => (v === undefined ? null : sortKeys(v)));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined && typeof v !== 'function') out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** The part of a request that determines its response. */
export function normalizeRequest(kind: RecordedKind, options: CompletionOptions | EmbeddingOptions): Record<string, unknown> {
  if (kind === 'embed') {
    const o = options as EmbeddingOptions;
    return sortKeys({ kind, model: o.model ?? null, input: o.input }) as Record<string, unknown>;
  }
  const o = options as CompletionOptions;
  return sortKeys({
    // complete and stream share a key space only if the caller asks the same
    // thing; keep them apart since their recorded shapes differ
    kind,
    model: o.model ?? null,
    system: o.system ?? null,
    messages: o.messages.map(m => ({
      role: m.role,
      content: m.content,
      name: m.name,
      toolCallId: m.toolCallId,
      toolCalls: m.toolCalls
    })),
    tools: o.tools ?? null,
    toolChoice: o.toolChoice ?? null,
    temperature: o.temperature ?? null,
    maxTokens: o.maxTokens ?? null,
    stopSequences: o.stopSequences ?? null,
    topP: o.topP ?? null
  }) as Record<string, unknown>;
}

/** Stable hash of a request (hex, 32 chars). */
export function requestKey(kind: RecordedKind, options: CompletionOptions | EmbeddingOptions): string {
  return createHash('sha256').update(canonicalJson(normalizeRequest(kind, options))).digest('hex').slice(0, 32);
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

function readFixture(file: string): RecordingFile {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, entries: {} };
    throw err;
  }
  const data = JSON.parse(raw) as RecordingFile;
  if (!data || typeof data !== 'object' || !data.entries) {
    throw new Error(`Invalid AI recording file: ${file}`);
  }
  return data;
}

function writeFixture(file: string, data: RecordingFile): void {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

class Fixture {
  private data: RecordingFile | undefined;
  constructor(readonly file: string) {}

  load(): RecordingFile {
    if (!this.data) this.data = readFixture(this.file);
    return this.data;
  }

  get(key: string): RecordedEntry | undefined {
    return this.load().entries[key];
  }

  put(key: string, entry: RecordedEntry): void {
    // Re-read so several recorders sharing a file do not drop each other's entries
    const fresh = readFixture(this.file);
    fresh.entries[key] = entry;
    writeFixture(this.file, fresh);
    this.data = fresh;
  }
}

function strip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// ─── recordingProvider ────────────────────────────────────────────────────────

/**
 * Pass calls through to `provider` and save each request/response pair to
 * `options.file`. A recording with the same key is overwritten.
 */
export function recordingProvider(provider: AIProvider, options: RecordingOptions): AIProvider {
  const fixture = new Fixture(options.file);
  return recorder(provider, fixture, provider.name, provider.defaultModel);
}

function recorder(provider: AIProvider, fixture: Fixture, name: string, defaultModel: string): AIProvider {
  const save = (kind: RecordedKind, opts: CompletionOptions | EmbeddingOptions, extra: Partial<RecordedEntry>): void => {
    fixture.put(requestKey(kind, opts), {
      kind,
      request: normalizeRequest(kind, opts),
      ...extra,
      recordedAt: new Date().toISOString()
    });
  };

  return {
    name,
    defaultModel,

    async complete(opts: CompletionOptions): Promise<CompletionResponse> {
      const res = await provider.complete(opts);
      save('complete', opts, { response: strip(res) });
      return res;
    },

    async *stream(opts: CompletionOptions): CompletionStream {
      const chunks: StreamChunk[] = [];
      let finished = false;
      for await (const chunk of provider.stream(opts)) {
        chunks.push(strip(chunk));
        if (chunk.done) finished = true;
        yield chunk;
      }
      // Only complete streams are recorded; a consumer that stops early
      // (or a provider error) leaves the fixture untouched.
      if (finished) save('stream', opts, { chunks });
    },

    async embed(opts: EmbeddingOptions): Promise<EmbeddingResponse> {
      const res = await provider.embed(opts);
      save('embed', opts, { response: strip(res) });
      return res;
    }
  };
}

// ─── replayProvider ───────────────────────────────────────────────────────────

/**
 * Serve recorded responses from `options.file` without any network access.
 */
export function replayProvider(options: ReplayOptions): AIProvider {
  const fixture = new Fixture(options.file);
  const strict = options.strict !== false;
  const name = options.name ?? 'replay';
  const defaultModel = options.defaultModel ?? options.fallback?.defaultModel ?? 'replay';
  const live = options.fallback && !strict
    ? recorder(options.fallback, fixture, name, defaultModel)
    : undefined;

  function lookup(kind: RecordedKind, opts: CompletionOptions | EmbeddingOptions): RecordedEntry | undefined {
    const key = requestKey(kind, opts);
    const entry = fixture.get(key);
    if (entry) return entry;
    if (strict) throw missError(kind, key, opts, options.file);
    return undefined;
  }

  const emptyResponse = (opts: CompletionOptions): CompletionResponse => ({
    content: '',
    finishReason: 'stop',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    model: opts.model ?? defaultModel
  });

  return {
    name,
    defaultModel,

    async complete(opts: CompletionOptions): Promise<CompletionResponse> {
      const entry = lookup('complete', opts);
      if (entry?.response) return strip(entry.response as CompletionResponse);
      if (live) return live.complete(opts);
      return emptyResponse(opts);
    },

    async *stream(opts: CompletionOptions): CompletionStream {
      const entry = lookup('stream', opts);
      if (entry?.chunks) {
        for (const chunk of entry.chunks) yield strip(chunk);
        return;
      }
      if (live) {
        yield* live.stream(opts);
        return;
      }
      yield { delta: '', done: true, response: emptyResponse(opts) };
    },

    async embed(opts: EmbeddingOptions): Promise<EmbeddingResponse> {
      const entry = lookup('embed', opts);
      if (entry?.response) return strip(entry.response as EmbeddingResponse);
      if (live) return live.embed(opts);
      const n = Array.isArray(opts.input) ? opts.input.length : 1;
      return { embeddings: Array.from({ length: n }, () => []), model: opts.model ?? defaultModel, usage: { totalTokens: 0 } };
    }
  };
}

function missError(kind: RecordedKind, key: string, opts: CompletionOptions | EmbeddingOptions, file: string): AIReplayMissError {
  let summary: string;
  if (kind === 'embed') {
    const input = (opts as EmbeddingOptions).input;
    summary = `input ${JSON.stringify(Array.isArray(input) ? input[0] : input)}`;
  } else {
    const o = opts as CompletionOptions;
    const last = [...o.messages].reverse().find(m => m.role === 'user') ?? o.messages[o.messages.length - 1];
    summary = `${o.messages.length} message(s), last ${last?.role ?? 'none'}: ${JSON.stringify(last?.content ?? '')}`;
  }
  if (summary.length > 160) summary = summary.slice(0, 157) + '...';
  const model = (opts as { model?: string }).model ?? '(default)';
  return new AIReplayMissError(
    `No recorded ${kind} response for request ${key} (model ${model}; ${summary}) in ${file}. ` +
    `Record it with recordingProvider(provider, { file }) or replay with strict: false.`,
    key,
    file
  );
}
