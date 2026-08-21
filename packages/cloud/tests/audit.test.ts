import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { auditLog, auditMiddleware } from '../src/audit';
import { getGlobalEventBus } from '@axiljs/events';
import type { axilRequest, axilResponse } from '@axiljs/common';

const listeners = new Map<string, Function[]>();

const mockBus = {
  emit: vi.fn((type: string, payload: any) => {
    const handlers = listeners.get(type) || [];
    handlers.forEach((fn) => fn(payload));
  }),
  on: vi.fn((type: string, handler: Function) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type)!.push(handler);
    return { unsubscribe: () => {} };
  }),
  clear: vi.fn(() => {
    listeners.clear();
  }),
};

vi.mock('@axiljs/events', () => ({
  getGlobalEventBus: () => mockBus,
}));

describe('Audit Logging System', () => {
  beforeEach(() => {
    getGlobalEventBus().clear();
    mockBus.emit.mockClear();
    mockBus.on.mockClear();
  });

  it('emits structured audit event onto global event bus', () => {
    const handler = vi.fn();
    mockBus.on('audit.log', handler);

    auditLog(
      {
        action: 'user.password_reset',
        actor: { id: 'admin-1', type: 'user' },
        tenantId: 'tenant-abc',
        metadata: { targetUser: 99 },
        success: true,
      },
      { logToConsole: false }
    );

    expect(handler).toHaveBeenCalledTimes(1);
    const emitted = handler.mock.calls[0][0];
    expect(emitted.action).toBe('user.password_reset');
    expect(emitted.actor.id).toBe('admin-1');
    expect(emitted.timestamp).toBeDefined();
    expect(emitted.success).toBe(true);
  });

  it('safely captures request lifecycle without monkey-patching res.raw.end', () => {
    const handler = vi.fn();
    mockBus.on('audit.log', handler);

    const mw = auditMiddleware({ logToConsole: false });

    const rawRes = new EventEmitter() as any;
    rawRes.statusCode = 200;

    const req = {
      raw: {} as any,
      method: 'POST',
      url: '/api/v1/orders',
      path: '/api/v1/orders',
      params: {},
      query: {},
      body: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'VitestClient/1.0' },
      locals: {
        user: { id: 'usr-42', type: 'user' },
        tenant: { id: 'org-99' },
        requestId: 'req-uuid-1',
      },
    } as unknown as axilRequest;

    const res = {
      raw: rawRes,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      html: vi.fn().mockReturnThis(),
    } as unknown as axilResponse;

    const next = vi.fn();

    mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    rawRes.emit('finish');

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.action).toBe('POST /api/v1/orders');
    expect(event.actor.id).toBe('usr-42');
    expect(event.tenantId).toBe('org-99');
    expect(event.requestId).toBe('req-uuid-1');
    expect(event.success).toBe(true);

    rawRes.emit('close');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});