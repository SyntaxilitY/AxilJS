/**
 * A flaky external inventory API and a client that calls it through a
 * CircuitBreaker. After repeated failures the breaker opens and calls are
 * answered from the last good snapshot (marked stale) instead of hammering
 * the failing service; after `resetTimeoutMs` one probe request is let
 * through to see whether it has recovered.
 */

import { setTimeout as sleep } from 'node:timers/promises'
import { CircuitBreaker } from '@axiljs/circuit'

export interface StockLevel {
  sku: string
  available: number
}

export interface InventorySnapshot {
  items: StockLevel[]
  fetchedAt: string | null
  source: 'api' | 'fallback'
  stale: boolean
}

export interface InventoryApiOptions {
  latencyMs: number
  failureRate: number
  random?: () => number
}

/** Simulated third-party API: slow and unreliable on purpose. */
export class FlakyInventoryApi {
  private readonly random: () => number

  constructor(private readonly options: InventoryApiOptions) {
    this.random = options.random ?? Math.random
  }

  async fetchStock(skus: string[]): Promise<StockLevel[]> {
    await sleep(this.options.latencyMs)
    if (this.random() < this.options.failureRate) {
      throw new Error('inventory-api responded 503 Service Unavailable')
    }
    return skus.map(sku => ({ sku, available: Math.floor(this.random() * 500) }))
  }
}

export interface BreakerSettings {
  failureThreshold: number
  resetTimeoutMs: number
  requestTimeoutMs: number
}

export class InventoryClient {
  readonly breaker: CircuitBreaker
  private lastGood: InventorySnapshot = { items: [], fetchedAt: null, source: 'fallback', stale: true }

  constructor(private readonly api: FlakyInventoryApi, settings: BreakerSettings) {
    this.breaker = new CircuitBreaker('inventory-api', {
      ...settings,
      // Serve the last known snapshot while the circuit is open
      fallback: (): InventorySnapshot => ({ ...this.lastGood, source: 'fallback', stale: true })
    })
  }

  async sync(skus: string[]): Promise<InventorySnapshot> {
    return this.breaker.execute(async () => {
      const items = await this.api.fetchStock(skus)
      this.lastGood = { items, fetchedAt: new Date().toISOString(), source: 'api', stale: false }
      return this.lastGood
    })
  }
}
