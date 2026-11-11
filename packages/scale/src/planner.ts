/**
 * Capacity planner.
 *
 * Pure function: given the resolved scaling config, the host, and a
 * measured per-worker throughput, decide whether the configured vertical
 * and horizontal scaling can carry the target, and say what to change.
 *
 * Model (deliberately simple and printed in the report):
 *   instance rps   = rpsPerWorker × min(workers, cpus) × clusterEfficiency
 *   required rps   = target.rps × (1 + headroom)
 *   instances      = ceil(required rps / instance rps)
 *   instance mem   = workers × memoryPerWorkerMb + connections × memoryPerConnectionKb
 */

import type { ResolvedScaling } from './config';
import type { SystemInfo } from './system';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Level = 'ok' | 'info' | 'warn' | 'fail';

export interface Finding {
  level: Level;
  area: 'throughput' | 'vertical' | 'horizontal' | 'connections' | 'memory' | 'latency' | 'os' | 'measurement';
  title: string;
  detail?: string;
  fix?: string;
}

export interface Measurement {
  /** Requests/second ONE worker process sustained. */
  rpsPerWorker: number;
  /** p99 latency observed while measuring, ms. */
  p99Ms?: number;
  /** calibrated = framework hello-world ceiling; measured = your real route. */
  source: 'calibrated' | 'measured' | 'assumed';
  label?: string;
}

export interface CapacityInput {
  scaling: ResolvedScaling;
  system: SystemInfo;
  measurement: Measurement;
  /** Share of linear speed-up kept per extra worker (default 0.85). */
  clusterEfficiency?: number;
  /** Memory per open keep-alive connection, KB (default 48; WebSockets cost more). */
  memoryPerConnectionKb?: number;
}

export interface CapacityReport {
  verdict: 'ok' | 'warn' | 'fail';
  model: { rpsPerWorker: number; clusterEfficiency: number; memoryPerConnectionKb: number; headroom: number; source: Measurement['source'] };
  thisMachine: { cores: number; workers: number; rps: number };
  instance: { cpus: number; memoryGb: number; workers: number; rps: number; memoryMbNeeded: number; connections: number };
  deployment: { minInstances: number; maxInstances: number; rpsAtMin: number; rpsAtMax: number };
  required: { rps: number; instances: number } | null;
  recommended: { workers: number; instances: { min: number; max: number } } | null;
  findings: Finding[];
}

// ─── Formatting helpers (used in finding text) ────────────────────────────────

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 2)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}

// ─── Planner ──────────────────────────────────────────────────────────────────

