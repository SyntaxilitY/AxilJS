/**
 * A minimal in-memory rate limiter consumer.
 * Reads `tRateLimit` metadata — nothing more.
 */

import type { TRateLimitOptions } from '@axiljs/decorator'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function windowToMs(window: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(window)
  if (!match) return 60_000
  const value = Number(match[1])
  const unit = match[2]
  const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }
  return value * multipliers[unit]
}

export function consumeRateLimit(
  scopeKey: string,
  clientKey: string,
  options: TRateLimitOptions
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${scopeKey}:${clientKey}`
  const now = Date.now()
  const windowMs = windowToMs(options.window)

  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }

  bucket.count += 1

  return {
    allowed: bucket.count <= options.limit,
    remaining: Math.max(0, options.limit - bucket.count),
    resetAt: bucket.resetAt
  }
}