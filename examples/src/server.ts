declare const process: any;

import { Application, cors } from '@axiljs/core';
import { loadEnv, defineConfig } from '@axiljs/config';
import { helmet } from '@axiljs/security';
import { getGlobalEventBus } from '@axiljs/events';
import { 
  Logger, 
  MetricsRegistry, 
  HealthChecker, 
  Tracer,
  observabilityMiddleware, 
  metricsHandler 
} from '@axiljs/observability';
import {
  multiTenancy,
  getTenant,
  auditMiddleware,
  featureFlags,
  generateDeployment,
  createDashboard,
  tenantRateLimiter,
  secrets,
  quotas,
  cache,
  correlationId,
  HealthAggregator
} from '@axiljs/cloud';
import type { Tenant } from '@axiljs/cloud';

// ─── Unhandled Error Protection ──────────────────────────────────────────────

process.on('uncaughtException', (err: Error) => {
  console.error('\x1b[31m[@axiljs/cloud] Uncaught Exception:\x1b[0m', err.message);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('\x1b[31m[@axiljs/cloud] Unhandled Rejection:\x1b[0m', reason);
});

// ─── Env & Config ────────────────────────────────────────────────────────────

loadEnv();

const config = defineConfig({
  PORT: { type: 'number', default: 3000 },
  HOST: { type: 'string', default: '127.0.0.1' },
  NODE_ENV: { type: 'string', default: 'development' }
});

// ─── Infrastructure ──────────────────────────────────────────────────────────

const logger  = new Logger({ name: 'cloud-demo' });
const metrics = new MetricsRegistry();
const tracer  = new Tracer({ serviceName: 'cloud-demo' });
const health  = new HealthChecker();

health.addCheck('uptime', async () => ({ message: `${Math.round(process.uptime())}s` }));
health.addCheck('memory', async () => {
  const mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  return { message: `${mb}MB` };
});

// ─── Phase 2: Multi-Service Health Monitor Setup ─────────────────────────────

const healthAggregator = new HealthAggregator([
  { name: 'Identity Engine', url: 'http://127.0.0.1:3000/health' },
  { name: 'Billing Gateway', url: 'http://127.0.0.1:3000/health' },
  { name: 'AI Inference Node', url: 'http://127.0.0.1:3000/health' }
]);

// ─── Local Audit Log Collector ───────────────────────────────────────────────

const auditTrail: any[] = [];

getGlobalEventBus().on('audit.log', (event: any) => {
  auditTrail.unshift(event.payload ?? event);
  if (auditTrail.length > 50) auditTrail.pop();
});

// ─── Mock Tenant Database ────────────────────────────────────────────────────

const tenants: Record<string, Tenant> = {
  'acme-corp':     { id: 'acme-corp',     name: 'Acme Enterprise Corp', status: 'active',    plan: 'enterprise' },
  'delta-gmbh':    { id: 'delta-gmbh',    name: 'Delta Consulting GmbH', status: 'active',    plan: 'pro' },
  'suspended-org': { id: 'suspended-org', name: 'Suspended Org Inc',     status: 'suspended', plan: 'free' }
};

// ─── Quota Configs ───────────────────────────────────────────────────────────

quotas.configure({
  tenantId: 'acme-corp',
  limits: [
    { metric: 'api_calls', max: 15, period: 'daily' }
  ]
});

quotas.configure({
  tenantId: 'delta-gmbh',
  limits: [
    { metric: 'api_calls', max: 5, period: 'daily' }
  ]
});

// ─── Seed Feature Flags ──────────────────────────────────────────────────────

featureFlags.define({ name: 'beta-ui',          enabled: true,  rolloutPercentage: 50 });
featureFlags.define({ name: 'premium-reports',  enabled: true,  rolloutPercentage: 0, allowedTenants: ['acme-corp'] });
featureFlags.define({ name: 'experimental-ai',  enabled: false, rolloutPercentage: 100 });

// ─── Application Setup ────────────────────────────────────────────────────────

const app = new Application({
  server: { port: config.PORT, host: config.HOST },
  env: config.NODE_ENV
});

app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(observabilityMiddleware({ metrics, tracer }));

// Global Middlewares (Request/Correlation Trace IDs + Tenancy Resolver)
app.use(correlationId());
app.use(multiTenancy({
  strategy: 'header',
  headerName: 'x-tenant-id',
  resolveTenant: async (id) => tenants[id] ?? null,
  required: false
}));

// ─── Rate Limiter with Smart Bypass for System Paths ────────────────────────
app.use((req: any, res: any, next: any) => {
  const path = req.path;
  // Dashboard, Health, metrics aur Root page ko rate limit se exclude karein
  if (path === '/' || path === '/health' || path === '/metrics' || path === '/dashboard') {
    return next();
  }
  
  // Baki sabhi API calls par rate limit apply karein
  tenantRateLimiter({
    defaultRule: { max: 10, windowMs: 30000 }, // 10 req / 30s
    tenantRules: {
      'acme-corp': { max: 100, windowMs: 30000 } // Acme gets 100 req / 30s
    }
  })(req, res, next);
});

app.use(auditMiddleware());

// =============================================================================
//  API ROUTES
// =============================================================================

app.get('/health', health.handler());
app.get('/metrics', metricsHandler(metrics));

/** GET /api/cloud/tenant — verify tenant context, trace headers, and track quotas */
app.get('/api/cloud/tenant', (req: any, res: any) => {
  try {
    const tenant = getTenant(req);

    // Increment tenant quota usage counter
    const quotaAllowed = quotas.increment(tenant.id, 'api_calls');
    const usageReport = quotas.getUsage(tenant.id);

    res.json({
      tenant,
      requestId: req.locals?.requestId,
      correlationId: req.locals?.correlationId,
      quota: {
        allowed: quotaAllowed,
        usage: usageReport
      },
      message: quotaAllowed 
        ? 'Tenant resolved and request tracked in quotas successfully.' 
        : 'RESOURCE_LIMIT_EXCEEDED: Tenant API quota allocation has been exhausted.'
    });
  } catch (err: any) {
    res.json({ tenant: null, message: err.message });
  }
});