export function planCapacity(input: CapacityInput): CapacityReport {
  const { scaling, system, measurement } = input;
  const eff = input.clusterEfficiency ?? 0.85;
  const kbPerConn = input.memoryPerConnectionKb ?? 48;
  const perWorker = Math.max(0, measurement.rpsPerWorker);
  const findings: Finding[] = [];

  const speed = (workers: number, cpus: number) => {
    const effective = Math.max(1, Math.min(workers, Math.floor(cpus) || 1));
    return perWorker * effective * (effective > 1 ? eff : 1);
  };

  // ── This machine (vertical) ──
  const hostCpus = system.cgroupCpus ?? system.cores;
  const hostWorkers = scaling.vertical.workers;
  const thisMachineRps = speed(hostWorkers, hostCpus);

  findings.push(...hostChecks(scaling, system));

  // Oversubscription is reported by hostChecks
  if (hostWorkers > hostCpus) {
    // nothing to add
  } else if (!scaling.vertical.workersAuto && hostWorkers < Math.floor(hostCpus)) {
    findings.push({
      level: 'info',
      area: 'vertical',
      title: `${hostWorkers} of ${Math.floor(hostCpus)} cores used on this machine`,
      fix: `workers: 'auto' would give ~${fmtNum(speed(Math.floor(hostCpus), hostCpus))} req/s here.`
    });
  } else {
    findings.push({
      level: 'ok',
      area: 'vertical',
      title: `${Math.min(hostWorkers, Math.floor(hostCpus))} workers × ${fmtNum(perWorker)} req/s ≈ ${fmtNum(thisMachineRps)} req/s on this machine`
    });
  }

  // ── One instance of the configured size ──
  const size = scaling.horizontal.instanceSize;
  const instWorkers = scaling.vertical.workersAuto ? Math.max(1, Math.floor(size.cpus)) : scaling.vertical.workers;
  const instanceRps = speed(instWorkers, size.cpus);

  if (!scaling.vertical.workersAuto && instWorkers > size.cpus) {
    findings.push({
      level: 'warn',
      area: 'vertical',
      title: `${instWorkers} workers on a ${size.cpus}-CPU instance: oversubscribed`,
      fix: `Use workers: 'auto' so each instance runs one worker per CPU.`
    });
  }
  if (scaling.horizontal.instanceSizeDefaulted && scaling.horizontal.max > 1) {
    findings.push({
      level: 'info',
      area: 'horizontal',
      title: 'horizontal.instanceSize not set; assuming instances like this machine',
      fix: 'Set instanceSize to your VM / pod size ({ cpus, memoryGb }).'
    });
  }

  // ── Deployment (horizontal) ──
  const { min, max } = scaling.horizontal;
  const deployment = { minInstances: min, maxInstances: max, rpsAtMin: instanceRps * min, rpsAtMax: instanceRps * max };

  let required: CapacityReport['required'] = null;
  let recommended: CapacityReport['recommended'] = null;

  if (perWorker <= 0) {
    findings.push({ level: 'fail', area: 'measurement', title: 'Measurement returned 0 req/s; cannot plan', fix: 'Check the URL / server and measure again.' });
  } else if (scaling.target.rps > 0) {
    const requiredRps = scaling.target.rps * (1 + scaling.headroom);
    const instances = Math.ceil(requiredRps / instanceRps);
    required = { rps: requiredRps, instances };
    recommended = {
      workers: Math.max(1, Math.floor(size.cpus)),
      instances: { min: Math.max(Math.ceil(instances / 3), Math.min(2, instances)), max: instances }
    };

    const headroomPct = Math.round(scaling.headroom * 100);
    if (instances > max) {
      findings.push({
        level: 'fail',
        area: 'throughput',
        title: `Target ${fmtNum(scaling.target.rps)} req/s needs ${instances} instances; config allows ${max}`,
        detail: `${max} × ${fmtNum(instanceRps)} req/s = ${fmtNum(deployment.rpsAtMax)} req/s, short of ${fmtNum(requiredRps)} (target + ${headroomPct}% headroom).`,
        fix: `Raise horizontal.instances.max to ${instances}, or use bigger instances (${Math.ceil(requiredRps / max / (perWorker * eff))} CPUs each at ${max} instances).`
      });
    } else {
      findings.push({
        level: 'ok',
        area: 'throughput',
        title: `Target ${fmtNum(scaling.target.rps)} req/s fits: ${instances} of max ${max} instances needed`,
        detail: `${instances} × ${fmtNum(instanceRps)} req/s ≥ ${fmtNum(requiredRps)} (target + ${headroomPct}% headroom).`
      });
      if (min < instances) {
        findings.push({
          level: 'info',
          area: 'horizontal',
          title: `At min ${min} instance${min > 1 ? 's' : ''} you serve ~${fmtNum(deployment.rpsAtMin)} req/s; the autoscaler must reach ${instances} for peak`,
          detail: 'Scale-up takes time (new pods, warm-up). Raise min if peaks arrive suddenly.'
        });
      }
    }
    if (max === 1 && instances > 1) {
      findings.push({
        level: 'info',
        area: 'horizontal',
        title: 'One server cannot reach this target; horizontal scaling is required',
        detail: 'No Node.js (or other) framework serves millions of req/s from one machine; every large deployment spreads load over many instances behind a load balancer.'
      });
    }
  } else {
    findings.push({
      level: 'info',
      area: 'throughput',
      title: `No target.rps set. Deployment capacity: ${fmtNum(deployment.rpsAtMin)}–${fmtNum(deployment.rpsAtMax)} req/s`,
      fix: 'Set target.rps in axil.scaling.json to get a verdict.'
    });
  }

  // ── Connections & memory per instance ──
  const conns = scaling.target.concurrentConnections;
  const instanceConns = conns > 0 ? Math.ceil(conns / max) : instWorkers * scaling.vertical.maxConnectionsPerWorker;
  const perWorkerConns = Math.ceil(instanceConns / instWorkers);

  if (conns > 0) {
    if (perWorkerConns > scaling.vertical.maxConnectionsPerWorker) {
      const neededInstances = Math.ceil(conns / (instWorkers * scaling.vertical.maxConnectionsPerWorker));
      findings.push({
        level: 'fail',
        area: 'connections',
        title: `${fmtNum(conns)} connections → ${fmtNum(perWorkerConns)} per worker; limit is ${fmtNum(scaling.vertical.maxConnectionsPerWorker)}`,
        fix: `Raise vertical.maxConnectionsPerWorker to ${perWorkerConns}, or run ${neededInstances} instances.`
      });
    } else {
      findings.push({
        level: 'ok',
        area: 'connections',
        title: `${fmtNum(conns)} connections → ${fmtNum(perWorkerConns)} per worker at ${max} instance${max > 1 ? 's' : ''} (limit ${fmtNum(scaling.vertical.maxConnectionsPerWorker)})`
      });
    }
  }

  const memoryMbNeeded = Math.ceil(instWorkers * scaling.vertical.memoryPerWorkerMb + (instanceConns * kbPerConn) / 1024);
  const memoryMbAvailable = size.memoryGb * 1024 * 0.85; // leave room for the OS and page cache
  if (memoryMbNeeded > memoryMbAvailable) {
    findings.push({
      level: 'fail',
      area: 'memory',
      title: `Each instance needs ~${(memoryMbNeeded / 1024).toFixed(1)} GB; ${size.memoryGb} GB instances give ~${(memoryMbAvailable / 1024).toFixed(1)} GB usable`,
      detail: `${instWorkers} workers × ${scaling.vertical.memoryPerWorkerMb} MB + ${fmtNum(instanceConns)} connections × ${kbPerConn} KB.`,
      fix: `Use ≥ ${Math.ceil(memoryMbNeeded / 1024 / 0.85)} GB instances, more instances, or lower memoryPerWorkerMb.`
    });
  } else {
    findings.push({
      level: 'ok',
      area: 'memory',
      title: `Instance memory ~${(memoryMbNeeded / 1024).toFixed(1)} GB of ${size.memoryGb} GB`
    });
  }

  // ── Latency ──
  if (scaling.target.p99Ms > 0 && measurement.p99Ms !== undefined) {
    if (measurement.p99Ms > scaling.target.p99Ms) {
      findings.push({
        level: 'warn',
        area: 'latency',
        title: `p99 at full load was ${measurement.p99Ms} ms; target is ${scaling.target.p99Ms} ms`,
        detail: 'Measured at saturation. With the headroom above, instances run cooler and p99 drops; measure at target load to confirm.'
      });
    } else {
      findings.push({ level: 'ok', area: 'latency', title: `p99 ${measurement.p99Ms} ms at full load (target ${scaling.target.p99Ms} ms)` });
    }
  }

  // ── Measurement caveat ──
  if (measurement.source !== 'measured') {
    findings.push({
      level: 'info',
      area: 'measurement',
      title: measurement.source === 'calibrated'
        ? `Based on a hello-world calibration (${measurement.label ?? 'framework ceiling'})`
        : 'Based on an assumed per-worker throughput',
      detail: 'Real routes (DB, auth, validation) are slower. Plan with your own numbers: `axil capacity --url http://host:port/route --server-workers N`.'
    });
  }

  const verdict = findings.some(f => f.level === 'fail') ? 'fail' : findings.some(f => f.level === 'warn') ? 'warn' : 'ok';

  return {
    verdict,
    model: { rpsPerWorker: perWorker, clusterEfficiency: eff, memoryPerConnectionKb: kbPerConn, headroom: scaling.headroom, source: measurement.source },
    thisMachine: { cores: system.cores, workers: hostWorkers, rps: thisMachineRps },
    instance: { cpus: size.cpus, memoryGb: size.memoryGb, workers: instWorkers, rps: instanceRps, memoryMbNeeded, connections: instanceConns },
    deployment,
    required,
    recommended,
    findings
  };
}

