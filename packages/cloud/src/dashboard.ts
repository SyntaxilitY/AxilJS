/**
 * Monitoring Dashboard.
 * Simple HTML dashboard showing live metrics, logs, and health.
 * Served at /dashboard.
 */

import { RouteHandler } from '@restjs/common';
import { MetricsRegistry } from '@restjs/observability';

export function createDashboard(registry: MetricsRegistry): RouteHandler {
  return (req, res) => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>REstJS Dashboard</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #0f172a; color: #e2e8f0; }
    h1 { color: #60a5fa; }
    .card { background: #1e2937; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
    .metric { font-size: 2.2rem; font-weight: bold; color: #22c55e; }
    pre { background: #0f172a; padding: 15px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>REstJS Monitoring Dashboard</h1>
  <div class="card">
    <h2>Live Metrics</h2>
    <pre id="metrics">${registry.toPrometheus()}</pre>
  </div>
  <div class="card">
    <h2>Health Status</h2>
    <div id="health">Loading...</div>
  </div>
  <script>
    setInterval(() => {
      fetch('/metrics').then(r => r.text()).then(t => {
        document.getElementById('metrics').textContent = t;
      });
      fetch('/health').then(r => r.json()).then(d => {
        document.getElementById('health').innerHTML = 
          '<b>Status:</b> ' + d.status + '<br>' +
          '<b>Uptime:</b> ' + d.uptime + 's';
      });
    }, 3000);
  </script>
</body>
</html>`;
    res.html(html);
  };
}