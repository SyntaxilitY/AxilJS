/**
 * CheckoutWorkflow — pure declaration of a distributed saga.
 *
 * No consumer executes this in the example (a real Workflow Engine
 * would live in a future `@axiljs/workflow` package). This file exists
 * to prove the decorators compose correctly and are introspectable
 * via `axil decorator check`.
 */

import { tSaga, tStep, tCompensate, tCheckpoint, tTimeout, tRetry } from '@axiljs/decorator'

@tSaga('checkout')
export class CheckoutWorkflow {
  @tStep('reserve-inventory', { order: 1 })
  @tTimeout(5000)
  @tRetry({ attempts: 3, backoff: 'exponential' })
  async reserveInventory(orderId: string) {
    console.log(`[saga:checkout] reserve-inventory for ${orderId}`)
  }

  @tStep('charge-payment', { order: 2 })
  @tCheckpoint('after-payment')
  async chargePayment(orderId: string) {
    console.log(`[saga:checkout] charge-payment for ${orderId}`)
  }

  @tStep('create-order', { order: 3 })
  async createOrder(orderId: string) {
    console.log(`[saga:checkout] create-order for ${orderId}`)
  }

  @tCompensate('charge-payment')
  async refundPayment(orderId: string) {
    console.log(`[saga:checkout] COMPENSATE refund-payment for ${orderId}`)
  }

  @tCompensate('reserve-inventory')
  async releaseInventory(orderId: string) {
    console.log(`[saga:checkout] COMPENSATE release-inventory for ${orderId}`)
  }
}