/**
 * Report generation: a long, chunked computation that checks its
 * AbortSignal between chunks, so a timeout or DELETE /jobs/:id stops it
 * promptly instead of letting it run to completion in the background.
 */

import { setTimeout as sleep } from 'node:timers/promises'

export type ReportType = 'sales' | 'inventory' | 'users'

export interface ReportRequest {
  type: ReportType
  rows: number
}

export interface Report {
  type: ReportType
  rows: number
  chunks: number
  totals: { count: number, sum: number, average: number }
  generatedAt: string
}

const CHUNK_SIZE = 1000

export async function generateReport(
  request: ReportRequest,
  options: { chunkLatencyMs: number, signal?: AbortSignal }
): Promise<Report> {
  const chunks = Math.max(1, Math.ceil(request.rows / CHUNK_SIZE))
  let sum = 0

  for (let chunk = 0; chunk < chunks; chunk++) {
    options.signal?.throwIfAborted()
    // Stand-in for a database page read; aborts mid-wait as well
    await sleep(options.chunkLatencyMs, undefined, { signal: options.signal })
    const size = Math.min(CHUNK_SIZE, request.rows - chunk * CHUNK_SIZE)
    for (let i = 0; i < size; i++) sum += ((chunk * CHUNK_SIZE + i) * 7919) % 1000
  }

  return {
    type: request.type,
    rows: request.rows,
    chunks,
    totals: { count: request.rows, sum, average: request.rows ? Math.round((sum / request.rows) * 100) / 100 : 0 },
    generatedAt: new Date().toISOString()
  }
}
