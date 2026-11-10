import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { UnauthorizedError } from '@axiljs/common';
import { JWT } from '../src/jwt/jwt';

const SECRET = 'x'.repeat(48);

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Hand-roll a token so tests can control header/payload/signature. */
function forge(header: object, payload: object, secret = SECRET, digest = 'sha256'): string {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = b64url(createHmac(digest, secret).update(input).digest());
  return `${input}.${sig}`;
}

afterEach(() => vi.useRealTimers());

describe('JWT construction', () => {
  it('requires a secret of at least 32 characters', () => {
    expect(() => new JWT('short')).toThrow(/at least 32/);
    expect(() => new JWT('')).toThrow();
  });

  it('rejects unsupported algorithms', () => {
    expect(() => new JWT(SECRET, { algorithm: 'none' as any })).toThrow(/Unsupported/);
    expect(() => new JWT(SECRET, { algorithm: 'RS256' as any })).toThrow(/Unsupported/);
  });
});

describe('JWT sign / verify', () => {
  it('round-trips a payload with iat (HS256 header by default)', () => {
    const jwt = new JWT(SECRET);
    const token = jwt.sign({ sub: 'u1', role: 'admin' });
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    const payload = jwt.verify(token);
    expect(payload.sub).toBe('u1');
    expect(payload.role).toBe('admin');
    expect(typeof payload.iat).toBe('number');
  });

  it('produces a standard HS256 signature', () => {
    const jwt = new JWT(SECRET);
    const token = jwt.sign({ sub: 1 });
    const [h, p, sig] = token.split('.');
    expect(sig).toBe(b64url(createHmac('sha256', SECRET).update(`${h}.${p}`).digest()));
  });

  it('rejects tampered, malformed and foreign-secret tokens', () => {
    const jwt = new JWT(SECRET);
    const token = jwt.sign({ sub: 'u1' });
    const [h, , s] = token.split('.');
    const tampered = `${h}.${b64url(JSON.stringify({ sub: 'admin' }))}.${s}`;

    expect(() => jwt.verify(tampered)).toThrow('Invalid token signature');
    expect(() => jwt.verify('a.b')).toThrow('Invalid token format');
    expect(() => jwt.verify('')).toThrow('No token provided');
    expect(() => new JWT('y'.repeat(40)).verify(token)).toThrow(UnauthorizedError);
  });

  it('rejects alg "none" and non-object payloads', () => {
    const jwt = new JWT(SECRET);
    expect(() => jwt.verify(forge({ alg: 'none', typ: 'JWT' }, { sub: 1 }))).toThrow('Invalid token algorithm');
    expect(() => jwt.verify(forge({ alg: 'HS256' }, [1, 2] as any))).toThrow('Invalid token payload');
  });

  it('enforces exp (expired at exactly exp) and nbf', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const jwt = new JWT(SECRET);
    const token = jwt.sign({ sub: 1 }, { expiresIn: '1h' });
    expect(jwt.verify(token).exp).toBe(jwt.verify(token).iat! + 3600);

    vi.advanceTimersByTime(3599 * 1000);
    expect(() => jwt.verify(token)).not.toThrow();
    vi.advanceTimersByTime(1000);
    expect(() => jwt.verify(token)).toThrow('Token has expired');

    const later = jwt.sign({ sub: 1 }, { notBefore: '10m' });
    expect(() => jwt.verify(later)).toThrow('Token not yet valid');
    vi.advanceTimersByTime(600 * 1000);
    expect(() => jwt.verify(later)).not.toThrow();
  });

  it('rejects non-numeric exp/nbf claims', () => {
    const jwt = new JWT(SECRET);
    expect(() => jwt.verify(forge({ alg: 'HS256' }, { exp: '9999999999' }))).toThrow('Token has expired');
    expect(() => jwt.verify(forge({ alg: 'HS256' }, { nbf: 'soon' }))).toThrow('Token not yet valid');
  });

  it('parses time strings and numbers', () => {
    const jwt = new JWT(SECRET);
    for (const [input, seconds] of [['30s', 30], ['5m', 300], ['2d', 172800], ['1w', 604800], [90, 90]] as const) {
      const p = jwt.verify(jwt.sign({}, { expiresIn: input }));
      expect(p.exp! - p.iat!).toBe(seconds);
    }
    expect(() => jwt.sign({}, { expiresIn: '1 year' })).toThrow(/Invalid time format/);
  });

  it('decode() reads without verifying', () => {
    const jwt = new JWT(SECRET);
    expect(jwt.decode(jwt.sign({ sub: 'z' }))?.sub).toBe('z');
    expect(jwt.decode('garbage')).toBeNull();
  });
});

describe('JWT audience / issuer', () => {
  const jwt = new JWT(SECRET);

  it('checks a string audience and issuer', () => {
    const token = jwt.sign({}, { audience: 'api', issuer: 'auth.example' });
    expect(() => jwt.verify(token, { audience: 'api', issuer: 'auth.example' })).not.toThrow();
    expect(() => jwt.verify(token, { audience: 'web' })).toThrow('Invalid token audience');
    expect(() => jwt.verify(token, { issuer: 'evil' })).toThrow('Invalid token issuer');
  });

  it('accepts an array aud claim (RFC 7519) containing the expected audience', () => {
    const token = jwt.sign({}, { audience: ['api', 'admin'] });
    expect(jwt.verify(token).aud).toEqual(['api', 'admin']);
    expect(() => jwt.verify(token, { audience: 'admin' })).not.toThrow();
    expect(() => jwt.verify(token, { audience: 'web' })).toThrow('Invalid token audience');
  });

  it('accepts an array of expected audiences', () => {
    const token = jwt.sign({}, { audience: 'mobile' });
    expect(() => jwt.verify(token, { audience: ['web', 'mobile'] })).not.toThrow();
    expect(() => jwt.verify(token, { audience: ['web', 'cli'] })).toThrow('Invalid token audience');
  });

  it('fails audience checks when the token has no aud', () => {
    expect(() => jwt.verify(jwt.sign({}), { audience: 'api' })).toThrow('Invalid token audience');
  });
});

describe('JWT algorithms', () => {
  it.each([
    ['HS384', 'sha384'],
    ['HS512', 'sha512']
  ] as const)('%s signs with %s and round-trips', (algorithm, digest) => {
    const jwt = new JWT(SECRET, { algorithm });
    const token = jwt.sign({ sub: 1 });
    const [h, p, sig] = token.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString()).alg).toBe(algorithm);
    expect(sig).toBe(b64url(createHmac(digest, SECRET).update(`${h}.${p}`).digest()));
    expect(jwt.verify(token).sub).toBe(1);
  });

  it('rejects tokens whose header alg differs from the configured one', () => {
    const hs256 = new JWT(SECRET);
    const hs512 = new JWT(SECRET, { algorithm: 'HS512' });
    expect(() => hs256.verify(hs512.sign({}))).toThrow(UnauthorizedError);
    expect(() => hs512.verify(hs256.sign({}))).toThrow(UnauthorizedError);

    // Correct HS256 signature but a header claiming HS512
    expect(() => hs256.verify(forge({ alg: 'HS512', typ: 'JWT' }, {}))).toThrow('Invalid token algorithm');
    // Correct HS512 signature but a header claiming HS256
    expect(() => hs512.verify(forge({ alg: 'HS256', typ: 'JWT' }, {}, SECRET, 'sha512'))).toThrow(
      'Invalid token algorithm'
    );
  });
});
