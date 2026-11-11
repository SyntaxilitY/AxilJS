/**
 * serve(): vertical scaling with node:cluster.
 *
 *   import { serve } from '@axiljs/scale'
 *
 *   serve(() => buildApp(), { port: 3000 })
 *
 * With workers > 1 the primary forks one worker per core (from
 * axil.scaling.json, `scaling`, or AXIL_WORKERS), restarts crashed workers
 * with backoff, stops on a crash loop, and drains every worker on
 * SIGTERM/SIGINT. With workers = 1 it runs the app in-process with the
 * same graceful shutdown.
 *
 * Each worker gets:
 *   --max-old-space-size = vertical.memoryPerWorkerMb
 *   server.maxConnections = vertical.maxConnectionsPerWorker
 *   server.keepAliveTimeout = vertical.keepAliveTimeoutMs (when set)
 */

import cluster from 'node:cluster';
import type { Worker } from 'node:cluster';
import type { Server } from 'node:http';
import { loadScalingConfig, resolveScaling } from './config';
import type { ResolvedScaling, ScalingConfig } from './config';
import { detectSystem } from './system';
import { hostChecks } from './planner';
import type { Finding } from './planner';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Anything with listen/close, e.g. @axiljs/core's Application. */
export interface Listenable {
  listen(port?: number, host?: string): Promise<unknown>;
  close?(): Promise<void>;
  getServer?(): Server | null;
}

