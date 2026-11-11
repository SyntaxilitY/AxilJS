/**
 * Scaling configuration.
 *
 * Lives in `axil.scaling.json` at the project root (read by `axil capacity`
 * and `serve()`), or is passed in code with `defineScaling()`.
 *
 *   {
 *     "target":     { "rps": 1500000, "concurrentConnections": 2000000, "p99Ms": 50 },
 *     "vertical":   { "workers": "auto", "maxConnectionsPerWorker": 50000, "memoryPerWorkerMb": 512 },
 *     "horizontal": { "instances": { "min": 10, "max": 40 }, "instanceSize": { "cpus": 8, "memoryGb": 16 } }
 *   }
 */

import { existsSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScalingTarget {
  /** Peak requests per second the whole deployment must sustain. */
  rps?: number;

  /** Peak open connections (≈ concurrent users with keep-alive / websockets). */
  concurrentConnections?: number;

  /** Latency budget for the 99th percentile, in milliseconds. */
  p99Ms?: number;
}

export interface VerticalScaling {
  /** Worker processes per instance: 'auto' = one per CPU core (default). */
  workers?: number | 'auto';

  /** Connections one worker may hold open (default: 10000). */
  maxConnectionsPerWorker?: number;

  /** Memory budget per worker process in MB (default: 512). */
  memoryPerWorkerMb?: number;

  /** Grace period for in-flight requests on shutdown, ms (default: 10000). */
  shutdownTimeoutMs?: number;

  /**
   * Idle keep-alive timeout, ms (default: Node's 5000). Behind a load
   * balancer set it ABOVE the balancer's idle timeout (AWS ALB: 60 s),
   * or the balancer reuses sockets Node already closed → random 502s.
   */
  keepAliveTimeoutMs?: number;
}

export interface HorizontalScaling {
  /** Fixed count, or autoscaling bounds. Default: 1. */
  instances?: number | { min: number; max: number };

  /** Size of one instance (VM / pod). Default: this machine. */
  instanceSize?: { cpus: number; memoryGb: number };
}

export interface ScalingConfig {
  target?: ScalingTarget;
  vertical?: VerticalScaling;
  horizontal?: HorizontalScaling;

  /** Spare capacity to keep above target, 0..1 (default: 0.3 = 30%). */
  headroom?: number;
}

export interface ResolvedScaling {
  target: { rps: number; concurrentConnections: number; p99Ms: number };
  vertical: {
    workers: number;
    workersAuto: boolean;
    maxConnectionsPerWorker: number;
    memoryPerWorkerMb: number;
    shutdownTimeoutMs: number;
    keepAliveTimeoutMs?: number;
  };
  horizontal: {
    min: number;
    max: number;
    instanceSize: { cpus: number; memoryGb: number };
    instanceSizeDefaulted: boolean;
  };
  headroom: number;
}

export const SCALING_FILE = 'axil.scaling.json';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Identity helper for typed config in code. */
export function defineScaling(config: ScalingConfig): ScalingConfig {
  return config;
}

function positive(value: unknown, name: string, fallback: number, integer = false): number {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isInteger(n))) {
    throw new Error(`[@axiljs/scale] ${name} must be a positive ${integer ? 'integer' : 'number'}, got ${JSON.stringify(value)}`);
  }
  return n;
}

/**
 * Fill defaults and validate. Throws with a readable message on bad input.
 * `machine` describes the current host and is used for 'auto' and defaults.
 */
export function resolveScaling(
  config: ScalingConfig = {},
  machine: { cores: number; memoryBytes: number } = { cores: availableParallelism(), memoryBytes: 0 }
): ResolvedScaling {
  const t = config.target ?? {};
  const v = config.vertical ?? {};
  const h = config.horizontal ?? {};

  // AXIL_WORKERS overrides the file, so one config works across machine sizes
  const envWorkers = process.env.AXIL_WORKERS;
  const rawWorkers = envWorkers !== undefined && envWorkers !== '' ? (envWorkers === 'auto' ? 'auto' : Number(envWorkers)) : v.workers;
  const workersAuto = rawWorkers === undefined || rawWorkers === 'auto';
  const workers = workersAuto ? machine.cores : positive(rawWorkers, 'vertical.workers', 1, true);

  let min: number;
  let max: number;
  if (typeof h.instances === 'object' && h.instances !== null) {
    min = positive(h.instances.min, 'horizontal.instances.min', 1, true);
    max = positive(h.instances.max, 'horizontal.instances.max', min, true);
    if (max < min) throw new Error('[@axiljs/scale] horizontal.instances.max must be >= min');
  } else {
    min = max = positive(h.instances, 'horizontal.instances', 1, true);
  }

  const instanceSizeDefaulted = !h.instanceSize;
  const instanceSize = h.instanceSize
    ? {
        cpus: positive(h.instanceSize.cpus, 'horizontal.instanceSize.cpus', 1),
        memoryGb: positive(h.instanceSize.memoryGb, 'horizontal.instanceSize.memoryGb', 1)
      }
    : { cpus: machine.cores, memoryGb: Math.max(1, Math.round(machine.memoryBytes / 2 ** 30)) };

  const headroom = config.headroom ?? 0.3;
  if (!(headroom >= 0 && headroom < 5)) throw new Error('[@axiljs/scale] headroom must be between 0 and 5');

  return {
    target: {
      rps: t.rps === undefined ? 0 : positive(t.rps, 'target.rps', 0),
      concurrentConnections: t.concurrentConnections === undefined ? 0 : positive(t.concurrentConnections, 'target.concurrentConnections', 0),
      p99Ms: t.p99Ms === undefined ? 0 : positive(t.p99Ms, 'target.p99Ms', 0)
    },
    vertical: {
      workers,
      workersAuto,
      maxConnectionsPerWorker: positive(v.maxConnectionsPerWorker, 'vertical.maxConnectionsPerWorker', 10000, true),
      memoryPerWorkerMb: positive(v.memoryPerWorkerMb, 'vertical.memoryPerWorkerMb', 512),
      shutdownTimeoutMs: positive(v.shutdownTimeoutMs, 'vertical.shutdownTimeoutMs', 10000, true),
      keepAliveTimeoutMs: v.keepAliveTimeoutMs === undefined
        ? undefined
        : positive(v.keepAliveTimeoutMs, 'vertical.keepAliveTimeoutMs', 5000, true)
    },
    horizontal: { min, max, instanceSize, instanceSizeDefaulted },
    headroom
  };
}

/** Read `axil.scaling.json` from `dir`. Returns undefined when absent. */
export function loadScalingConfig(dir: string = process.cwd()): ScalingConfig | undefined {
  const file = join(dir, SCALING_FILE);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ScalingConfig;
  } catch (err: any) {
    throw new Error(`[@axiljs/scale] ${SCALING_FILE} is not valid JSON: ${err.message}`);
  }
}

/** Starter file written by `axil capacity --init`. */
export const SCALING_TEMPLATE: ScalingConfig = {
  target: { rps: 10000, concurrentConnections: 20000, p99Ms: 100 },
  vertical: { workers: 'auto', maxConnectionsPerWorker: 10000, memoryPerWorkerMb: 512 },
  horizontal: { instances: { min: 2, max: 6 }, instanceSize: { cpus: 4, memoryGb: 8 } },
  headroom: 0.3
};
