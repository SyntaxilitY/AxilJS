/**
 * Host detection: what this machine can give the app.
 */

import { availableParallelism, cpus, freemem, platform, totalmem } from 'node:os';
import { readFileSync } from 'node:fs';

export interface SystemInfo {
  /** CPU cores usable by this process (respects affinity, not cgroup quotas). */
  cores: number;
  cpuModel: string;
  memoryBytes: number;
  freeMemoryBytes: number;
  platform: NodeJS.Platform;
  nodeVersion: string;

  /** Open-file (socket) limit, or null where it can't be read (Windows, macOS). */
  fdLimit: number | null;

  /** CPU limit from a cgroup v2 quota (containers), or null when unlimited/unknown. */
  cgroupCpus: number | null;

  /** cgroup memory limit in bytes, or null when unlimited/unknown. */
  cgroupMemoryBytes: number | null;
}

function readSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function linuxFdLimit(): number | null {
  const limits = readSafe('/proc/self/limits');
  const line = limits?.split('\n').find(l => l.startsWith('Max open files'));
  const soft = line?.split(/\s{2,}/)[1];
  if (!soft) return null;
  return soft === 'unlimited' ? Infinity : Number(soft) || null;
}

function cgroupCpus(): number | null {
  // cgroup v2: "max 100000" or "200000 100000" (quota period)
  const raw = readSafe('/sys/fs/cgroup/cpu.max')?.trim();
  if (!raw) return null;
  const [quota, period] = raw.split(/\s+/);
  if (quota === 'max') return null;
  const n = Number(quota) / Number(period);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cgroupMemory(): number | null {
  const raw = readSafe('/sys/fs/cgroup/memory.max')?.trim();
  if (!raw || raw === 'max') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function detectSystem(): SystemInfo {
  const isLinux = platform() === 'linux';
  return {
    cores: availableParallelism(),
    cpuModel: cpus()[0]?.model?.trim() ?? 'unknown',
    memoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    platform: platform(),
    nodeVersion: process.version,
    fdLimit: isLinux ? linuxFdLimit() : null,
    cgroupCpus: isLinux ? cgroupCpus() : null,
    cgroupMemoryBytes: isLinux ? cgroupMemory() : null
  };
}