export interface ServeOptions {
  port?: number;
  host?: string;
  /** Scaling config in code. Default: axil.scaling.json in cwd, else defaults. */
  scaling?: ScalingConfig;
  /** Crashes allowed per minute before the primary gives up (default: 5). */
  maxRestarts?: number;
  /** Print host-check warnings at startup (default: true). */
  checkOnStart?: boolean;
  /** Logger (default: console with an [axil:scale] prefix). */
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export interface ServeHandle {
  role: 'primary' | 'worker' | 'single';
  workers: number;
  scaling: ResolvedScaling;
  /** Startup host-check findings (primary / single only). */
  findings: Finding[];
  /** Drain and stop (all workers, when called on the primary). */
  shutdown(): Promise<void>;
}

const SHUTDOWN = 'axil:shutdown';

const defaultLog: NonNullable<ServeOptions['log']> = (level, message) => {
  const line = `[axil:scale] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

// ─── Worker side ──────────────────────────────────────────────────────────────

async function runApp(
  factory: () => Listenable | Promise<Listenable>,
  options: ServeOptions,
  scaling: ResolvedScaling,
  quiet: boolean
): Promise<() => Promise<void>> {
  const app = await factory();

  // Only the first worker prints core's startup banner
  const log = console.log;
  if (quiet) console.log = () => {};
  try {
    await app.listen(options.port, options.host);
  } finally {
    console.log = log;
  }

  const server = app.getServer?.() ?? null;
  if (server) {
    server.maxConnections = scaling.vertical.maxConnectionsPerWorker;
    const keepAlive = scaling.vertical.keepAliveTimeoutMs;
    if (keepAlive !== undefined) {
      server.keepAliveTimeout = keepAlive;
      // headersTimeout must exceed keepAliveTimeout or Node may drop reused sockets
      if (server.headersTimeout <= keepAlive) server.headersTimeout = keepAlive + 1000;
    }
  }

  let draining: Promise<void> | null = null;
  return () => {
    if (draining) return draining;
    draining = (async () => {
      const force = setTimeout(() => server?.closeAllConnections?.(), scaling.vertical.shutdownTimeoutMs);
      force.unref();
      // close() drops idle keep-alive sockets only once; sockets that finish
      // their in-flight request later would otherwise linger until the
      // keep-alive timeout. Sweep them while draining.
      const sweep = setInterval(() => server?.closeIdleConnections?.(), 50);
      sweep.unref();
      server?.closeIdleConnections?.();
      try {
        if (app.close) await app.close();
        else if (server) await new Promise<void>(r => server.close(() => r()));
      } finally {
        clearTimeout(force);
        clearInterval(sweep);
      }
    })();
    return draining;
  };
}

// ─── serve ────────────────────────────────────────────────────────────────────

export async function serve(
  factory: () => Listenable | Promise<Listenable>,
  options: ServeOptions = {}
): Promise<ServeHandle> {
  const log = options.log ?? defaultLog;
  const system = detectSystem();
  const scaling = resolveScaling(options.scaling ?? loadScalingConfig() ?? {}, system);
  const workers = scaling.vertical.workers;

  // ── Worker process ──
  if (cluster.isWorker) {
    const id = Number(process.env.AXIL_WORKER_ID ?? cluster.worker?.id ?? 1);
    const drain = await runApp(factory, options, scaling, id !== 1);
    const stop = () => drain().then(() => process.exit(0), () => process.exit(1));
    process.on('message', msg => { if ((msg as any)?.type === SHUTDOWN) stop(); });
    process.on('disconnect', stop);          // primary died
    process.on('SIGTERM', stop);
    process.on('SIGINT', () => {});          // terminal Ctrl+C: the primary coordinates
    return { role: 'worker', workers, scaling, findings: [], shutdown: drain };
  }

  const findings = hostChecks(scaling, system);
  if (options.checkOnStart !== false) {
    for (const f of findings) {
      if (f.level === 'warn' || f.level === 'fail') {
        log(f.level === 'fail' ? 'error' : 'warn', `${f.title}${f.fix ? ` → ${f.fix}` : ''}`);
      }
    }
  }

  // ── Single process ──
  if (workers <= 1) {
    const drain = await runApp(factory, options, scaling, false);
    const stop = () => drain().then(() => process.exit(0), () => process.exit(1));
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    return { role: 'single', workers: 1, scaling, findings, shutdown: drain };
  }

  // ── Primary ──
  const memFlag = `--max-old-space-size=${Math.floor(scaling.vertical.memoryPerWorkerMb)}`;
  const hasMemFlag = process.execArgv.some(a => a.startsWith('--max-old-space-size'));
  cluster.setupPrimary({ execArgv: hasMemFlag ? process.execArgv : [...process.execArgv, memFlag] });

  const maxRestarts = options.maxRestarts ?? 5;
  const crashes: number[] = [];
  const slots = new Map<Worker, number>();
  let stopping = false;
  let stopped: Promise<void> | null = null;

  const fork = (slot: number) => {
    const worker = cluster.fork({ AXIL_WORKER_ID: String(slot) });
    slots.set(worker, slot);
  };

  const shutdown = (): Promise<void> => {
    if (stopped) return stopped;
    stopping = true;
    stopped = new Promise<void>(resolve => {
      const live = () => Object.values(cluster.workers ?? {}).filter(Boolean) as Worker[];
      if (live().length === 0) return resolve();
      log('info', `draining ${live().length} workers (up to ${scaling.vertical.shutdownTimeoutMs} ms)`);
      for (const w of live()) w.send({ type: SHUTDOWN });
      const kill = setTimeout(() => live().forEach(w => w.process.kill('SIGKILL')), scaling.vertical.shutdownTimeoutMs + 2000);
      kill.unref();
      cluster.on('exit', () => {
        if (live().length === 0) {
          clearTimeout(kill);
          resolve();
        }
      });
    });
    return stopped;
  };

  cluster.on('exit', (worker, code, signal) => {
    const slot = slots.get(worker) ?? 0;
    slots.delete(worker);
    if (stopping) return;

    const now = Date.now();
    crashes.push(now);
    while (crashes.length && crashes[0] < now - 60_000) crashes.shift();

    if (crashes.length > maxRestarts) {
      log('error', `worker ${slot} died (${signal ?? code}); ${crashes.length} crashes in the last minute, giving up`);
      process.exitCode = 1;
      shutdown().then(() => process.exit(1));
      return;
    }
    const delay = Math.min(10_000, 250 * 2 ** (crashes.length - 1));
    log('warn', `worker ${slot} died (${signal ?? code}); restarting in ${delay} ms`);
    setTimeout(() => { if (!stopping) fork(slot); }, delay).unref();
  });

  const exitAfter = () => shutdown().then(() => process.exit(process.exitCode ?? 0));
  process.once('SIGTERM', exitAfter);
  process.once('SIGINT', exitAfter);

  // Wait until every worker is listening
  await new Promise<void>((resolve, reject) => {
    let ready = 0;
    const onListening = () => {
      if (++ready === workers) {
        cluster.off('listening', onListening);
        resolve();
      }
    };
    cluster.on('listening', onListening);
    cluster.once('exit', (_w, code) => {
      if (ready < workers) {
        // Startup failure (bad port, throwing factory): don't crash-loop, stop everything
        shutdown().finally(() =>
          reject(new Error(`a worker exited during startup (code ${code}); see its error above`))
        );
      }
    });
    for (let slot = 1; slot <= workers; slot++) fork(slot);
  });

  log('info', `${workers} workers listening (${scaling.vertical.workersAuto ? 'auto: one per core' : 'configured'}), ${scaling.vertical.maxConnectionsPerWorker} max connections each`);
  return { role: 'primary', workers, scaling, findings, shutdown };
}
