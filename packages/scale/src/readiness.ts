/**
 * Multi-process readiness scan.
 *
 * With more than one worker or instance, every process has its own memory.
 * Anything that keeps state in memory silently splits: rate limits multiply,
 * jobs stay on one worker, cron runs N times, WebSocket broadcasts miss
 * clients on other workers. This static scan finds those uses in your source.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface ReadinessFinding {
  level: 'warn' | 'fail';
  component: string;
  file: string;
  line: number;
  title: string;
  fix: string;
}

interface Rule {
  component: string;
  pattern: RegExp;
  level: 'warn' | 'fail';
  title: string;
  fix: string;
  /** Skip the match when the call's argument text satisfies this. */
  unless?: RegExp;
}

const RULES: Rule[] = [
  {
    component: '@axiljs/security rateLimit',
    pattern: /\brateLimit\s*\(/g,
    unless: /\bstore\s*:/,
    level: 'warn',
    title: 'rateLimit() counts per process: the real limit becomes limit × workers × instances',
    fix: 'Pass a shared `store` (Redis/DB-backed RateLimitStore).'
  },
  {
    component: '@axiljs/queue Scheduler',
    pattern: /new\s+Scheduler\s*\(/g,
    level: 'fail',
    title: 'Scheduler runs in every process: each cron job fires once per worker per instance',
    fix: 'Run the scheduler in one dedicated process (e.g. only when AXIL_ROLE=scheduler), or use a distributed lock.'
  },
  {
    component: '@axiljs/queue Queue',
    pattern: /new\s+Queue\s*\(/g,
    level: 'warn',
    title: 'In-memory Queue: jobs live and die with the process that enqueued them',
    fix: 'Use a shared broker for jobs that must survive restarts or be processed by any worker.'
  },
  {
    component: '@axiljs/events',
    pattern: /\b(getGlobalEventBus\s*\(|new\s+EventBus\s*\()/g,
    level: 'warn',
    title: 'EventBus is in-process: subscribers on other workers/instances never see the event',
    fix: 'Bridge cross-process events through a broker (Redis pub/sub, NATS, Postgres LISTEN/NOTIFY).'
  },
  {
    component: '@axiljs/websocket',
    pattern: /new\s+WSServer\s*\(/g,
    level: 'warn',
    title: 'WebSocket rooms are per process: broadcasts reach only clients on the same worker',
    fix: 'Fan out room messages through a pub/sub adapter, and enable sticky sessions on the load balancer.'
  },
  {
    component: '@axiljs/cloud CloudCache',
    pattern: /new\s+CloudCache\s*\(/g,
    level: 'warn',
    title: 'CloudCache is per process: invalidations do not reach other workers',
    fix: 'Keep TTLs short or use a shared cache for data that must be consistent.'
  },
  {
    component: 'SQLite',
    pattern: /\b(better-sqlite3|type\s*:\s*['"]sqlite['"]|dialect\s*:\s*['"]sqlite['"])/g,
    level: 'fail',
    title: 'SQLite is a local file: instances cannot share it, and concurrent writers lock',
    fix: 'Use PostgreSQL or MySQL for any deployment with more than one instance.'
  }
];

/** Argument text of the call starting at `index` (balanced parens, capped). */
function callArgs(source: string, index: number): string {
  const open = source.indexOf('(', index);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length && i < open + 2000; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1, open + 2000);
}

/** Scan source text. `file` is only used for reporting. */
export function scanSource(file: string, source: string): ReadinessFinding[] {
  const out: ReadinessFinding[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(source))) {
      if (rule.unless && rule.unless.test(callArgs(source, m.index))) continue;
      // Ignore matches inside line comments
      const lineStart = source.lastIndexOf('\n', m.index) + 1;
      const prefix = source.slice(lineStart, m.index);
      if (/\/\/|^\s*\*/.test(prefix)) continue;
      out.push({
        level: rule.level,
        component: rule.component,
        file,
        line: source.slice(0, m.index).split('\n').length,
        title: rule.title,
        fix: rule.fix
      });
    }
  }
  return out;
}

/** Walk `dir` (default: ./src) and scan every .ts/.js file. */
export function scanProject(root: string = process.cwd(), dir = 'src'): ReadinessFinding[] {
  const findings: ReadinessFinding[] = [];
  const base = join(root, dir);

  const walk = (path: string) => {
    let entries: string[];
    try {
      entries = readdirSync(path);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const full = join(path, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (/\.(ts|js|mts|cts|mjs|cjs)$/.test(name) && !/\.(d\.ts|test\.\w+|spec\.\w+)$/.test(name)) {
        findings.push(...scanSource(relative(root, full).replace(/\\/g, '/'), readFileSync(full, 'utf8')));
      }
    }
  };

  walk(base);
  return findings;
}
