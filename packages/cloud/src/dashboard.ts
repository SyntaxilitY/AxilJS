import { RouteHandler } from '@axiljs/common';
import type { DashboardOptions } from './types';

export type { DashboardOptions };

// ─── XSS Prevention ──────────────────────────────────────────────────────────

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Dashboard Handler ───────────────────────────────────────────────────────

export function createDashboard(
  options: DashboardOptions = {}
): RouteHandler {
  const {
    metricsEndpoint = '/metrics',
    healthEndpoint = '/health',
    refreshMs = 5000,
    title = 'AxilJS Cloud Dashboard',
  } = options;

  const safeTitle = esc(title);
  const safeMetrics = esc(metricsEndpoint);
  const safeHealth = esc(healthEndpoint);
  const safeRefresh = Math.max(1000, refreshMs);
  const generatedAt = new Date().toISOString();

  return (req: any, res: any) => {
    res.raw?.setHeader?.(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'"
    );

    res.raw?.setHeader?.('X-Content-Type-Options', 'nosniff');
    res.raw?.setHeader?.('X-Frame-Options', 'DENY');
    res.raw?.setHeader?.('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.raw?.setHeader?.(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );
    res.raw?.setHeader?.(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  >

  <meta
    name="description"
    content="AxilJS Cloud infrastructure monitoring dashboard"
  >

  <title>${safeTitle}</title>

  <style>
    :root {
      --bg: #f6f8fb;
      --surface: #ffffff;
      --surface-muted: #f8fafc;

      --border: #e5e7eb;
      --border-strong: #d9dee7;

      --text: #111827;
      --text-secondary: #4b5563;
      --text-muted: #6b7280;
      --text-subtle: #9ca3af;

      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --primary-soft: #eff6ff;

      --success: #15803d;
      --success-soft: #f0fdf4;

      --warning: #b45309;
      --warning-soft: #fffbeb;

      --danger: #dc2626;
      --danger-soft: #fef2f2;

      --shadow-sm:
        0 1px 2px rgba(15, 23, 42, 0.04);

      --shadow-md:
        0 4px 12px rgba(15, 23, 42, 0.06);

      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;

      --content-width: 1440px;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    html {
      min-height: 100%;
      background: var(--bg);
    }

    body {
      margin: 0;
      min-height: 100vh;

      background:
        linear-gradient(
          180deg,
          #ffffff 0,
          #f8fafc 180px,
          var(--bg) 420px
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
    textarea,
    select {
      font: inherit;
    }

    .shell {
      width: 100%;
      min-height: 100vh;
    }

    /* ──────────────────────────────────────────────────────────────────────
       Header
       ────────────────────────────────────────────────────────────────────── */

    .topbar {
      height: 72px;

      background: rgba(255, 255, 255, 0.96);
      border-bottom: 1px solid var(--border);

      display: flex;
      align-items: center;

      position: sticky;
      top: 0;
      z-index: 20;

      backdrop-filter: blur(12px);
    }

    .topbar-inner {
      width: min(
        calc(100% - 48px),
        var(--content-width)
      );

      margin: 0 auto;

      display: flex;
      align-items: center;
      justify-content: space-between;

      gap: 24px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .brand-mark {
      width: 36px;
      height: 36px;

      border-radius: 10px;

      background:
        linear-gradient(
          135deg,
          #2563eb,
          #1d4ed8
        );

      display: grid;
      place-items: center;

      box-shadow:
        0 4px 10px rgba(37, 99, 235, 0.20);

      flex: 0 0 auto;
    }

    .brand-mark span {
      width: 15px;
      height: 15px;

      border: 2px solid #ffffff;
      border-radius: 4px;

      display: block;
    }

    .brand-copy {
      min-width: 0;
    }

    .brand-name {
      font-size: 15px;
      line-height: 20px;
      font-weight: 700;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }

    .brand-context {
      color: var(--text-muted);
      font-size: 12px;
      line-height: 16px;
      margin-top: 1px;
    }

    .topbar-meta {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .environment {
      display: inline-flex;
      align-items: center;
      gap: 7px;

      color: var(--text-secondary);

      font-size: 12px;
      font-weight: 600;

      padding: 7px 10px;

      border: 1px solid var(--border);
      border-radius: 999px;

      background: #ffffff;
    }

    .environment-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--success);
    }

    .refresh-indicator {
      color: var(--text-muted);
      font-size: 12px;
      white-space: nowrap;
    }

    /* ──────────────────────────────────────────────────────────────────────
       Main
       ────────────────────────────────────────────────────────────────────── */

    .main {
      width: min(
        calc(100% - 48px),
        var(--content-width)
      );

      margin: 0 auto;
      padding: 38px 0 48px;
    }

    .page-heading {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;

      gap: 24px;
      margin-bottom: 28px;
    }

    .heading-copy h1 {
      margin: 0;

      font-size: 28px;
      line-height: 36px;
      letter-spacing: -0.025em;
      font-weight: 750;

      color: var(--text);
    }

    .heading-copy p {
      margin: 7px 0 0;

      color: var(--text-muted);

      font-size: 14px;
      line-height: 21px;
    }

    .last-updated {
      color: var(--text-muted);
      font-size: 12px;
      white-space: nowrap;
    }

    /* ──────────────────────────────────────────────────────────────────────
       Overview
       ────────────────────────────────────────────────────────────────────── */

    .overview-grid {
      display: grid;

      grid-template-columns:
        repeat(4, minmax(0, 1fr));

      gap: 16px;

      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--surface);

      border: 1px solid var(--border);
      border-radius: var(--radius-md);

      padding: 20px;

      box-shadow: var(--shadow-sm);

      min-height: 136px;
    }

    .stat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;

      gap: 12px;

      margin-bottom: 18px;
    }

    .stat-label {
      color: var(--text-muted);

      font-size: 12px;
      line-height: 16px;

      font-weight: 600;
      letter-spacing: 0.01em;
      text-transform: uppercase;
    }

    .stat-indicator {
      width: 8px;
      height: 8px;

      border-radius: 50%;
      background: var(--border-strong);
    }

    .stat-indicator.success {
      background: var(--success);
    }

    .stat-indicator.warning {
      background: var(--warning);
    }

    .stat-indicator.danger {
      background: var(--danger);
    }

    .stat-value {
      color: var(--text);

      font-size: 28px;
      line-height: 34px;

      font-weight: 750;
      letter-spacing: -0.025em;
    }

    .stat-caption {
      margin-top: 7px;

      color: var(--text-muted);

      font-size: 12px;
      line-height: 17px;
    }

    /* ──────────────────────────────────────────────────────────────────────
       Content cards
       ────────────────────────────────────────────────────────────────────── */

    .content-grid {
      display: grid;

      grid-template-columns:
        minmax(0, 1.25fr)
        minmax(320px, 0.75fr);

      gap: 16px;

      margin-bottom: 24px;
    }

    .card {
      background: var(--surface);

      border: 1px solid var(--border);
      border-radius: var(--radius-md);

      box-shadow: var(--shadow-sm);

      overflow: hidden;
    }

    .card-header {
      min-height: 66px;

      display: flex;
      align-items: center;
      justify-content: space-between;

      padding: 16px 20px;

      border-bottom: 1px solid var(--border);

      gap: 16px;
    }

    .card-title {
      margin: 0;

      font-size: 14px;
      line-height: 20px;

      font-weight: 700;
      letter-spacing: -0.005em;
    }

    .card-description {
      margin: 3px 0 0;

      color: var(--text-muted);

      font-size: 12px;
      line-height: 17px;
    }

    .card-body {
      padding: 20px;
    }

    /* ──────────────────────────────────────────────────────────────────────
       Health
       ────────────────────────────────────────────────────────────────────── */

    .health-layout {
      display: flex;
      align-items: center;

      gap: 18px;
    }

    .health-icon {
      width: 46px;
      height: 46px;

      flex: 0 0 auto;

      display: grid;
      place-items: center;

      border-radius: 12px;

      background: var(--surface-muted);
      border: 1px solid var(--border);
    }

    .health-icon::after {
      content: "";

      width: 12px;
      height: 12px;

      border-radius: 50%;

      background: var(--text-subtle);
    }

    .health-icon.ok {
      background: var(--success-soft);
      border-color: #dcfce7;
    }

    .health-icon.ok::after {
      background: var(--success);
    }

    .health-icon.warning {
      background: var(--warning-soft);
      border-color: #fef3c7;
    }

    .health-icon.warning::after {
      background: var(--warning);
    }

    .health-icon.error {
      background: var(--danger-soft);
      border-color: #fee2e2;
    }

    .health-icon.error::after {
      background: var(--danger);
    }

    .health-status {
      font-size: 18px;
      line-height: 25px;
      font-weight: 700;
    }

    .health-message {
      margin-top: 3px;

      color: var(--text-muted);

      font-size: 12px;
      line-height: 17px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;

      min-height: 26px;

      padding: 0 9px;

      border-radius: 999px;

      font-size: 11px;
      line-height: 16px;

      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;

      border: 1px solid var(--border);
      background: var(--surface-muted);
      color: var(--text-muted);
    }

    .status-badge.ok {
      color: var(--success);
      background: var(--success-soft);
      border-color: #dcfce7;
    }

    .status-badge.warning {
      color: var(--warning);
      background: var(--warning-soft);
      border-color: #fef3c7;
    }

    .status-badge.error {
      color: var(--danger);
      background: var(--danger-soft);
      border-color: #fee2e2;
    }

    /* ──────────────────────────────────────────────────────────────────────
       Endpoint information
       ────────────────────────────────────────────────────────────────────── */

    .endpoint-list {
      display: flex;
      flex-direction: column;
    }

    .endpoint-row {
      display: flex;
      align-items: center;
      justify-content: space-between;

      gap: 16px;

      min-height: 48px;

      border-bottom: 1px solid var(--border);
    }

    .endpoint-row:last-child {
      border-bottom: 0;
    }

    .endpoint-label {
      color: var(--text-muted);

      font-size: 12px;
      font-weight: 600;
    }

    .endpoint-value {
      color: var(--text-secondary);

      font-family:
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        "Liberation Mono",
        monospace;

      font-size: 11px;

      text-align: right;
      word-break: break-all;
    }

    /* ──────────────────────────────────────────────────────────────────────
       Metrics
       ────────────────────────────────────────────────────────────────────── */

    .metrics-card {
      margin-bottom: 24px;
    }

    .metrics-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .metrics-state {
      color: var(--text-muted);
      font-size: 11px;
      white-space: nowrap;
    }

    .metrics {
      margin: 0;

      min-height: 360px;
      max-height: 520px;

      padding: 18px;

      overflow: auto;

      background: #f8fafc;

      color: #334155;

      border: 1px solid var(--border);
      border-radius: var(--radius-sm);

      font-family:
        ui-monospace,
        SFMono-Regular,
        Menlo,
        Monaco,
        Consolas,
        "Liberation Mono",
        monospace;

      font-size: 11px;
      line-height: 1.65;

      white-space: pre;
    }

    .metrics-empty {
      display: grid;
      place-items: center;

      min-height: 320px;

      color: var(--text-muted);

      font-family:
        Inter,
        ui-sans-serif,
        sans-serif;

      font-size: 13px;
    }

    /* ──────────────────────────────────────────────────────────────────────
       Footer
       ────────────────────────────────────────────────────────────────────── */

    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;

      gap: 16px;

      padding-top: 20px;

      border-top: 1px solid var(--border);

      color: var(--text-subtle);

      font-size: 11px;
      line-height: 16px;
    }

    .footer strong {
      color: var(--text-muted);
      font-weight: 600;
    }

    /* ──────────────────────────────────────────────────────────────────────
       Responsive
       ────────────────────────────────────────────────────────────────────── */

    @media (max-width: 1100px) {
      .overview-grid {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }

      .content-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 700px) {
      .topbar {
        height: auto;
        min-height: 68px;
        padding: 12px 0;
      }

      .topbar-inner {
        width: min(
          calc(100% - 32px),
          var(--content-width)
        );
      }

      .topbar-meta {
        display: none;
      }

      .main {
        width: min(
          calc(100% - 32px),
          var(--content-width)
        );

        padding-top: 28px;
      }

      .page-heading {
        align-items: flex-start;
        flex-direction: column;

        gap: 8px;
      }

      .heading-copy h1 {
        font-size: 24px;
        line-height: 32px;
      }

      .overview-grid {
        grid-template-columns: 1fr;
      }

      .stat-card {
        min-height: 120px;
      }

      .card-header {
        align-items: flex-start;
        flex-direction: column;
      }

      .metrics-toolbar {
        width: 100%;
      }

      .footer {
        align-items: flex-start;
        flex-direction: column;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        scroll-behavior: auto !important;
        transition: none !important;
        animation: none !important;
      }
    }
  </style>
</head>

<body>
  <div class="shell">

    <header class="topbar">
      <div class="topbar-inner">

        <div class="brand">
          <div class="brand-mark" aria-hidden="true">
            <span></span>
          </div>

          <div class="brand-copy">
            <div class="brand-name">AxilJS Cloud</div>
            <div class="brand-context">Infrastructure Dashboard</div>
          </div>
        </div>

        <div class="topbar-meta">
          <div class="environment">
            <span class="environment-dot"></span>
            <span id="environmentStatus">Checking status</span>
          </div>

          <div class="refresh-indicator">
            Refresh ${safeRefresh / 1000}s
          </div>
        </div>

      </div>
    </header>

    <main class="main">

      <section class="page-heading">

        <div class="heading-copy">
          <h1>${safeTitle}</h1>

          <p>
            Real-time service health, runtime status and Prometheus metrics.
          </p>
        </div>

        <div class="last-updated">
          Last updated
          <span id="lastUpdated">—</span>
        </div>

      </section>

      <!-- Overview -->

      <section class="overview-grid">

        <article class="stat-card">
          <div class="stat-header">
            <span class="stat-label">System Status</span>
            <span
              id="statusIndicator"
              class="stat-indicator"
            ></span>
          </div>

          <div
            id="statusValue"
            class="stat-value"
          >
            Checking
          </div>

          <div
            id="statusCaption"
            class="stat-caption"
          >
            Waiting for health endpoint
          </div>
        </article>

        <article class="stat-card">
          <div class="stat-header">
            <span class="stat-label">Uptime</span>
            <span class="stat-indicator success"></span>
          </div>

          <div
            id="uptime"
            class="stat-value"
          >
            —
          </div>

          <div class="stat-caption">
            Application process uptime
          </div>
        </article>

        <article class="stat-card">
          <div class="stat-header">
            <span class="stat-label">Health Endpoint</span>
            <span
              id="healthIndicator"
              class="stat-indicator"
            ></span>
          </div>

          <div
            id="healthLatency"
            class="stat-value"
          >
            —
          </div>

          <div
            id="healthCaption"
            class="stat-caption"
          >
            Request latency
          </div>
        </article>

        <article class="stat-card">
          <div class="stat-header">
            <span class="stat-label">Metrics</span>
            <span
              id="metricsIndicator"
              class="stat-indicator"
            ></span>
          </div>

          <div
            id="metricsStatus"
            class="stat-value"
          >
            Checking
          </div>

          <div
            id="metricsCaption"
            class="stat-caption"
          >
            Prometheus endpoint
          </div>
        </article>

      </section>

      <!-- Service information -->

      <section class="content-grid">

        <article class="card">

          <div class="card-header">
            <div>
              <h2 class="card-title">Service Health</h2>

              <p class="card-description">
                Current application availability and runtime state.
              </p>
            </div>

            <span
              id="healthBadge"
              class="status-badge"
            >
              Checking
            </span>
          </div>

          <div class="card-body">

            <div class="health-layout">

              <div
                id="healthIcon"
                class="health-icon"
                aria-hidden="true"
              ></div>

              <div>
                <div
                  id="healthStatus"
                  class="health-status"
                >
                  Checking service health
                </div>

                <div
                  id="healthMessage"
                  class="health-message"
                >
                  Contacting the configured health endpoint.
                </div>
              </div>

            </div>

          </div>

        </article>

        <article class="card">

          <div class="card-header">
            <div>
              <h2 class="card-title">Endpoints</h2>

              <p class="card-description">
                Active monitoring endpoints.
              </p>
            </div>
          </div>

          <div class="card-body">

            <div class="endpoint-list">

              <div class="endpoint-row">
                <span class="endpoint-label">
                  Health
                </span>

                <span class="endpoint-value">
                  ${safeHealth}
                </span>
              </div>

              <div class="endpoint-row">
                <span class="endpoint-label">
                  Metrics
                </span>

                <span class="endpoint-value">
                  ${safeMetrics}
                </span>
              </div>

              <div class="endpoint-row">
                <span class="endpoint-label">
                  Interval
                </span>

                <span class="endpoint-value">
                  ${safeRefresh} ms
                </span>
              </div>

            </div>

          </div>

        </article>

      </section>

      <!-- Metrics -->

      <section class="card metrics-card">

        <div class="card-header">

          <div>
            <h2 class="card-title">
              Prometheus Metrics
            </h2>

            <p class="card-description">
              Raw application metrics exposed by the AxilJS observability layer.
            </p>
          </div>

          <div class="metrics-toolbar">
            <span
              id="metricsState"
              class="metrics-state"
            >
              Loading
            </span>

            <span
              id="metricsBadge"
              class="status-badge"
            >
              —
            </span>
          </div>

        </div>

        <div class="card-body">

          <pre
            id="metrics"
            class="metrics"
            aria-live="polite"
          ><span class="metrics-empty">Loading metrics...</span></pre>

        </div>

      </section>

      <footer class="footer">

        <div>
          Served by
          <strong>@axiljs/cloud</strong>
        </div>

        <div>
          Dashboard generated ${esc(generatedAt)}
        </div>

      </footer>

    </main>

  </div>

  <script>
    const METRICS_URL = ${JSON.stringify(metricsEndpoint)};
    const HEALTH_URL = ${JSON.stringify(healthEndpoint)};
    const REFRESH_MS = ${safeRefresh};

    const $ = (id) => document.getElementById(id);

    function setStatusIndicator(element, status) {
      element.className = 'stat-indicator';

      if (status === 'ok') {
        element.classList.add('success');
      } else if (status === 'warning') {
        element.classList.add('warning');
      } else if (status === 'error') {
        element.classList.add('danger');
      }
    }

    function setHealthState(status) {
      const normalized =
        status === 'ok'
          ? 'ok'
          : status === 'warning'
            ? 'warning'
            : 'error';

      $('healthIcon').className =
        'health-icon ' + normalized;

      $('healthBadge').className =
        'status-badge ' + normalized;

      $('healthBadge').textContent =
        normalized === 'ok'
          ? 'Healthy'
          : normalized === 'warning'
            ? 'Warning'
            : 'Unavailable';

      $('statusIndicator').className =
        'stat-indicator ' +
        (
          normalized === 'ok'
            ? 'success'
            : normalized === 'warning'
              ? 'warning'
              : 'danger'
        );
    }

    function formatUptime(seconds) {
      const value = Number(seconds);

      if (!Number.isFinite(value)) {
        return '—';
      }

      if (value < 60) {
        return value.toFixed(1) + 's';
      }

      const minutes = Math.floor(value / 60);

      if (minutes < 60) {
        return minutes + 'm';
      }

      const hours = Math.floor(minutes / 60);

      if (hours < 24) {
        return hours + 'h ' + (minutes % 60) + 'm';
      }

      const days = Math.floor(hours / 24);

      return days + 'd ' + (hours % 24) + 'h';
    }

    async function refreshHealth() {
      const startedAt = performance.now();

      try {
        const response = await fetch(
          HEALTH_URL,
          {
            cache: 'no-store',
            headers: {
              Accept: 'application/json'
            }
          }
        );

        const latency =
          Math.round(performance.now() - startedAt);

        const data = await response.json();

        const status =
          response.ok && data.status === 'ok'
            ? 'ok'
            : response.ok
              ? 'warning'
              : 'error';

        setHealthState(status);

        $('healthLatency').textContent =
          latency + 'ms';

        $('healthIndicator').className =
          'stat-indicator ' +
          (
            status === 'ok'
              ? 'success'
              : status === 'warning'
                ? 'warning'
                : 'danger'
          );

        $('statusValue').textContent =
          status === 'ok'
            ? 'Healthy'
            : status === 'warning'
              ? 'Warning'
              : 'Unavailable';

        $('statusCaption').textContent =
          status === 'ok'
            ? 'All monitored health checks passed'
            : 'Service reported a non-healthy state';

        $('healthStatus').textContent =
          status === 'ok'
            ? 'Service is operational'
            : status === 'warning'
              ? 'Service requires attention'
              : 'Service is unavailable';

        $('healthMessage').textContent =
          data.message ||
          (
            status === 'ok'
              ? 'The application is responding normally.'
              : 'The health endpoint returned a non-healthy response.'
          );

        $('uptime').textContent =
          formatUptime(data.uptime);

        $('environmentStatus').textContent =
          status === 'ok'
            ? 'Operational'
            : status === 'warning'
              ? 'Degraded'
              : 'Unavailable';

      } catch (error) {
        setHealthState('error');

        $('healthLatency').textContent = '—';

        $('statusValue').textContent =
          'Unavailable';

        $('statusCaption').textContent =
          'Unable to reach health endpoint';

        $('healthStatus').textContent =
          'Service is unreachable';

        $('healthMessage').textContent =
          'The configured health endpoint could not be reached.';

        $('uptime').textContent = '—';

        $('environmentStatus').textContent =
          'Unavailable';
      }
    }

    async function refreshMetrics() {
      try {
        const response = await fetch(
          METRICS_URL,
          {
            cache: 'no-store',
            headers: {
              Accept: 'text/plain'
            }
          }
        );

        if (!response.ok) {
          throw new Error(
            'Metrics endpoint returned HTTP ' +
            response.status
          );
        }

        const text = await response.text();

        $('metrics').textContent =
          text || 'No metrics available.';

        $('metricsState').textContent =
          'Updated';

        $('metricsBadge').className =
          'status-badge ok';

        $('metricsBadge').textContent =
          'Available';

        $('metricsStatus').textContent =
          'Available';

        $('metricsCaption').textContent =
          'Prometheus endpoint responding';

        $('metricsIndicator').className =
          'stat-indicator success';

      } catch (error) {
        $('metrics').textContent =
          'Unable to load Prometheus metrics.';

        $('metricsState').textContent =
          'Request failed';

        $('metricsBadge').className =
          'status-badge error';

        $('metricsBadge').textContent =
          'Unavailable';

        $('metricsStatus').textContent =
          'Unavailable';

        $('metricsCaption').textContent =
          'Prometheus endpoint not responding';

        $('metricsIndicator').className =
          'stat-indicator danger';
      }
    }

    async function refresh() {
      await Promise.allSettled([
        refreshHealth(),
        refreshMetrics()
      ]);

      $('lastUpdated').textContent =
        new Date().toLocaleTimeString();
    }

    refresh();

    setInterval(
      refresh,
      REFRESH_MS
    );
  </script>
</body>
</html>`;

    res.html(html);
  };
}