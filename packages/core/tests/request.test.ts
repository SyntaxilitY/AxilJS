import { describe, it, expect } from 'vitest';
import { resolveClientIp, Request, safeDecode } from '../src/http/request';
import { parseByteSize } from '../src/application';

function raw(xff?: string | string[], remote = '10.0.0.1', url = '/') {
  return {
    method: 'get',
    url,
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    socket: { remoteAddress: remote }
  } as any;
}

describe('resolveClientIp (trustProxy)', () => {
  it('ignores X-Forwarded-For by default (no spoofing without opt-in)', () => {
    expect(new Request(raw('1.1.1.1, 2.2.2.2')).ip).toBe('10.0.0.1');
    expect(new Request(raw('1.1.1.1'), {}).ip).toBe('10.0.0.1');
  });

  it('true uses the left-most X-Forwarded-For entry', () => {
    expect(new Request(raw('1.1.1.1, 2.2.2.2'), { trustProxy: true }).ip).toBe('1.1.1.1');
    expect(resolveClientIp(raw('1.1.1.1, 2.2.2.2'), true)).toBe('1.1.1.1');
  });

  it('falls back to the socket address without the header', () => {
    expect(new Request(raw()).ip).toBe('10.0.0.1');
  });

  it('false ignores X-Forwarded-For', () => {
    expect(resolveClientIp(raw('1.1.1.1'), false)).toBe('10.0.0.1');
    expect(new Request(raw('1.1.1.1'), { trustProxy: false }).ip).toBe('10.0.0.1');
  });

  it('a number trusts that many hops', () => {
    const r = raw('client, proxy1, proxy2');
    expect(resolveClientIp(r, 0)).toBe('10.0.0.1');
    expect(resolveClientIp(r, 1)).toBe('proxy2');
    expect(resolveClientIp(r, 2)).toBe('proxy1');
    expect(resolveClientIp(r, 3)).toBe('client');
    expect(resolveClientIp(r, 99)).toBe('client');
  });

  it('a function decides per hop, from the socket outwards', () => {
    const trusted = new Set(['10.0.0.1', '10.0.0.2']);
    const fn = (addr: string) => trusted.has(addr);
    expect(resolveClientIp(raw('6.6.6.6, 5.5.5.5, 10.0.0.2'), fn)).toBe('5.5.5.5');
    expect(resolveClientIp(raw('10.0.0.2'), fn)).toBe('10.0.0.2');
  });

  it('joins repeated X-Forwarded-For headers', () => {
    expect(resolveClientIp(raw(['a, b', 'c']), 1)).toBe('c');
  });
});

describe('Request', () => {
  it('parses method, path and query (arrays, +, =, malformed escapes)', () => {
    const req = new Request(raw(undefined, '1.2.3.4', '/s?q=a+b&tag=js&tag=ts&x=1=2&bad=%E0%A4%A'));
    expect(req.method).toBe('GET');
    expect(req.path).toBe('/s');
    expect(req.query).toEqual({ q: 'a b', tag: ['js', 'ts'], x: '1=2', bad: '%E0%A4%A' });
  });

  it('does not let __proto__ in the query pollute prototypes', () => {
    const req = new Request(raw(undefined, '1.2.3.4', '/?__proto__=x&constructor=y'));
    expect(Object.getPrototypeOf(req.query)).toBe(Object.prototype);
    expect(req.query.constructor).toBe('y');
  });

  it('safeDecode handles + and bad escapes', () => {
    expect(safeDecode('a+b%20c')).toBe('a b c');
    expect(safeDecode('%zz')).toBe('%zz');
  });
});

describe('parseByteSize', () => {
  it('parses units', () => {
    expect(parseByteSize('1mb')).toBe(1024 * 1024);
    expect(parseByteSize('512KB')).toBe(512 * 1024);
    expect(parseByteSize('100b')).toBe(100);
    expect(parseByteSize('2048')).toBe(2048);
    expect(parseByteSize(10)).toBe(10);
  });

  it('rejects junk', () => {
    expect(() => parseByteSize('lots')).toThrow(/Invalid size/);
    expect(() => parseByteSize(-1)).toThrow();
  });
});
