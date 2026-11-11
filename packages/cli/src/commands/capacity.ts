/**
 * axil capacity
 * Can this machine / deployment carry the configured target?
 *
 *   axil capacity --init                 write axil.scaling.json
 *   axil capacity                        calibrate one worker, plan, check readiness
 *   axil capacity --url http://h:3000/x --server-workers 4
 *                                        plan from your own running route
 *   axil capacity --json                 machine-readable (CI)
 */

import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  SCALING_FILE,
  SCALING_TEMPLATE,
  calibrate,
  detectSystem,
  fmtNum,
  loadScalingConfig,
  loadTest,
  planCapacity,
  resolveScaling,
  scanProject
} from '@axiljs/scale'
import type { Finding, Measurement, ReadinessFinding } from '@axiljs/scale'

import * as ui from '../ui'

export interface CapacityOptions {
  url?: string
  serverWorkers?: string
  duration?: string
  connections?: string
  init?: boolean
  force?: boolean
  json?: boolean
  cwd?: string
}

function num(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${label} "${value}". Expected a positive number.`)
  return n
}

/** @axiljs/core as installed in the project, else next to the CLI, else none. */
function resolveCore(cwd: string): string | undefined {
  for (const paths of [[cwd], undefined]) {
    try {
      return require.resolve('@axiljs/core', paths ? { paths } : undefined)
    } catch {}
  }
  return undefined
}

function render(f: Finding): void {
  if (f.level === 'ok') ui.success(f.title)
  else if (f.level === 'info') ui.info(f.title)
  else if (f.level === 'warn') ui.warn(f.title)
  else ui.line(`${ui.c.red(ui.sym.cross)} ${ui.c.red(f.title)}`)
  if (f.detail) ui.detail(f.detail)
  if (f.fix) ui.detail(`${ui.sym.arrow} ${f.fix}`)
}

export async function capacity(options: CapacityOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  const json = options.json === true
  const started = Date.now()

  // ── --init ──
  if (options.init) {
    ui.title('capacity', 'Create a scaling config')
    const file = join(cwd, SCALING_FILE)
    if (existsSync(file) && !options.force) {
      ui.failed(`${SCALING_FILE} already exists`, 'Use --force to overwrite it.')
      process.exitCode = 1
      return
    }
    writeFileSync(file, JSON.stringify(SCALING_TEMPLATE, null, 2) + '\n')
    ui.success(`Wrote ${SCALING_FILE}`)
    ui.box('Next steps', [
      `1. Set ${ui.cmd('target.rps')} and ${ui.cmd('horizontal.instanceSize')} to your numbers`,
      `2. ${ui.cmd('axil capacity')}`
    ])
    return
  }

  const durationMs = num(options.duration, 5, '--duration') * 1000
  const connections = Math.round(num(options.connections, 128, '--connections'))
  const serverWorkers = Math.round(num(options.serverWorkers, 1, '--server-workers'))

  if (!json) ui.title('capacity', 'Can this setup carry the target?')

  // ── Config ──
  const system = detectSystem()
  const raw = loadScalingConfig(cwd)
  const scaling = resolveScaling(raw ?? {}, system)

  if (!json) {
    if (raw) ui.success(`Loaded ${SCALING_FILE}`)
    else ui.info(`No ${SCALING_FILE}; using defaults`, `create one: axil capacity --init`)

    ui.section('This machine')
    ui.keyValue([
      ['CPU', `${system.cores} cores · ${system.cpuModel}`],
      ['Memory', `${(system.memoryBytes / 2 ** 30).toFixed(1)} GB (${(system.freeMemoryBytes / 2 ** 30).toFixed(1)} GB free)`],
      ...(system.cgroupCpus !== null ? [['Container CPU', `${system.cgroupCpus}`] as [string, string]] : []),
      ['Open files', system.fdLimit === null ? 'unknown on this OS' : fmtNum(system.fdLimit)],
      ['Node.js', system.nodeVersion]
    ])
  }

  // ── Measure ──
  let measurement: Measurement
  let measured: Record<string, unknown>

  if (!json) ui.section(options.url ? 'Measuring your route' : 'Calibrating one worker')
  const spin = json ? null : ui.spinner(options.url
    ? `Load-testing ${options.url} for ${durationMs / 1000}s (${connections} connections)`
    : `Load-testing a hello-world worker for ${durationMs / 1000}s`)

  try {
    if (options.url) {
      const r = await loadTest({ url: options.url, durationMs, connections })
      measurement = {
        rpsPerWorker: Math.round(r.rps / serverWorkers),
        p99Ms: r.latency.p99,
        source: 'measured',
        label: options.url
      }
      measured = { ...r, serverWorkers }
      spin?.succeed(`${fmtNum(r.rps)} req/s total`, `p50 ${r.latency.p50} ms · p99 ${r.latency.p99} ms`)
      if (!json) {
        if (!options.serverWorkers) {
          ui.warn('Assuming the server runs 1 worker', 'pass --server-workers N if it runs in cluster mode')
        }
        const bad = r.errors + r.non2xx
        if (bad > 0) {
          const pct = ((bad / Math.max(1, r.requests + r.errors)) * 100).toFixed(1)
          ui.warn(`${pct}% of requests failed (${r.non2xx} non-2xx, ${r.errors} network errors)`, 'the throughput number is not trustworthy')
        }
        if (/^https?:\/\/(localhost|127\.|\[::1\])/.test(options.url)) {
          ui.detail('Generator and server share this machine\'s CPU; the server alone would do somewhat more.')
        }
      }
    } else {
      const core = resolveCore(cwd)
      const r = await calibrate({ coreEntry: core, durationMs, connections })
      measurement = { rpsPerWorker: r.rpsPerWorker, p99Ms: r.latency.p99, source: 'calibrated', label: r.server }
      measured = { server: r.server, contended: r.contended, ...r.result }
      spin?.succeed(`1 worker (${r.server}): ${fmtNum(r.rpsPerWorker)} req/s`, `p50 ${r.latency.p50} ms · p99 ${r.latency.p99} ms`)
      if (!json && r.contended) ui.warn('Fewer than 3 cores: the generator competes with the server')
    }
  } catch (err: any) {
    spin?.fail('Measurement failed')
    if (json) console.log(JSON.stringify({ error: err.message }))
    else ui.failed(err.message, options.url ? 'Is the server running and reachable?' : undefined)
    process.exitCode = 1
    return
  }

  // ── Plan ──
  const report = planCapacity({ scaling, system, measurement })
  const multiProcess = scaling.vertical.workers > 1 || scaling.horizontal.max > 1
  const readiness: ReadinessFinding[] = multiProcess ? scanProject(cwd) : []

  if (json) {
    console.log(JSON.stringify({ system, scaling, measurement, measured, report, readiness }, null, 2))
    if (report.verdict === 'fail') process.exitCode = 1
    return
  }

  const h = scaling.horizontal
  const planRows: Array<[string, string]> = [
    ['Per worker', `${fmtNum(measurement.rpsPerWorker)} req/s`],
    ['Per instance', `${report.instance.workers} workers on ${report.instance.cpus} CPU / ${report.instance.memoryGb} GB → ~${fmtNum(report.instance.rps)} req/s`],
    ['Deployment', h.min === h.max
      ? `${h.max} instance${h.max > 1 ? 's' : ''} → ~${fmtNum(report.deployment.rpsAtMax)} req/s`
      : `${h.min}–${h.max} instances → ~${fmtNum(report.deployment.rpsAtMin)}–${fmtNum(report.deployment.rpsAtMax)} req/s`],
    ['Target', scaling.target.rps
      ? `${fmtNum(scaling.target.rps)} req/s + ${Math.round(scaling.headroom * 100)}% headroom = ${fmtNum(report.required!.rps)} req/s`
      : 'not set']
  ]
  const labelWidth = Math.max(...planRows.map(([k]) => k.length))
  ui.line()
  ui.card('Plan', planRows.map(([k, v]) => `${ui.muted(k.padEnd(labelWidth))}  ${v}`), {
    meta: report.verdict === 'ok' ? 'fits' : report.verdict === 'warn' ? 'fits, with warnings' : 'short',
    tone: report.verdict === 'fail' ? ui.c.red : report.verdict === 'warn' ? ui.c.yellow : ui.c.green
  })

  ui.section('Checks')
  const order = { fail: 0, warn: 1, info: 2, ok: 3 } as const
  for (const f of [...report.findings].sort((a, b) => order[a.level] - order[b.level])) render(f)

  if (multiProcess) {
    ui.section('Multi-process readiness')
    if (readiness.length === 0) {
      ui.success('No in-memory state that splits across workers/instances found in src/')
    } else {
      for (const r of readiness) {
        const where = `${r.file}:${r.line}`
        if (r.level === 'fail') ui.line(`${ui.c.red(ui.sym.cross)} ${ui.c.red(r.title)}  ${ui.muted(where)}`)
        else ui.warn(r.title, where)
        ui.detail(`${ui.sym.arrow} ${r.fix}`)
      }
    }
  }

  // ── Verdict ──
  const blocking = report.verdict === 'fail' || readiness.some(r => r.level === 'fail')
  if (blocking) {
    const rec = report.recommended
    const hint = rec && report.required && report.required.instances > h.max
      ? `Recommended: workers 'auto', instances { min: ${rec.instances.min}, max: ${rec.instances.max} } of ${report.instance.cpus} CPU`
      : 'Fix the ✗ items above and run axil capacity again.'
    ui.failed('This setup cannot carry the target yet', hint)
    process.exitCode = 1
  } else if (report.verdict === 'warn' || readiness.length > 0) {
    ui.done('Capacity is sufficient, with warnings', started)
    ui.outro()
  } else {
    ui.done(scaling.target.rps ? 'This setup can carry the target' : 'Capacity measured', started)
    ui.outro()
  }
}
