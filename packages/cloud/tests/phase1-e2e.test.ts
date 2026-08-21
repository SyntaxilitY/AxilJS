import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { 
  multiTenancy, 
  getTenant, 
  auditMiddleware, 
  auditLog,
  featureFlags, 
  generateDeployment, 
  createDashboard,
  Tenant,
  AuditEvent
} from '../src';
import { getGlobalEventBus } from '@axiljs/events';
import type { axilRequest, axilResponse } from '@axiljs/common';

// ─── Real System Mock Setup ──────────────────────────────────────────────────

const eventLog: AuditEvent[] = [];
const mockBus = {
  emit: vi.fn((type: string, payload: any) => {
    if (type === 'audit.log') {
      eventLog.push(payload);
    }
  }),
  on: vi.fn(),
  clear: vi.fn(() => {
    eventLog.length = 0;
  }),
};

vi.mock('@axiljs/events', () => ({
  getGlobalEventBus: () => mockBus,
}));

describe('Phase 1 — Cloud Foundation E2E Real System Integration', () => {
  beforeEach(() => {
    mockBus.clear();
    mockBus.emit.mockClear();
    // Clean up flags
    featureFlags.getAll().forEach(flag => featureFlags.remove(flag.name));
  });

  it('runs a complete multi-tenant request lifecycle with auditing, flags, and dashboard generation', async () => {
    // ─── Step 1: Initialize Feature Flags ────────────────────────────────────
    featureFlags.define({
      name: 'premium-dashboard',
      enabled: true,
      rolloutPercentage: 0, // 0% global rollout to force whitelist checking
      allowedTenants: ['enterprise-corp'],
    });

    featureFlags.define({
      name: 'legacy-billing',
      enabled: false,
      rolloutPercentage: 100,
    });

    // ─── Step 2: Define Tenant Resolution & Database Mock ───────────────────
    const tenantDatabase: Record<string, Tenant> = {
      'enterprise-corp': { id: 'enterprise-corp', name: 'Enterprise Corp Ltd', status: 'active', plan: 'enterprise' },
      'suspended-corp':  { id: 'suspended-corp',  name: 'Suspended Corp',      status: 'suspended',  plan: 'free' },
    };

    const middleware = multiTenancy({
      strategy: 'header',
      headerName: 'x-tenant-id',
      resolveTenant: async (id) => tenantDatabase[id] || null,
      required: true,
    });

    const auditLogger = auditMiddleware({ logToConsole: false });

    // ─── Step 3: Simulate HTTP Server Request Pipeline ───────────────────────
    // We create a mock Node Response EventEmitter to capture 'finish' events.
    const rawResponseEmitter = new EventEmitter() as any;
    rawResponseEmitter.statusCode = 200;
    rawResponseEmitter.setHeader = vi.fn();

    const req = {
      raw: {} as any,
      method: 'POST',
      url: '/api/v1/data-export',
      path: '/api/v1/data-export',
      headers: {
        'x-tenant-id': 'enterprise-corp',
        'user-agent': 'Mozilla/5.0 AxilCoreClient/2.0',
      },
      locals: {
        user: { id: 'user-usr-888', type: 'user' },
        requestId: 'req-e2e-trace-id',
      },
      params: {},
      query: {},
      body: {},
      ip: '192.168.1.50',
    } as unknown as axilRequest;

    const res = {
      raw: rawResponseEmitter,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      html: vi.fn().mockReturnThis(),
    } as unknown as axilResponse;

    // Run Tenant resolution middleware
    const next1 = vi.fn();
    await middleware(req, res, next1);
    expect(next1).toHaveBeenCalledWith();

    // Verify tenant resolution attached to context correctly
    const resolvedTenant = getTenant(req);
    expect(resolvedTenant.id).toBe('enterprise-corp');
    expect(resolvedTenant.plan).toBe('enterprise');

    // Run Audit logger middleware
    const next2 = vi.fn();
    auditLogger(req, res, next2);
    expect(next2).toHaveBeenCalledWith();

    // ─── Step 4: Evaluate Feature Flag inside the active request context ─────
    const isPremiumActive = featureFlags.isEnabled('premium-dashboard', {
      tenantId: resolvedTenant.id,
      userId: (req.locals as any)?.user?.id,
    });
    expect(isPremiumActive).toBe(true); // Should bypass 0% rollout because of tenant whitelist

    const isLegacyBillingActive = featureFlags.isEnabled('legacy-billing', {
      tenantId: resolvedTenant.id,
    });
    expect(isLegacyBillingActive).toBe(false); // Flag is globally disabled

    // ─── Step 5: Complete the Request Cycle & Emit Audit Event ───────────────
    rawResponseEmitter.emit('finish');

    // Confirm audit details were captured exactly-once
    expect(mockBus.emit).toHaveBeenCalledWith('audit.log', expect.any(Object));
    expect(eventLog).toHaveLength(1);

    const loggedEvent = eventLog[0];
    expect(loggedEvent.action).toBe('POST /api/v1/data-export');
    expect(loggedEvent.tenantId).toBe('enterprise-corp');
    expect(loggedEvent.requestId).toBe('req-e2e-trace-id');
    expect(loggedEvent.userAgent).toContain('AxilCoreClient/2.0');
    expect(loggedEvent.success).toBe(true);
    expect(loggedEvent.ip).toBe('192.168.1.50');

    // ─── Step 6: Test Deployment Code Generation Pipeline ────────────────────
    const deploymentConfig = {
      appName: 'e2e-gateway-app',
      version: 'v2.4.0',
      port: 9000,
      replicas: 5,
      domain: 'gateway.axiljs.local',
      env: {
        APP_ENV: 'e2e-production',
        TENANT_ISOLATION: 'active',
      },
    };

    const manifests = generateDeployment(deploymentConfig, true); // dryRun = true
    expect(manifests).toHaveLength(3);

    const dockerfile = manifests.find(m => m.filename === 'Dockerfile')!;
    const compose = manifests.find(m => m.filename === 'docker-compose.yml')!;
    const k8s = manifests.find(m => m.filename === 'kubernetes.yaml')!;

    expect(dockerfile.content).toContain('FROM node:22-alpine AS builder');
    expect(dockerfile.content).toContain('EXPOSE 9000');
    expect(compose.content).toContain('TENANT_ISOLATION=active');
    expect(k8s.content).toContain('name: e2e-gateway-app');
    expect(k8s.content).toContain('host: gateway.axiljs.local');

    // ─── Step 7: Test UI Dashboard Endpoint ──────────────────────────────────
    const dashboardHandler = createDashboard({
      title: 'E2E Testing Admin Portal',
      metricsEndpoint: '/api/v1/metrics',
      healthEndpoint: '/api/v1/health',
    });

    let renderedDashboardHtml = '';
    const dashboardRes = {
      raw: rawResponseEmitter,
      html: vi.fn((html: string) => {
        renderedDashboardHtml = html;
      }),
    } as unknown as axilResponse;

    dashboardHandler(req, dashboardRes);

    expect(dashboardRes.html).toHaveBeenCalledTimes(1);
    expect(renderedDashboardHtml).toContain('E2E Testing Admin Portal');

    // Robust endpoints assertion (whitespace and quote-type immune)
    expect(renderedDashboardHtml).toMatch(/METRICS_URL\s*=\s*["']\/api\/v1\/metrics["']/);
    expect(renderedDashboardHtml).toMatch(/HEALTH_URL\s*=\s*["']\/api\/v1\/health["']/);

    expect(rawResponseEmitter.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.any(String)
    );
  });

  it('rejects unauthenticated requests or suspended tenants at the gate', async () => {
    const tenantDatabase: Record<string, Tenant> = {
      'suspended-corp': { id: 'suspended-corp', name: 'Suspended Corp', status: 'suspended', plan: 'free' },
    };

    const middleware = multiTenancy({
      strategy: 'header',
      resolveTenant: async (id) => tenantDatabase[id] || null,
      required: true,
    });

    const req = {
      headers: { 'x-tenant-id': 'suspended-corp' },
      locals: {},
    } as unknown as axilRequest;

    const res = {} as unknown as axilResponse;
    const next = vi.fn();

    await middleware(req, res, next);

    // Should call next with an UnauthorizedError blocking access
    expect(next).toHaveBeenCalledTimes(1);
    const errorPassed = next.mock.calls[0][0];
    expect(errorPassed.message).toContain('suspended');
  });
});