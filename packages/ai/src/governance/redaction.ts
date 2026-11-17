/**
 * withRedaction() - keep personal data and secrets away from the model.
 *
 *   const ai = withRedaction(provider, { mode: 'tokenize', restore: true })
 *
 * Every outgoing message (any role), the system prompt, tool-call arguments
 * and embedding inputs are scanned before the provider sees them:
 *   - 'mask'      replaces matches with [EMAIL], [CARD], ...
 *   - 'tokenize'  replaces matches with stable placeholders (‹EMAIL_1›); with
 *                 restore: true the placeholders in the model's answer are
 *                 mapped back, so users see their data and the LLM never does
 *   - 'block'     rejects the call with AIPolicyViolationError
 *
 * Detectors are deliberately conservative (card numbers must pass Luhn,
 * IBANs must pass mod-97, phone numbers need separators or a leading +)
 * to keep false positives low. They are pattern-based and will not catch
 * every form of personal data (names, addresses, free-form identifiers).
 */

import {
  AIProvider, CompletionOptions, CompletionResponse, CompletionStream,
  EmbeddingOptions, EmbeddingResponse, Message, StreamChunk, ToolCall
} from '../types';
import { AIPolicyViolationError } from './errors';

// ─── Public types ─────────────────────────────────────────────────────────────

export type RedactionDetector = 'email' | 'phone' | 'card' | 'iban' | 'ssn' | 'apiKey' | 'jwt' | 'ipv4';
export type RedactionMode = 'mask' | 'tokenize' | 'block';

export interface RedactionFinding {
  // Detector that matched ('custom' for user patterns)
  type: RedactionDetector | 'custom';

  // Where it matched: 'system', 'messages[3]', 'messages[3].toolCalls', 'input[0]'
  location: string;
}

export interface RedactionEvent {
  mode: RedactionMode;

  // One entry per match; matched values are never included
  findings: RedactionFinding[];

  // Count per detector type
  counts: Partial<Record<RedactionDetector | 'custom', number>>;
}

export interface RedactionOptions {
  // Detectors to run (default: all)
  detect?: RedactionDetector[];

  // Extra patterns, reported as type 'custom' and masked as [REDACTED]
  custom?: RegExp[];

  mode: RedactionMode;

  // tokenize mode: map placeholders in the response back to the originals
  restore?: boolean;

  // Called whenever something was found (also in block mode, before throwing)
  onRedact?: (event: RedactionEvent) => void;
}

// ─── Detectors ────────────────────────────────────────────────────────────────

interface Detector {
  type: RedactionDetector | 'custom';
  label: string;
  pattern: RegExp;
  validate?: (match: string) => boolean;
}

/** Luhn checksum over the digits of `value` (separators ignored). */
export function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** ISO 13616 IBAN mod-97 check (spaces ignored). */
export function ibanValid(value: string): boolean {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const part = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const digit of part) rem = (rem * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

// Order matters: specific token formats first so e.g. a JWT is not half-eaten
// by another detector.
const BUILTIN: Detector[] = [
  {
    type: 'jwt', label: 'JWT',
    pattern: /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{10,}/g
  },
  {
    type: 'apiKey', label: 'API_KEY',
    pattern: new RegExp([
      'sk-(?:proj-|ant-[a-z0-9]+-)?[A-Za-z0-9_-]{20,}',   // OpenAI / Anthropic
      '(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}',      // Stripe
      'AKIA[0-9A-Z]{16}',                                 // AWS access key id
      'gh[pousr]_[A-Za-z0-9]{36,}',                       // GitHub tokens
      'github_pat_[A-Za-z0-9_]{22,}',
      'xox[abprs]-[A-Za-z0-9-]{10,}',                     // Slack
      'AIza[0-9A-Za-z_-]{35}'                             // Google API key
    ].map(p => `(?<![A-Za-z0-9_-])${p}`).join('|'), 'g')
  },
  {
    type: 'email', label: 'EMAIL',
    pattern: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}\b/g
  },
  {
    type: 'iban', label: 'IBAN',
    pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g,
    validate: ibanValid
  },
  {
    type: 'card', label: 'CARD',
    pattern: /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g,
    // Major network prefixes (2-6) plus Luhn; rules out e.g. epoch-ms timestamps
    validate: m => /^[2-6]/.test(m) && luhnValid(m)
  },
  {
    type: 'ssn', label: 'SSN',
    // US SSN, dashed form only; excludes 000/666/9xx areas, 00 group, 0000 serial
    pattern: /(?<![\d-])(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?![\d-])/g
  },
  {
    type: 'ipv4', label: 'IP',
    pattern: /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\.?\d)/g
  },
  {
    type: 'phone', label: 'PHONE',
    // +CC with optional separators, or grouped national formats such as
    // (555) 123-4567 / 555-123-4567. Bare digit runs are not matched.
    pattern: /(?<![\w+.-]|\d[ .-])(?:\+\d{1,3}[ .-]?(?:\(\d{1,4}\)[ .-]?)?\d{2,4}(?:[ .-]?\d{2,4}){1,4}|(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])\d{3,4}[ .-]\d{3,4})(?![\w-]|[ .-]\d)/g,
    validate: m => {
      const n = m.replace(/\D/g, '').length;
      return n >= 8 && n <= 15;
    }
  }
];

