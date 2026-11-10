/**
 * Health Aggregator.
 *
 * Polls multiple downstream services and combines their health
 * status into a single aggregated report.  Ideal for gateway
 * services and operational dashboards.
 *
 * Integrates with @axiljs/observability HealthChecker.
 *
 * Usage:
 *   const aggregator = new HealthAggregator([
 *     { name: 'auth-service', url: 'http://auth:3001/health' },
 *     { name: 'payment-service', url: 'http://payments:3002/health' },
 *   ])
 *   const report = await aggregator.check()
 */

import http from 'http';
import https from 'https';
import type { ServiceHealthCheck, AggregatedHealthResult } from './types';

export type { ServiceHealthCheck, AggregatedHealthResult };

export class HealthAggregator {
  private services: ServiceHealthCheck[];

  constructor(services: ServiceHealthCheck[]) {
    this.services = services;
  }

  /**
   * Add a service to monitor.
   */
  addService(service: ServiceHealthCheck): void {
    this.services.push(service);
  }

  /**
   * Check all services in parallel and return an aggregated report.
   */
  async check(): Promise<AggregatedHealthResult> {
    const results = await Promise.all(
      this.services.map(svc => this.checkSingle(svc))
    );

    const hasDown = results.some(r => r.status === 'down');
    const hasTimeout = results.some(r => r.status === 'timeout');

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (hasDown) status = 'unhealthy';
    else if (hasTimeout) status = 'degraded';

    return {
      status,
      services: results,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private checkSingle(svc: ServiceHealthCheck): Promise<AggregatedHealthResult['services'][0]> {
    const timeout = svc.timeoutMs ?? 5000;
    const start = Date.now();

    return new Promise(resolve => {
      let request: http.ClientRequest | undefined;

      const timer = setTimeout(() => {
        // Abort the hung request so its socket doesn't linger
        request?.destroy();
        resolve({
          name: svc.name,
          status: 'timeout',
          latencyMs: Date.now() - start,
          error: `Timed out after ${timeout}ms`,
        });
      }, timeout);

      const client = svc.url.startsWith('https') ? https : http;

      request = client.get(svc.url, { headers: svc.headers }, (res) => {
        clearTimeout(timer);
        const latency = Date.now() - start;

        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ name: svc.name, status: 'up', latencyMs: latency });
        } else {
          resolve({
            name: svc.name,
            status: 'down',
            latencyMs: latency,
            error: `HTTP ${res.statusCode}`,
          });
        }
        res.resume(); // drain
      });

      request.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          name: svc.name,
          status: 'down',
          latencyMs: Date.now() - start,
          error: err.message,
        });
      });
    });
  }
}