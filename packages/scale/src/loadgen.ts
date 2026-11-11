/**
 * Dependency-free HTTP load generator.
 *
 * Runs keep-alive connections across worker threads (one event loop per
 * thread), records every response latency in a 50 µs histogram and reports
 * throughput and percentiles.
 *
 *   const r = await loadTest({ url: 'http://127.0.0.1:3000/health', durationMs: 5000 })
 *   r.rps, r.latency.p99, r.errors
 *
 * The generator needs CPU too: load-testing a server on the same machine
 * understates what that server can do on its own hardware.
 */

import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { spawn } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoadTestOptions {
  url: string;
  /** Measured duration in ms (default: 5000). */
  durationMs?: number;
  /** Discarded warm-up before measuring, ms (default: 1000). */
  warmupMs?: number;
  /** Total keep-alive connections across all threads (default: 128). */
  connections?: number;
  /** Generator threads (default: min(4, cores - 1), at least 1). */
  threads?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface LatencySummary {
  p50: number;
  p90: number;
  p99: number;
  max: number;
  mean: number;
}

export interface LoadTestResult {
  url: string;
  durationMs: number;
  connections: number;
  threads: number;
  requests: number;
  rps: number;
  /** Responses with status >= 400. */
  non2xx: number;
  /** Network errors (refused, reset, timeout). */
  errors: number;
  bytes: number;
  /** Milliseconds. */
  latency: LatencySummary;
}

// ─── Histogram ────────────────────────────────────────────────────────────────

const BUCKET_US = 50;
const BUCKETS = 100_000; // 50 µs × 100k = 5 s; slower responses land in the last bucket

export function summarize(hist: Uint32Array): LatencySummary {
  let total = 0;
  let sum = 0;
  let maxIndex = 0;
  for (let i = 0; i < hist.length; i++) {
    if (hist[i]) {
      total += hist[i];
      sum += hist[i] * (i + 0.5);
      maxIndex = i;
    }
  }
  const toMs = (i: number) => Math.round(((i + 0.5) * BUCKET_US) / 10) / 100;
  if (total === 0) return { p50: 0, p90: 0, p99: 0, max: 0, mean: 0 };

  const at = (q: number) => {
    const rank = Math.ceil(total * q);
    let seen = 0;
    for (let i = 0; i < hist.length; i++) {
      seen += hist[i];
      if (seen >= rank) return toMs(i);
    }
    return toMs(maxIndex);
  };

  return {
    p50: at(0.5),
    p90: at(0.9),
    p99: at(0.99),
    max: toMs(maxIndex),
    mean: Math.round(((sum / total) * BUCKET_US) / 10) / 100
  };
}

// ─── Worker thread body (plain JS, evaluated) ─────────────────────────────────

const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const http = require('node:http');
const https = require('node:https');
const { url, connections, durationMs, warmupMs, method, headers, body, BUCKET_US, BUCKETS } = workerData;
const u = new URL(url);
const lib = u.protocol === 'https:' ? https : http;
const agent = new lib.Agent({ keepAlive: true, maxSockets: connections });
const hist = new Uint32Array(BUCKETS);
const start = Date.now();
const measureFrom = start + warmupMs;
const end = measureFrom + durationMs;
let requests = 0, non2xx = 0, errors = 0, bytes = 0, live = connections;

function finish() {
  agent.destroy();
  parentPort.postMessage({ requests, non2xx, errors, bytes, hist }, [hist.buffer]);
}

function fire() {
  if (Date.now() >= end) { if (--live === 0) finish(); return; }
  const t0 = process.hrtime.bigint();
  const req = lib.request({
    hostname: u.hostname, port: u.port, path: u.pathname + u.search,
    method, headers, agent
  }, res => {
    res.on('data', c => { bytes += c.length; });
    res.on('end', () => {
      if (Date.now() >= measureFrom) {
        const us = Number(process.hrtime.bigint() - t0) / 1000;
        hist[Math.min(BUCKETS - 1, Math.floor(us / BUCKET_US))]++;
        requests++;
        if (res.statusCode >= 400) non2xx++;
      }
      fire();
    });
  });
  req.on('error', () => {
    if (Date.now() >= measureFrom) errors++;
    setTimeout(fire, 10); // don't spin on a refused port
  });
  req.end(body);
}

for (let i = 0; i < connections; i++) fire();
`;

// ─── loadTest ─────────────────────────────────────────────────────────────────

export async function loadTest(options: LoadTestOptions): Promise<LoadTestResult> {
  const durationMs = options.durationMs ?? 5000;
  const warmupMs = options.warmupMs ?? 1000;
  const threads = Math.max(1, options.threads ?? Math.min(4, availableParallelism() - 1));
  const connections = Math.max(threads, options.connections ?? 128);
  new URL(options.url); // validate early

  const perThread = (i: number) =>
    Math.floor(connections / threads) + (i < connections % threads ? 1 : 0);

  const results = await Promise.all(
    Array.from({ length: threads }, (_, i) =>
      new Promise<{ requests: number; non2xx: number; errors: number; bytes: number; hist: Uint32Array }>((resolve, reject) => {
        const worker = new Worker(WORKER_SOURCE, {
          eval: true,
          workerData: {
            url: options.url,
            connections: perThread(i),
            durationMs,
            warmupMs,
            method: options.method ?? 'GET',
            headers: options.headers ?? {},
            body: options.body,
            BUCKET_US,
            BUCKETS
          }
        });
        worker.once('message', msg => resolve({ ...msg, hist: new Uint32Array(msg.hist.buffer ?? msg.hist) }));
        worker.once('error', reject);
      })
    )
  );

  const hist = new Uint32Array(BUCKETS);
  let requests = 0, non2xx = 0, errors = 0, bytes = 0;
  for (const r of results) {
    requests += r.requests;
    non2xx += r.non2xx;
    errors += r.errors;
    bytes += r.bytes;
    for (let i = 0; i < BUCKETS; i++) hist[i] += r.hist[i];
  }

  return {
    url: options.url,
    durationMs,
    connections,
    threads,
    requests,
    rps: Math.round(requests / (durationMs / 1000)),
    non2xx,
    errors,
    bytes,
    latency: summarize(hist)
  };
}

// ─── Calibration ──────────────────────────────────────────────────────────────

export interface CalibrationResult {
  /** What was measured, e.g. '@axiljs/core 0.3.2' or 'node:http'. */
  server: string;
  /** Throughput of ONE worker process on one core. */
  rpsPerWorker: number;
  latency: LatencySummary;
  /** True when the generator had to share cores with the server (< 3 cores). */
  contended: boolean;
  result: LoadTestResult;
}

const SERVER_SOURCE = `
const corePath = process.env.AXIL_CALIBRATE_CORE;
const done = (port, name) => process.stdout.write('READY ' + port + ' ' + name + '\\n');
if (corePath) {
  const { Application } = require(corePath);
  let version = '';
  try { version = require(require('node:path').join(corePath, '..', '..', 'package.json')).version; } catch {}
  const log = console.log; console.log = () => {};          // silence the banner
  const app = new Application({ logging: false, env: 'production' });
  app.get('/', (req, res) => res.success({ ok: true }));
  app.listen(0, '127.0.0.1').then(({ port }) => { console.log = log; done(port, '@axiljs/core' + (version ? ' ' + version : '')); });
} else {
  const server = require('node:http').createServer((req, res) => {
    const b = '{"status":200,"code":"HTTP_200_OK","message":"ok","data":{"ok":true}}';
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) });
    res.end(b);
  });
  server.listen(0, '127.0.0.1', () => done(server.address().port, 'node:http'));
}
`;

/**
 * Measure what ONE worker can serve on this machine, by starting a
 * single-process hello-world server and load-testing it from other cores.
 * This is the framework ceiling: real routes with I/O will be slower.
 *
 * @param coreEntry  Resolved path to @axiljs/core's entry (omit for raw node:http).
 */
export async function calibrate(
  options: { coreEntry?: string } & Omit<LoadTestOptions, 'url'> = {}
): Promise<CalibrationResult> {
  const child = spawn(process.execPath, ['-e', SERVER_SOURCE], {
    env: { ...process.env, AXIL_CALIBRATE_CORE: options.coreEntry ?? '', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    const { port, name } = await new Promise<{ port: number; name: string }>((resolve, reject) => {
      let out = '';
      let err = '';
      const timer = setTimeout(() => reject(new Error('calibration server did not start in 15s')), 15000);
      child.stdout!.on('data', chunk => {
        out += chunk;
        const m = /READY (\d+) (.+)\n/.exec(out);
        if (m) {
          clearTimeout(timer);
          resolve({ port: Number(m[1]), name: m[2] });
        }
      });
      child.stderr!.on('data', chunk => { err += chunk; });
      child.once('exit', code => {
        clearTimeout(timer);
        reject(new Error(`calibration server exited (${code}): ${err.trim().split('\n').pop()}`));
      });
    });

    const cores = availableParallelism();
    const result = await loadTest({
      ...options,
      url: `http://127.0.0.1:${port}/`,
      threads: options.threads ?? Math.max(1, Math.min(4, cores - 1))
    });

    return {
      server: name,
      rpsPerWorker: result.rps,
      latency: result.latency,
      contended: cores < 3,
      result
    };
  } finally {
    child.kill();
  }
}