function buildDetectors(options: RedactionOptions): Detector[] {
  const wanted = options.detect ? new Set(options.detect) : undefined;
  for (const d of options.detect ?? []) {
    if (!BUILTIN.some(b => b.type === d)) throw new Error(`withRedaction: unknown detector "${d}"`);
  }
  const list = BUILTIN.filter(d => !wanted || wanted.has(d.type as RedactionDetector));
  for (const re of options.custom ?? []) {
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    list.push({ type: 'custom', label: 'REDACTED', pattern: new RegExp(re.source, flags) });
  }
  return list;
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

const OPEN = '‹';  // ‹
const CLOSE = '›'; // ›

/**
 * Per-request redaction state. In tokenize mode the same value always gets
 * the same placeholder, and numbering follows the order of appearance, so
 * identical requests produce identical redacted requests.
 */
class Redactor {
  readonly findings: RedactionFinding[] = [];
  private byValue = new Map<string, string>();
  readonly byToken = new Map<string, string>();
  private counters = new Map<string, number>();

  constructor(private detectors: Detector[], private mode: RedactionMode) {}

  scan(text: string, location: string): string {
    if (!text) return text;
    let out = text;
    for (const d of this.detectors) {
      d.pattern.lastIndex = 0;
      out = out.replace(d.pattern, (match: string) => {
        if (d.validate && !d.validate(match)) return match;
        this.findings.push({ type: d.type, location });
        return this.replacement(d, match);
      });
    }
    return out;
  }

  private replacement(d: Detector, value: string): string {
    if (this.mode !== 'tokenize') return `[${d.label}]`;
    const existing = this.byValue.get(value);
    if (existing) return existing;
    const n = (this.counters.get(d.label) ?? 0) + 1;
    this.counters.set(d.label, n);
    const token = `${OPEN}${d.label}_${n}${CLOSE}`;
    this.byValue.set(value, token);
    this.byToken.set(token, value);
    return token;
  }

  // Deep-scan string values of a JSON-like structure
  scanDeep<T>(value: T, location: string): T {
    if (typeof value === 'string') return this.scan(value, location) as unknown as T;
    if (Array.isArray(value)) return value.map(v => this.scanDeep(v, location)) as unknown as T;
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = this.scanDeep(v, location);
      return out as T;
    }
    return value;
  }

  restore(text: string): string {
    if (!text || !this.byToken.size || !text.includes(OPEN)) return text;
    return text.replace(/‹[A-Z_]+_\d+›/g, t => this.byToken.get(t) ?? t);
  }

  restoreDeep<T>(value: T): T {
    if (typeof value === 'string') return this.restore(value) as unknown as T;
    if (Array.isArray(value)) return value.map(v => this.restoreDeep(v)) as unknown as T;
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = this.restoreDeep(v);
      return out as T;
    }
    return value;
  }

  event(): RedactionEvent {
    const counts: RedactionEvent['counts'] = {};
    for (const f of this.findings) counts[f.type] = (counts[f.type] ?? 0) + 1;
    return { mode: this.mode, findings: [...this.findings], counts };
  }
}

/**
 * Redact a standalone string with the same detectors withRedaction uses.
 * Returns the redacted text and what was found.
 */
