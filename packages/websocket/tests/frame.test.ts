import { describe, it, expect } from 'vitest';
import {
  buildFrame, parseFrame, parseFrameHeader, buildCloseFrame, buildPingFrame, buildPongFrame,
  isKnownOpcode, isControlOpcode, OPCODES
} from '../src/frame';
import { encodeFrame } from './helpers';

describe('buildFrame', () => {
  it('uses 7-bit lengths up to 125 bytes', () => {
    const f = buildFrame('a'.repeat(125));
    expect(f[0]).toBe(0x81);
    expect(f[1]).toBe(125);
    expect(f.length).toBe(127);
  });

  it('uses 16-bit lengths for 126..65535 bytes', () => {
    const f = buildFrame(Buffer.alloc(126), OPCODES.BINARY);
    expect(f[0]).toBe(0x82);
    expect(f[1]).toBe(126);
    expect(f.readUInt16BE(2)).toBe(126);
    expect(buildFrame(Buffer.alloc(65535))[1]).toBe(126);
  });

  it('uses 64-bit lengths above 65535 bytes', () => {
    const f = buildFrame(Buffer.alloc(65536));
    expect(f[1]).toBe(127);
    expect(f.readBigUInt64BE(2)).toBe(65536n);
    expect(f.length).toBe(65536 + 10);
  });

  it('builds close/ping/pong frames', () => {
    const c = buildCloseFrame(1001, 'bye');
    expect(c[0]).toBe(0x88);
    expect(c.readUInt16BE(2)).toBe(1001);
    expect(c.subarray(4).toString()).toBe('bye');
    expect(buildPingFrame()[0]).toBe(0x89);
    expect(buildPongFrame(Buffer.from('x'))[0]).toBe(0x8A);
  });
});

describe('parseFrame', () => {
  it('round-trips server frames', () => {
    for (const size of [0, 5, 125, 126, 1000, 65535, 65536, 70000]) {
      const payload = Buffer.alloc(size, 3);
      const r = parseFrame(buildFrame(payload, OPCODES.BINARY))!;
      expect(r.frame.opcode).toBe(OPCODES.BINARY);
      expect(r.frame.payload.length).toBe(size);
      expect(r.frame.masked).toBe(false);
    }
  });

  it('unmasks client frames', () => {
    const r = parseFrame(encodeFrame({ opcode: 1, payload: 'masked text' }))!;
    expect(r.frame.masked).toBe(true);
    expect(r.frame.maskKey).toHaveLength(4);
    expect(r.frame.payload.toString()).toBe('masked text');
  });

  it('decodes 64-bit lengths (high + low words)', () => {
    const r = parseFrame(encodeFrame({ opcode: 2, payload: Buffer.alloc(10), lengthBits: 64 }))!;
    expect(r.frame.payload.length).toBe(10);
    const h = parseFrameHeader(encodeFrame({ opcode: 2, declaredLength: 2 ** 33 + 5, lengthBits: 64, headerOnly: true }))!;
    expect(h.payloadLength).toBe(2 ** 33 + 5);
  });

  it('returns null for incomplete frames and reports bytes consumed', () => {
    const full = encodeFrame({ opcode: 1, payload: 'hello world' });
    for (let i = 0; i < full.length; i++) {
      expect(parseFrame(full.subarray(0, i))).toBeNull();
    }
    const two = Buffer.concat([full, full]);
    expect(parseFrame(two)!.bytesConsumed).toBe(full.length);
  });
});

describe('parseFrameHeader', () => {
  it('reports fin, rsv, opcode, mask and header length', () => {
    const h = parseFrameHeader(encodeFrame({ opcode: 0, fin: false, rsv: 5, payload: 'x'.repeat(300) }))!;
    expect(h).toEqual({ fin: false, rsv: 5, opcode: 0, masked: true, payloadLength: 300, headerLength: 8 });
    expect(parseFrameHeader(Buffer.from([0x81]))).toBeNull();
    expect(parseFrameHeader(Buffer.from([0x81, 127, 0, 0]))).toBeNull();
  });

  it('classifies opcodes', () => {
    expect([0, 1, 2, 8, 9, 10].every(isKnownOpcode)).toBe(true);
    expect([3, 4, 7, 11, 15].some(isKnownOpcode)).toBe(false);
    expect(isControlOpcode(8)).toBe(true);
    expect(isControlOpcode(0xB)).toBe(true);
    expect(isControlOpcode(1)).toBe(false);
  });
});
