/**
 * Token bucket: `capacity` messages, refilled evenly over `windowMs`.
 * One bucket per connection, so a single client can burst briefly but
 * cannot flood a room.
 */

export class TokenBucket {
  private tokens: number
  private updatedAt: number
  private readonly refillPerMs: number

  constructor(
    private readonly capacity: number,
    windowMs: number,
    private readonly now: () => number = Date.now
  ) {
    this.tokens = capacity
    this.updatedAt = now()
    this.refillPerMs = capacity / windowMs
  }

  /** Take one token; false when the bucket is empty. */
  take(): boolean {
    this.refill()
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }

  /** Milliseconds until the next token is available. */
  retryAfterMs(): number {
    this.refill()
    return this.tokens >= 1 ? 0 : Math.ceil((1 - this.tokens) / this.refillPerMs)
  }

  private refill(): void {
    const now = this.now()
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.updatedAt) * this.refillPerMs)
    this.updatedAt = now
  }
}