export function redactText(
  text: string,
  options: Omit<RedactionOptions, 'restore' | 'onRedact'> = { mode: 'mask' }
): { text: string; findings: RedactionFinding[] } {
  const r = new Redactor(buildDetectors(options), options.mode === 'block' ? 'mask' : options.mode);
  return { text: r.scan(text, 'text'), findings: r.findings };
}

// ─── withRedaction ────────────────────────────────────────────────────────────

/**
 * Wrap a provider so sensitive data is masked, tokenized or blocked before
 * any request leaves the process.
 */
export function withRedaction(provider: AIProvider, options: RedactionOptions): AIProvider {
  if (!['mask', 'tokenize', 'block'].includes(options.mode)) {
    throw new Error(`withRedaction: unknown mode "${String(options.mode)}"`);
  }
  const detectors = buildDetectors(options);
  const restoring = options.mode === 'tokenize' && options.restore === true;

  function finish(r: Redactor): void {
    if (!r.findings.length) return;
    const event = r.event();
    options.onRedact?.(event);
    if (options.mode === 'block') {
      throw new AIPolicyViolationError({
        types: Object.keys(event.counts),
        locations: [...new Set(event.findings.map(f => f.location))]
      });
    }
  }

  function redactCompletion(opts: CompletionOptions): { opts: CompletionOptions; r: Redactor } {
    const r = new Redactor(detectors, options.mode);
    const messages: Message[] = opts.messages.map((m, i) => {
      const loc = `messages[${i}]`;
      const copy: Message = { ...m, content: r.scan(m.content, loc) };
      if (m.toolCalls) {
        copy.toolCalls = m.toolCalls.map(tc => ({ ...tc, arguments: r.scanDeep(tc.arguments, `${loc}.toolCalls`) }));
      }
      return copy;
    });
    const next: CompletionOptions = { ...opts, messages };
    if (opts.system !== undefined) next.system = r.scan(opts.system, 'system');
    finish(r);
    return { opts: next, r };
  }

  function restoreResponse(res: CompletionResponse, r: Redactor): CompletionResponse {
    if (!restoring || !r.byToken.size) return res;
    const out: CompletionResponse = { ...res, content: r.restore(res.content) };
    if (res.toolCalls) out.toolCalls = res.toolCalls.map((tc: ToolCall) => ({ ...tc, arguments: r.restoreDeep(tc.arguments) }));
    return out;
  }

  return {
    name: provider.name,
    defaultModel: provider.defaultModel,

    async complete(opts: CompletionOptions): Promise<CompletionResponse> {
      const { opts: call, r } = redactCompletion(opts);
      return restoreResponse(await provider.complete(call), r);
    },

    async *stream(opts: CompletionOptions): CompletionStream {
      const { opts: call, r } = redactCompletion(opts);
      if (!restoring || !r.byToken.size) {
        yield* provider.stream(call);
        return;
      }
      // A placeholder can be split across deltas: hold back text from an
      // unclosed '‹' until it closes (or clearly is not a placeholder).
      let pending = '';
      for await (const chunk of provider.stream(call)) {
        let text = pending + (chunk.delta ?? '');
        pending = '';
        const open = text.lastIndexOf(OPEN);
        if (!chunk.done && open !== -1 && text.indexOf(CLOSE, open) === -1 && text.length - open <= 40) {
          pending = text.slice(open);
          text = text.slice(0, open);
        }
        const out: StreamChunk = { ...chunk, delta: r.restore(text) };
        if (chunk.toolCallDelta?.arguments) {
          out.toolCallDelta = { ...chunk.toolCallDelta, arguments: r.restoreDeep(chunk.toolCallDelta.arguments) };
        }
        if (chunk.toolCallArgumentsDelta) out.toolCallArgumentsDelta = r.restore(chunk.toolCallArgumentsDelta);
        if (chunk.response) out.response = restoreResponse(chunk.response, r);
        if (out.delta || out.done || out.toolCallDelta || out.toolCallArgumentsDelta || out.response) yield out;
      }
      if (pending) yield { delta: r.restore(pending), done: false };
    },

    async embed(opts: EmbeddingOptions): Promise<EmbeddingResponse> {
      const r = new Redactor(detectors, options.mode);
      const input = Array.isArray(opts.input)
        ? opts.input.map((s, i) => r.scan(s, `input[${i}]`))
        : r.scan(opts.input, 'input');
      finish(r);
      return provider.embed({ ...opts, input });
    }
  };
}