// ─── Host checks (no measurement needed; also run by serve() at startup) ──────

export function hostChecks(scaling: ResolvedScaling, system: SystemInfo): Finding[] {
  const findings: Finding[] = [];
  const cpus = system.cgroupCpus ?? system.cores;
  const workers = scaling.vertical.workers;

  if (system.cgroupCpus !== null && scaling.vertical.workersAuto && system.cgroupCpus < system.cores) {
    findings.push({
      level: 'warn',
      area: 'vertical',
      title: `workers: 'auto' sees ${system.cores} cores, but the container is limited to ${system.cgroupCpus} CPUs`,
      detail: 'Extra workers just compete for the same CPU quota.',
      fix: `Set vertical.workers to ${Math.max(1, Math.floor(system.cgroupCpus))} (or AXIL_WORKERS).`
    });
  } else if (workers > cpus) {
    findings.push({
      level: 'warn',
      area: 'vertical',
      title: `${workers} workers on ${cpus} CPUs: oversubscribed`,
      detail: 'Workers beyond the core count add context switching, not throughput.',
      fix: `Use workers: 'auto' or ≤ ${Math.floor(cpus)}.`
    });
  }

  // Each worker gets --max-old-space-size=memoryPerWorkerMb (see serve())
  const memNeeded = workers * scaling.vertical.memoryPerWorkerMb;
  const memAvailable = (system.cgroupMemoryBytes ?? system.memoryBytes) / 2 ** 20;
  if (memNeeded > memAvailable * 0.85) {
    findings.push({
      level: 'warn',
      area: 'memory',
      title: `This machine: ${workers} workers × ${scaling.vertical.memoryPerWorkerMb} MB = ${(memNeeded / 1024).toFixed(1)} GB, more than the ${(memAvailable / 1024).toFixed(1)} GB available`,
      fix: 'Lower workers or memoryPerWorkerMb on this host.'
    });
  }

  if (system.fdLimit !== null && Number.isFinite(system.fdLimit)) {
    const needed = scaling.vertical.maxConnectionsPerWorker + 256;
    if (system.fdLimit < needed) {
      findings.push({
        level: 'fail',
        area: 'os',
        title: `Open-file limit is ${fmtNum(system.fdLimit)}; each worker may need ${fmtNum(needed)} sockets`,
        detail: 'New connections fail with EMFILE once the limit is hit.',
        fix: `Raise it: \`ulimit -n ${Math.max(65536, needed)}\` (systemd: LimitNOFILE, Docker: --ulimit nofile=${Math.max(65536, needed)}).`
      });
    }
  } else if (system.platform === 'win32') {
    findings.push({
      level: 'info',
      area: 'os',
      title: 'Windows host: socket limits and cluster balancing differ from Linux',
      detail: 'Run capacity checks on the OS you deploy to; Linux numbers are usually higher.'
    });
  }

  return findings;
}