/** GET /api/cloud/flags — evaluate flags */
app.get('/api/cloud/flags', (req: any, res: any) => {
  const tenant     = (req.locals as any)?.tenant as Tenant | undefined;
  const tenantId   = tenant?.id;
  const userId     = (req.query.userId as string) || 'anonymous';

  const results: Record<string, boolean> = {};
  for (const flag of featureFlags.getAll()) {
    results[flag.name] = featureFlags.isEnabled(flag.name, { tenantId, userId });
  }

  res.json({ context: { tenantId: tenantId ?? null, userId }, flags: results });
});

/** POST /api/cloud/flags — runtime updates */
app.post('/api/cloud/flags', (req: any, res: any) => {
  const body = req.body as any;
  if (!body.name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  featureFlags.define({
    name: body.name,
    enabled: body.enabled ?? true,
    rolloutPercentage: body.rolloutPercentage ?? 100,
    allowedTenants: body.allowedTenants,
    allowedUsers: body.allowedUsers
  });
  res.json({ message: `Flag "${body.name}" updated`, all: featureFlags.getAll() });
});

/** GET /api/cloud/audit — audit logs */
app.get('/api/cloud/audit', (req: any, res: any) => {
  res.json({ total: auditTrail.length, events: auditTrail });
});

/** POST /api/cloud/deploy */
app.post('/api/cloud/deploy', (req: any, res: any) => {
  const body = req.body as any;
  generateDeployment({
    appName:  body.appName  || 'my-service',
    version:  body.version  || '1.0.0',
    port:     body.port     || 8080,
    replicas: body.replicas || 3,
    domain:   body.domain,
    env:      body.env      || { NODE_ENV: 'production' }
  });
  res.json({ message: 'Deployment manifests generated in ./deploy directory' });
});

// ─── Phase 2: Distributed KMS Secrets Vault APIs ────────────────────────────

app.post('/api/cloud/secrets', async (req: any, res: any) => {
  const body = req.body as any;
  if (!body.name || !body.value) {
    res.status(400).json({ error: 'name and value properties are required' });
    return;
  }
  await secrets.set(body.name, body.value);
  res.json({ success: true, secrets: secrets.list() });
});

app.get('/api/cloud/secrets', async (req: any, res: any) => {
  const name = req.query.name as string;
  if (!name) {
    res.json({ list: secrets.list() });
    return;
  }
  const plaintext = await secrets.get(name);
  res.json({ name, value: plaintext ?? 'NOT_FOUND' });
});

// ─── Phase 2: Distributed Isolated Caching APIs ─────────────────────────────

app.post('/api/cloud/cache', (req: any, res: any) => {
  const body = req.body as any;
  if (!body.key || !body.value) {
    res.status(400).json({ error: 'key and value are required' });
    return;
  }
  const tenant = (req.locals as any)?.tenant as Tenant | undefined;
  const prefix = tenant ? `tenant:${tenant.id}:` : 'global:';
  const tag    = tenant ? `tenant:${tenant.id}` : 'global';

  cache.set(prefix + body.key, body.value, { 
    ttlMs: body.ttl ? parseInt(body.ttl) : 60000,
    tags: [tag]
  });
  res.json({ message: 'Item cached successfully', stats: cache.stats() });
});

app.get('/api/cloud/cache', (req: any, res: any) => {
  const key = req.query.key as string;
  if (!key) {
    res.json({ stats: cache.stats() });
    return;
  }
  const tenant = (req.locals as any)?.tenant as Tenant | undefined;
  const prefix = tenant ? `tenant:${tenant.id}:` : 'global:';
  
  const value = cache.get(prefix + key);
  res.json({ key, value: value ?? null });
});

app.delete('/api/cloud/cache', (req: any, res: any) => {
  const tag = req.query.tag as string;
  if (tag) {
    const cleared = cache.invalidateTag(tag);
    res.json({ message: `Cache tag "${tag}" invalidated`, cleared });
    return;
  }
  cache.clear();
  res.json({ message: 'Cache completely cleared' });
});

// ─── Phase 2: Health Aggregator API ──────────────────────────────────────────

app.get('/api/cloud/aggregator', async (req: any, res: any) => {
  const report = await healthAggregator.check();
  res.json(report);
});

/** GET /dashboard */
app.get('/dashboard', createDashboard({
  title: 'AxilJS Cloud Dashboard',
  metricsEndpoint: '/metrics',
  healthEndpoint: '/health'
}));

// =============================================================================
//  INTERACTIVE CLIENT PORTAL
// =============================================================================
app.get('/', (req: any, res: any) => {
  res.raw?.setHeader?.(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'"
  );

  res.raw?.setHeader?.('X-Content-Type-Options', 'nosniff');
  res.raw?.setHeader?.('X-Frame-Options', 'DENY');
  res.raw?.setHeader?.(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );
  res.raw?.setHeader?.(
    'Cache-Control',
    'no-store, no-cache, must-revalidate'
  );

  const tenantCount = Object.keys(tenants).length;
  const activeTenantCount = Object.values(tenants)
    .filter((tenant) => tenant.status === 'active')
    .length;

  const flagCount = featureFlags.getAll().length;
  const enabledFlagCount = featureFlags
    .getAll()
    .filter((flag) => flag.enabled)
    .length;

  res.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
/>

<title>AxilJS Cloud</title>

<style>
:root {
  --bg: #f5f7fa;
  --surface: #ffffff;
  --surface-soft: #f8fafc;

  --border: #e4e7ec;
  --border-hover: #d0d5dd;

  --text: #101828;
  --text-secondary: #344054;
  --text-muted: #667085;
  --text-light: #98a2b3;

  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --primary-soft: #eff6ff;

  --success: #15803d;
  --success-soft: #f0fdf4;

  --warning: #b45309;
  --warning-soft: #fffbeb;

  --danger: #dc2626;
  --danger-soft: #fef2f2;

  --shadow-sm:
    0 1px 2px rgba(16, 24, 40, 0.04);

  --shadow-md:
    0 4px 12px rgba(16, 24, 40, 0.06);

  --radius-sm: 8px;
  --radius-md: 12px;

  --content-width: 1480px;
}

/* ─────────────────────────────────────────────────────────────────────────
   Base
   ───────────────────────────────────────────────────────────────────────── */

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  background: var(--bg);
}

body {
  margin: 0;

  background:
    linear-gradient(
      180deg,
      #ffffff 0,
      #f8fafc 260px,
      var(--bg) 560px
    );

  color: var(--text);

  font-family:
    Inter,
    ui-sans-serif,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    Helvetica,
    Arial,
    sans-serif;

  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

button,
input,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

a {
  color: inherit;
  text-decoration: none;
}

/* ─────────────────────────────────────────────────────────────────────────
   Shell
   ───────────────────────────────────────────────────────────────────────── */

.app {
  min-height: 100vh;
}

.container {
  width: min(
    calc(100% - 48px),
    var(--content-width)
  );

  margin: 0 auto;
}

/* ─────────────────────────────────────────────────────────────────────────
   Navigation
   ───────────────────────────────────────────────────────────────────────── */

.topbar {
  position: sticky;
  top: 0;
  z-index: 100;

  height: 68px;

  background:
    rgba(255, 255, 255, 0.96);

  border-bottom:
    1px solid var(--border);

  backdrop-filter:
    blur(14px);
}

.topbar-inner {
  height: 100%;

  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 24px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.brand-mark {
  width: 34px;
  height: 34px;

  display: grid;
  place-items: center;

  border-radius: 9px;

  background:
    linear-gradient(
      135deg,
      #2563eb,
      #1d4ed8
    );

  box-shadow:
    0 4px 10px
    rgba(37, 99, 235, 0.18);
}

.brand-symbol {
  width: 15px;
  height: 15px;

  border:
    2px solid #ffffff;

  border-radius: 4px;
}

.brand-title {
  font-size: 15px;
  line-height: 20px;
  font-weight: 750;
  letter-spacing: -0.01em;
}

.brand-subtitle {
  margin-top: 1px;

  color: var(--text-muted);

  font-size: 11px;
  line-height: 15px;
}

.nav {
  display: flex;
  align-items: center;
  gap: 3px;
}

.nav-link {
  padding: 8px 11px;

  border-radius: 7px;

  color: var(--text-muted);

  font-size: 12px;
  font-weight: 600;
}

.nav-link:hover {
  background: var(--surface-soft);
  color: var(--text);
}

.nav-link.active {
  background: var(--primary-soft);
  color: var(--primary);
}

.system-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;

  padding: 7px 10px;

  border:
    1px solid var(--border);

  border-radius: 999px;

  color: var(--text-secondary);

  background: var(--surface);

  font-size: 11px;
  font-weight: 650;
}

.status-dot {
  width: 7px;
  height: 7px;

  border-radius: 50%;

  background: var(--success);
}

/* ─────────────────────────────────────────────────────────────────────────
   Main header
   ───────────────────────────────────────────────────────────────────────── */

.main {
  padding: 38px 0 56px;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;

  gap: 24px;

  margin-bottom: 28px;
}

.eyebrow {
  margin-bottom: 6px;

  color: var(--primary);

  font-size: 10px;
  line-height: 15px;

  font-weight: 750;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.page-title {
  margin: 0;

  font-size: 29px;
  line-height: 36px;

  font-weight: 750;

  letter-spacing: -0.03em;
}

.page-description {
  max-width: 720px;

  margin: 7px 0 0;

  color: var(--text-muted);

  font-size: 13px;
  line-height: 20px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.button {
  height: 36px;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  padding:
    0 13px;

  border:
    1px solid var(--border);

  border-radius:
    var(--radius-sm);

  background:
    var(--surface);

  color:
    var(--text-secondary);

  font-size: 11px;
  font-weight: 650;

  box-shadow:
    var(--shadow-sm);

  transition:
    border-color 120ms ease,
    background 120ms ease;
}

.button:hover {
  border-color:
    var(--border-hover);

  background:
    var(--surface-soft);
}

.button-primary {
  background:
    var(--primary);

  color:
    #ffffff;

  border-color:
    var(--primary);
}

.button-primary:hover {
  background:
    var(--primary-hover);

  border-color:
    var(--primary-hover);
}

/* ─────────────────────────────────────────────────────────────────────────
   KPI
   ───────────────────────────────────────────────────────────────────────── */

.kpi-grid {
  display: grid;

  grid-template-columns:
    repeat(4, minmax(0, 1fr));

  gap: 14px;

  margin-bottom: 22px;
}

.kpi {
  min-height: 126px;

  padding: 18px 20px;

  background:
    var(--surface);

  border:
    1px solid var(--border);

  border-radius:
    var(--radius-md);

  box-shadow:
    var(--shadow-sm);
}

.kpi-label {
  color:
    var(--text-muted);

  font-size:
    10px;

  font-weight:
    700;

  letter-spacing:
    0.07em;

  text-transform:
    uppercase;
}

.kpi-value {
  margin-top: 13px;

  font-size: 25px;
  line-height: 31px;

  font-weight: 750;

  letter-spacing: -0.025em;
}

.kpi-value.success {
  color:
    var(--success);
}

.kpi-meta {
  margin-top: 5px;

  color:
    var(--text-muted);

  font-size:
    10px;

  line-height:
    15px;
}

/* ─────────────────────────────────────────────────────────────────────────
   Layout
   ───────────────────────────────────────────────────────────────────────── */

.grid {
  display: grid;

  grid-template-columns:
    minmax(0, 1.35fr)
    minmax(340px, 0.65fr);

  gap: 14px;

  margin-bottom: 14px;
}

.grid-equal {
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
}

.card {
  background:
    var(--surface);

  border:
    1px solid var(--border);

  border-radius:
    var(--radius-md);

  box-shadow:
    var(--shadow-sm);

  overflow:
    hidden;
}

.card-header {
  min-height:
    62px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    16px;

  padding:
    14px 18px;

  border-bottom:
    1px solid var(--border);
}

.card-title {
  margin: 0;

  font-size:
    13px;

  line-height:
    19px;

  font-weight:
    700;
}

.card-description {
  margin:
    3px 0 0;

  color:
    var(--text-muted);

  font-size:
    10px;

  line-height:
    15px;
}

.card-body {
  padding:
    18px;
}

/* ─────────────────────────────────────────────────────────────────────────
   Services
   ───────────────────────────────────────────────────────────────────────── */

.service-list {
  display:
    flex;

  flex-direction:
    column;
}

.service {
  min-height:
    54px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    18px;

  border-bottom:
    1px solid var(--border);
}

.service:last-child {
  border-bottom:
    0;
}

.service-name {
  font-size:
    12px;

  font-weight:
    650;
}

.service-description {
  margin-top:
    2px;

  color:
    var(--text-muted);

  font-size:
    10px;
}

/* ─────────────────────────────────────────────────────────────────────────
   Badges
   ───────────────────────────────────────────────────────────────────────── */

.badge {
  min-height:
    24px;

  display:
    inline-flex;

  align-items:
    center;

  justify-content:
    center;

  padding:
    0 8px;

  border:
    1px solid var(--border);

  border-radius:
    999px;

  background:
    var(--surface-soft);

  color:
    var(--text-muted);

  font-size:
    9px;

  line-height:
    13px;

  font-weight:
    750;

  letter-spacing:
    0.035em;

  text-transform:
    uppercase;

  white-space:
    nowrap;
}

.badge.success {
  color:
    var(--success);

  background:
    var(--success-soft);

  border-color:
    #dcfce7;
}

.badge.warning {
  color:
    var(--warning);

  background:
    var(--warning-soft);

  border-color:
    #fef3c7;
}

.badge.danger {
  color:
    var(--danger);

  background:
    var(--danger-soft);

  border-color:
    #fee2e2;
}

.badge.primary {
  color:
    var(--primary);

  background:
    var(--primary-soft);

  border-color:
    #dbeafe;
}

/* ─────────────────────────────────────────────────────────────────────────
   Runtime
   ───────────────────────────────────────────────────────────────────────── */

.info-list {
  display:
    flex;

  flex-direction:
    column;
}

.info-row {
  min-height:
    45px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    18px;

  border-bottom:
    1px solid var(--border);
}

.info-row:last-child {
  border-bottom:
    0;
}

.info-label {
  color:
    var(--text-muted);

  font-size:
    10px;

  font-weight:
    600;
}

.info-value {
  color:
    var(--text-secondary);

  font-size:
    10px;

  font-weight:
    650;

  text-align:
    right;
}

/* ─────────────────────────────────────────────────────────────────────────
   Forms
   ───────────────────────────────────────────────────────────────────────── */

.form-grid {
  display:
    grid;

  grid-template-columns:
    minmax(0, 1fr)
    auto;

  gap:
    8px;
}

.form-grid-three {
  grid-template-columns:
    minmax(0, 1fr)
    minmax(100px, 0.35fr)
    auto;
}

.field {
  width:
    100%;

  height:
    36px;

  padding:
    0 10px;

  border:
    1px solid var(--border-hover);

  border-radius:
    var(--radius-sm);

  background:
    #ffffff;

  color:
    var(--text);

  outline:
    none;

  font-size:
    11px;
}

.field::placeholder {
  color:
    var(--text-light);
}

.field:focus {
  border-color:
    #93c5fd;

  box-shadow:
    0 0 0 3px
    rgba(37, 99, 235, 0.08);
}

.form-row {
  display:
    flex;

  gap:
    8px;

  margin-top:
    8px;
}

/* ─────────────────────────────────────────────────────────────────────────
   Flags
   ───────────────────────────────────────────────────────────────────────── */

.flag-grid {
  display:
    grid;

  grid-template-columns:
    repeat(2, minmax(0, 1fr));

  gap:
    9px;
}

.flag {
  padding:
    12px;

  border:
    1px solid var(--border);

  border-radius:
    9px;

  background:
    var(--surface-soft);
}

.flag-name {
  font-size:
    10px;

  font-weight:
    700;
}

.flag-meta {
  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    8px;

  margin-top:
    8px;
}

.flag-rollout {
  color:
    var(--text-muted);

  font-size:
    9px;
}

/* ─────────────────────────────────────────────────────────────────────────
   Secret / cache operation rows
   ───────────────────────────────────────────────────────────────────────── */

.action-stack {
  display:
    flex;

  flex-direction:
    column;

  gap:
    9px;
}

.action-row {
  display:
    grid;

  grid-template-columns:
    minmax(0, 1fr)
    auto;

  gap:
    8px;
}

/* ─────────────────────────────────────────────────────────────────────────
   Response
   ───────────────────────────────────────────────────────────────────────── */

.response {
  min-height:
    92px;

  max-height:
    240px;

  margin:
    10px 0 0;

  padding:
    12px;

  overflow:
    auto;

  border:
    1px solid var(--border);

  border-radius:
    8px;

  background:
    #f8fafc;

  color:
    #475467;

  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;

  font-size:
    9px;

  line-height:
    1.65;

  white-space:
    pre-wrap;

  word-break:
    break-word;
}

/* ─────────────────────────────────────────────────────────────────────────
   Deployment
   ───────────────────────────────────────────────────────────────────────── */

.deployment-layout {
  display:
    grid;

  grid-template-columns:
    minmax(0, 1fr)
    auto;

  gap:
    8px;
}

/* ─────────────────────────────────────────────────────────────────────────
   Footer
   ───────────────────────────────────────────────────────────────────────── */

.footer {
  margin-top:
    28px;

  padding-top:
    18px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap:
    16px;

  border-top:
    1px solid var(--border);

  color:
    var(--text-light);

  font-size:
    10px;
}

.footer-links {
  display:
    flex;

  gap:
    16px;
}

.footer-link:hover {
  color:
    var(--primary);
}

/* ─────────────────────────────────────────────────────────────────────────
   Responsive
   ───────────────────────────────────────────────────────────────────────── */

@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }

  .grid,
  .grid-equal {
    grid-template-columns:
      1fr;
  }
}

@media (max-width: 760px) {
  .container {
    width:
      calc(100% - 32px);
  }

  .nav {
    display:
      none;
  }

  .main {
    padding-top:
      28px;
  }

  .page-header {
    align-items:
      flex-start;

    flex-direction:
      column;
  }

  .header-actions {
    width:
      100%;
  }

  .header-actions .button {
    flex:
      1;
  }

  .kpi-grid {
    grid-template-columns:
      1fr;
  }

  .form-grid,
  .form-grid-three,
  .deployment-layout,
  .action-row {
    grid-template-columns:
      1fr;
  }

  .flag-grid {
    grid-template-columns:
      1fr;
  }

  .footer {
    align-items:
      flex-start;

    flex-direction:
      column;
  }
}
</style>
</head>

<body>

<div class="app">

<header class="topbar">
  <div class="container topbar-inner">

    <a href="/" class="brand">

      <div class="brand-mark">
        <div class="brand-symbol"></div>
      </div>

      <div>
        <div class="brand-title">
          AxilJS Cloud
        </div>

        <div class="brand-subtitle">
          Cloud Management Console
        </div>
      </div>

    </a>

    <nav class="nav">

      <a
        href="/"
        class="nav-link active"
      >
        Overview
      </a>

      <a
        href="/dashboard"
        class="nav-link"
      >
        Observability
      </a>

      <a
        href="/health"
        class="nav-link"
        target="_blank"
      >
        Health
      </a>

      <a
        href="/metrics"
        class="nav-link"
        target="_blank"
      >
        Metrics
      </a>

    </nav>

    <div class="system-status">

      <span
        id="statusDot"
        class="status-dot"
      ></span>

      <span id="globalStatus">
        Operational
      </span>

    </div>

  </div>
</header>

<main class="container main">

<section class="page-header">

  <div>

    <div class="eyebrow">
      AxilJS Cloud Platform
    </div>

    <h1 class="page-title">
      Overview
    </h1>

    <p class="page-description">
      Manage tenant infrastructure, security services,
      distributed capabilities, observability and deployment.
    </p>

  </div>

  <div class="header-actions">

    <a
      href="/dashboard"
      class="button button-primary"
    >
      Open Observability
    </a>

    <button
      class="button"
      onclick="refreshAll()"
    >
      Refresh
    </button>

  </div>

</section>

<!-- KPI -->

<section class="kpi-grid">

  <article class="kpi">

    <div class="kpi-label">
      System Status
    </div>

    <div
      id="systemStatus"
      class="kpi-value success"
    >
      Operational
    </div>

    <div class="kpi-meta">
      Application health
    </div>

  </article>

  <article class="kpi">

    <div class="kpi-label">
      Active Tenants
    </div>

    <div class="kpi-value">
      ${activeTenantCount}
    </div>

    <div class="kpi-meta">
      ${tenantCount} registered tenant contexts
    </div>

  </article>

  <article class="kpi">

    <div class="kpi-label">
      Feature Flags
    </div>

    <div class="kpi-value">
      ${enabledFlagCount}
    </div>

    <div class="kpi-meta">
      ${flagCount} configured flags
    </div>

  </article>

  <article class="kpi">

    <div class="kpi-label">
      Audit Events
    </div>

    <div
      id="auditKpi"
      class="kpi-value"
    >
      ${auditTrail.length}
    </div>

    <div class="kpi-meta">
      Events currently retained
    </div>

  </article>

</section>

<!-- Platform -->

<section class="grid">

<article class="card">

  <div class="card-header">

    <div>
      <h2 class="card-title">
        Platform Services
      </h2>

      <p class="card-description">
        Core AxilJS Cloud infrastructure components.
      </p>
    </div>

    <span class="badge success">
      Operational
    </span>

  </div>

  <div class="card-body">

    <div class="service-list">

      <div class="service">
        <div>
          <div class="service-name">
            HTTP Application
          </div>
          <div class="service-description">
            Request processing and application runtime
          </div>
        </div>

        <span
          id="httpServiceStatus"
          class="badge success"
        >
          Operational
        </span>
      </div>

      <div class="service">
        <div>
          <div class="service-name">
            Observability
          </div>
          <div class="service-description">
            Metrics collection and distributed tracing
          </div>
        </div>

        <span class="badge success">
          Operational
        </span>
      </div>

      <div class="service">
        <div>
          <div class="service-name">
            Multi-Tenancy
          </div>
          <div class="service-description">
            Tenant resolution and isolation
          </div>
        </div>

        <span class="badge success">
          Operational
        </span>
      </div>

      <div class="service">
        <div>
          <div class="service-name">
            KMS Vault
          </div>
          <div class="service-description">
            Encrypted application secret management
          </div>
        </div>

        <span class="badge success">
          Operational
        </span>
      </div>

      <div class="service">
        <div>
          <div class="service-name">
            Distributed Cache
          </div>
          <div class="service-description">
            Tenant-isolated application caching
          </div>
        </div>

        <span class="badge success">
          Operational
        </span>
      </div>

      <div class="service">
        <div>
          <div class="service-name">
            Rate Limiting
          </div>
          <div class="service-description">
            Sliding-window request protection
          </div>
        </div>

        <span class="badge success">
          Operational
        </span>
      </div>

      <div class="service">
        <div>
          <div class="service-name">
            Audit Engine
          </div>
          <div class="service-description">
            Event-driven compliance activity
          </div>
        </div>

        <span class="badge success">
          Operational
        </span>
      </div>

      <div class="service">
        <div>
          <div class="service-name">
            Deployment Engine
          </div>
          <div class="service-description">
            Docker and Kubernetes artifact generation
          </div>
        </div>

        <span class="badge success">
          Operational
        </span>
      </div>

    </div>

  </div>

</article>

<article class="card">

  <div class="card-header">

    <div>
      <h2 class="card-title">
        Runtime
      </h2>

      <p class="card-description">
        Current application execution environment.
      </p>
    </div>

  </div>

  <div class="card-body">

    <div class="info-list">

      <div class="info-row">
        <span class="info-label">
          Environment
        </span>

        <span class="info-value">
          ${config.NODE_ENV}
        </span>
      </div>

      <div class="info-row">
        <span class="info-label">
          Host
        </span>

        <span class="info-value">
          ${config.HOST}
        </span>
      </div>

      <div class="info-row">
        <span class="info-label">
          Port
        </span>

        <span class="info-value">
          ${config.PORT}
        </span>
      </div>

      <div class="info-row">
        <span class="info-label">
          Runtime
        </span>

        <span class="info-value">
          Node.js
        </span>
      </div>

      <div class="info-row">
        <span class="info-label">
          Service
        </span>

        <span class="info-value">
          cloud-demo
        </span>
      </div>

      <div class="info-row">
        <span class="info-label">
          Process Uptime
        </span>

        <span
          id="runtimeUptime"
          class="info-value"
        >
          —
        </span>
      </div>

    </div>

  </div>

</article>

</section>

<!-- Tenancy / flags -->

<section class="grid grid-equal">

<article class="card">

  <div class="card-header">

    <div>
      <h2 class="card-title">
        Tenant Context
      </h2>

      <p class="card-description">
        Test tenant resolution, isolation and lifecycle state.
      </p>
    </div>

    <span class="badge primary">
      Multi-Tenant
    </span>

  </div>

  <div class="card-body">

    <div class="form-grid">

      <select
        id="tenantSelect"
        class="field"
      >
        <option value="">
          Guest / Anonymous
        </option>

        <option value="acme-corp">
          Acme Enterprise Corp
        </option>

        <option value="delta-gmbh">
          Delta Consulting GmbH
        </option>

        <option value="suspended-org">
          Suspended Org Inc
        </option>
      </select>

      <button
        onclick="callTenant()"
        class="button button-primary"
      >
        Resolve
      </button>

    </div>

    <pre
      id="out-tenant"
      class="response"
    >Select a tenant to inspect the request context.</pre>

  </div>

</article>

<article class="card">

  <div class="card-header">

    <div>
      <h2 class="card-title">
        Feature Management
      </h2>

      <p class="card-description">
        Evaluate deterministic feature rollouts.
      </p>
    </div>

    <span class="badge">
      ${flagCount} Flags
    </span>

  </div>

  <div class="card-body">

    <div class="flag-grid">

      ${featureFlags.getAll().map((flag) => `
        <div class="flag">

          <div class="flag-name">
            ${flag.name}
          </div>

          <div class="flag-meta">

            <span class="flag-rollout">
              ${flag.rolloutPercentage ?? 100}% rollout
            </span>

            <span class="badge ${flag.enabled ? 'success' : ''}">
              ${flag.enabled ? 'Enabled' : 'Disabled'}
            </span>

          </div>

        </div>
      `).join('')}

    </div>

    <div class="form-row">

      <input
        id="userIdInput"
        value="usr-developer"
        placeholder="User identity"
        class="field"
      />

      <button
        onclick="callFlags()"
        class="button button-primary"
      >
        Evaluate
      </button>

    </div>

    <pre
      id="out-flags"
      class="response"
    >Feature evaluation results will appear here.</pre>

  </div>

</article>

</section>

<!-- Security / Cache -->

<section class="grid grid-equal">

<article class="card">

  <div class="card-header">

    <div>
      <h2 class="card-title">
        Secrets Vault
      </h2>

      <p class="card-description">
        Manage encrypted application secrets.
      </p>
    </div>

    <span class="badge success">
      AES-256-GCM
    </span>

  </div>

  <div class="card-body">

    <div class="action-stack">

      <input
        id="secretName"
        class="field"
        placeholder="Secret name"
      />

      <input
        id="secretValue"
        class="field"
        placeholder="Secret value"
        type="password"
      />

      <div class="form-row">

        <button
          onclick="writeSecret()"
          class="button button-primary"
        >
          Store Secret
        </button>

        <button
          onclick="decryptSecret()"
          class="button"
        >
          Retrieve
        </button>

      </div>

    </div>

    <pre
      id="out-secrets"
      class="response"
    >Vault ready.</pre>

  </div>

</article>

<article class="card">

  <div class="card-header">

    <div>
      <h2 class="card-title">
        Distributed Cache
      </h2>

      <p class="card-description">
        Tenant-isolated cache operations.
      </p>
    </div>

    <span class="badge primary">
      Tenant Scoped
    </span>

  </div>

  <div class="card-body">

    <div class="action-stack">

      <input
        id="cacheKey"
        class="field"
        placeholder="Cache key"
      />

      <input
        id="cacheValue"
        class="field"
        placeholder="Cache value"
      />

      <div class="form-row">

        <button
          onclick="writeCache()"
          class="button button-primary"
        >
          Set
        </button>

        <button
          onclick="readCache()"
          class="button"
        >
          Get
        </button>

        <button
          onclick="flushCacheTag()"
          class="button"
        >
          Flush
        </button>

      </div>

    </div>

    <pre
      id="out-cache"
      class="response"
    >Cache ready.</pre>

  </div>

</article>

</section>

<!-- Rate limit / aggregator -->

<section class="grid grid-equal">

<article class="card">

  <div class="card-header">

    <div>
      <h2 class="card-title">
        Rate Limiting & Tracing
      </h2>

      <p class="card-description">
        Inspect rate-limit headers, request identity and correlation.
      </p>
    </div>

    <span class="badge warning">
      Sliding Window
    </span>

  </div>

  <div class="card-body">

    <button
      onclick="hammerRateLimit()"
      class="button button-primary"
    >
      Execute Requests
    </button>

    <pre
      id="out-ratelimit"
      class="response"
    >Rate-limit telemetry will appear here.</pre>

  </div>

</article>

<article class="card">

  <div class="card-header">

    <div>
      <h2 class="card-title">
        Health Aggregator
      </h2>

      <p class="card-description">
        Unified downstream service health.
      </p>
    </div>

    <span class="badge success">
      Monitoring
    </span>

  </div>

  <div class="card-body">

    <button
      onclick="pollAggregator()"
      class="button button-primary"
    >
      Poll Services
    </button>

    <pre
      id="out-aggregator"
      class="response"
    >Waiting for health aggregation.</pre>

  </div>

</article>

</section>

<!-- Audit / Deployment -->

<section class="grid grid-equal">

<article class="card">

  <div class="card-header">

    <div>
      <h2 class="card-title">
        Audit Activity
      </h2>

      <p class="card-description">
        Recent EventBus compliance events.
      </p>
    </div>

    <span
      id="auditBadge"
      class="badge"
    >
      ${auditTrail.length} Events
    </span>

  </div>

  <div class="card-body">

    <button
      onclick="callAudit()"
      class="button"
    >
      Refresh Records
    </button>

    <pre
      id="out-audit"
      class="response"
    >Audit activity will appear here.</pre>

  </div>

</article>

<article class="card">

  <div class="card-header">

    <div>
      <h2 class="card-title">
        Deployment Engine
      </h2>

      <p class="card-description">
        Generate Docker and Kubernetes deployment artifacts.
      </p>
    </div>

    <span class="badge primary">
      Production
    </span>

  </div>

  <div class="card-body">

    <div class="deployment-layout">

      <input
        id="appName"
        value="payment-gateway"
        class="field"
        placeholder="Application name"
      />

      <button
        onclick="callDeploy()"
        class="button button-primary"
      >
        Generate
      </button>

    </div>

    <pre
      id="out-deploy"
      class="response"
    >Deployment artifacts will be generated here.</pre>

  </div>

</article>

</section>

<footer class="footer">

  <div>
    AxilJS Cloud
    · ${config.NODE_ENV}
  </div>

  <div class="footer-links">

    <a
      href="/dashboard"
      class="footer-link"
      target="_blank"
    >
      Observability
    </a>

    <a
      href="/health"
      class="footer-link"
      target="_blank"
    >
      Health
    </a>

    <a
      href="/metrics"
      class="footer-link"
      target="_blank"
    >
      Prometheus
    </a>

  </div>

</footer>

</main>

</div>

<script>
const H = () => {
  const tenant =
    document.getElementById(
      'tenantSelect'
    )?.value;

  const headers = {
    'Content-Type':
      'application/json'
  };

  if (tenant) {
    headers['x-tenant-id'] =
      tenant;
  }

  return headers;
};

function display(id, data) {
  const element =
    document.getElementById(id);

  element.textContent =
    typeof data === 'string'
      ? data
      : JSON.stringify(
          data,
          null,
          2
        );
}

async function request(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      {
        cache: 'no-store',
        ...options
      }
    );

  let data;

  try {
    data =
      await response.json();
  } catch {
    data = {
      status:
        response.status
    };
  }

  return {
    response,
    data
  };
}

async function callTenant() {
  try {
    const result =
      await request(
        '/api/cloud/tenant',
        {
          headers: H()
        }
      );

    display(
      'out-tenant',
      result.data
    );

    callAudit();

  } catch (error) {
    display(
      'out-tenant',
      {
        error:
          'Tenant request failed'
      }
    );
  }
}

async function callFlags() {
  const userId =
    document.getElementById(
      'userIdInput'
    ).value ||
    'anonymous';

  try {
    const result =
      await request(
        '/api/cloud/flags?userId=' +
        encodeURIComponent(userId),
        {
          headers: H()
        }
      );

    display(
      'out-flags',
      result.data
    );

  } catch (error) {
    display(
      'out-flags',
      {
        error:
          'Feature evaluation failed'
      }
    );
  }
}

async function callAudit() {
  try {
    const result =
      await request(
        '/api/cloud/audit',
        {
          headers: H()
        }
      );

    display(
      'out-audit',
      result.data
    );

    const total =
      result.data?.total || 0;

    document.getElementById(
      'auditKpi'
    ).textContent =
      total;

    document.getElementById(
      'auditBadge'
    ).textContent =
      total + ' Events';

  } catch (error) {
    display(
      'out-audit',
      {
        error:
          'Audit request failed'
      }
    );
  }
}

async function callDeploy() {
  const name =
    document.getElementById(
      'appName'
    ).value ||
    'my-service';

  try {
    const result =
      await request(
        '/api/cloud/deploy',
        {
          method:
            'POST',

          headers:
            H(),

          body:
            JSON.stringify({
              appName:
                name,

              port:
                8080,

              replicas:
                3
            })
        }
      );

    display(
      'out-deploy',
      result.data
    );

  } catch (error) {
    display(
      'out-deploy',
      {
        error:
          'Deployment generation failed'
      }
    );
  }
}

async function writeSecret() {
  const name =
    document.getElementById(
      'secretName'
    ).value;

  const value =
    document.getElementById(
      'secretValue'
    ).value;

  if (!name || !value) {
    display(
      'out-secrets',
      {
        error:
          'Secret name and value are required'
      }
    );

    return;
  }

  try {
    const result =
      await request(
        '/api/cloud/secrets',
        {
          method:
            'POST',

          headers:
            H(),

          body:
            JSON.stringify({
              name,
              value
            })
        }
      );

    display(
      'out-secrets',
      result.data
    );

  } catch {
    display(
      'out-secrets',
      {
        error:
          'Secret operation failed'
      }
    );
  }
}

async function decryptSecret() {
  const name =
    document.getElementById(
      'secretName'
    ).value;

  if (!name) {
    display(
      'out-secrets',
      {
        error:
          'Secret name is required'
      }
    );

    return;
  }

  try {
    const result =
      await request(
        '/api/cloud/secrets?name=' +
        encodeURIComponent(name),
        {
          headers:
            H()
        }
      );

    display(
      'out-secrets',
      result.data
    );

  } catch {
    display(
      'out-secrets',
      {
        error:
          'Secret retrieval failed'
      }
    );
  }
}

async function writeCache() {
  const key =
    document.getElementById(
      'cacheKey'
    ).value;

  const value =
    document.getElementById(
      'cacheValue'
    ).value;

  if (!key) {
    display(
      'out-cache',
      {
        error:
          'Cache key is required'
      }
    );

    return;
  }

  try {
    const result =
      await request(
        '/api/cloud/cache',
        {
          method:
            'POST',

          headers:
            H(),

          body:
            JSON.stringify({
              key,
              value
            })
        }
      );

    display(
      'out-cache',
      result.data
    );

  } catch {
    display(
      'out-cache',
      {
        error:
          'Cache operation failed'
      }
    );
  }
}

async function readCache() {
  const key =
    document.getElementById(
      'cacheKey'
    ).value;

  try {
    const result =
      await request(
        '/api/cloud/cache?key=' +
        encodeURIComponent(key),
        {
          headers:
            H()
        }
      );

    display(
      'out-cache',
      result.data
    );

  } catch {
    display(
      'out-cache',
      {
        error:
          'Cache read failed'
      }
    );
  }
}

async function flushCacheTag() {
  const tenant =
    document.getElementById(
      'tenantSelect'
    ).value;

  const tag =
    tenant
      ? 'tenant:' + tenant
      : 'global';

  try {
    const result =
      await request(
        '/api/cloud/cache?tag=' +
        encodeURIComponent(tag),
        {
          method:
            'DELETE',

          headers:
            H()
        }
      );

    display(
      'out-cache',
      result.data
    );

  } catch {
    display(
      'out-cache',
      {
        error:
          'Cache flush failed'
      }
    );
  }
}

async function hammerRateLimit() {
  const results = [];

  for (
    let i = 0;
    i < 4;
    i++
  ) {
    try {
      const response =
        await fetch(
          '/api/cloud/tenant',
          {
            headers:
              H(),
            cache:
              'no-store'
          }
        );

      results.push({
        status:
          response.status,

        limit:
          response.headers.get(
            'X-RateLimit-Limit'
          ),

        remaining:
          response.headers.get(
            'X-RateLimit-Remaining'
          ),

        requestId:
          response.headers.get(
            'X-Request-Id'
          ),

        correlationId:
          response.headers.get(
            'X-Correlation-Id'
          )
      });

    } catch {
      results.push({
        error:
          'Request failed'
      });
    }
  }

  display(
    'out-ratelimit',
    results
  );

  callAudit();
}

async function pollAggregator() {
  try {
    const result =
      await request(
        '/api/cloud/aggregator'
      );

    display(
      'out-aggregator',
      result.data
    );

  } catch {
    display(
      'out-aggregator',
      {
        error:
          'Aggregator request failed'
      }
    );
  }
}

async function refreshHealth() {
  try {
    const started =
      performance.now();

    const result =
      await request(
        '/health'
      );

    const latency =
      Math.round(
        performance.now() -
        started
      );

    const healthy =
      result.response.ok &&
      result.data?.status === 'ok';

    const status =
      healthy
        ? 'Operational'
        : 'Degraded';

    document.getElementById(
      'systemStatus'
    ).textContent =
      status;

    document.getElementById(
      'systemStatus'
    ).className =
      'kpi-value ' +
      (
        healthy
          ? 'success'
          : 'warning'
      );

    document.getElementById(
      'globalStatus'
    ).textContent =
      status;

    document.getElementById(
      'statusDot'
    ).style.background =
      healthy
        ? 'var(--success)'
        : 'var(--warning)';

    document.getElementById(
      'httpServiceStatus'
    ).textContent =
      status;

    document.getElementById(
      'httpServiceStatus'
    ).className =
      'badge ' +
      (
        healthy
          ? 'success'
          : 'warning'
      );

    document.getElementById(
      'runtimeUptime'
    ).textContent =
      result.data?.uptime !== undefined
        ? formatUptime(
            result.data.uptime
          )
        : '—';

    document.getElementById(
      'systemStatus'
    ).title =
      'Health response: ' +
      latency +
      'ms';

  } catch {
    document.getElementById(
      'systemStatus'
    ).textContent =
      'Unavailable';

    document.getElementById(
      'systemStatus'
    ).className =
      'kpi-value';

    document.getElementById(
      'globalStatus'
    ).textContent =
      'Unavailable';

    document.getElementById(
      'statusDot'
    ).style.background =
      'var(--danger)';

    document.getElementById(
      'httpServiceStatus'
    ).textContent =
      'Unavailable';

    document.getElementById(
      'httpServiceStatus'
    ).className =
      'badge danger';
  }
}

function formatUptime(seconds) {
  const value =
    Number(seconds);

  if (!Number.isFinite(value)) {
    return '—';
  }

  if (value < 60) {
    return value.toFixed(1) + 's';
  }

  const minutes =
    Math.floor(
      value / 60
    );

  if (minutes < 60) {
    return minutes + 'm';
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return (
      hours +
      'h ' +
      (minutes % 60) +
      'm'
    );
  }

  const days =
    Math.floor(
      hours / 24
    );

  return (
    days +
    'd ' +
    (hours % 24) +
    'h'
  );
}

async function refreshAll() {
  await Promise.allSettled([
    refreshHealth(),
    callAudit(),
    pollAggregator(),
    callFlags()
  ]);
}

refreshAll();

setInterval(
  refreshHealth,
  5000
);
</script>

</body>
</html>`);
});

// ─── Startup ─────────────────────────────────────────────────────────────────

app.listen(config.PORT, config.HOST).then(() => {
  console.log('\n\x1b[32m  [AxilJS Cloud Engine Initialised Successfully]\x1b[0m');
  console.log('  ──────────────────────────────────────────────────');
  console.log(`  Interactive CLI Admin Portal:  http://localhost:${config.PORT}`);
  console.log(`  Real-time Dashboard:           http://localhost:${config.PORT}/dashboard`);
  console.log(`  K8s Liveness Probe endpoint:   http://localhost:${config.PORT}/health`);
  console.log(`  Prometheus Scrape collector:   http://localhost:${config.PORT}/metrics\n`);
});