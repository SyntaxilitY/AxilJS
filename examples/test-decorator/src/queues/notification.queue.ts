/**
 * NotificationQueue — pure declaration of background job semantics.
 * A real `@axiljs/queue` consumer would read tQueue/tJob metadata
 * and wire this to an actual broker (Redis, SQS, etc.).
 */

import { tQueue, tJob, tRetry, tTimeout, tDeadLetter } from '@axiljs/decorator'

@tQueue('emails', { concurrency: 5 })
export class NotificationQueue {
  @tJob('send-welcome', { attempts: 3, backoff: 'exponential' })
  @tTimeout(30_000)
  @tDeadLetter({ channel: 'failed-emails', maxAttempts: 5 })
  async sendWelcome(data: { to: string }) {
    console.log(`[queue:emails] send-welcome → ${data.to}`)
  }

  @tJob('send-digest')
  @tRetry({ attempts: 2 })
  async sendDigest(data: { to: string }) {
    console.log(`[queue:emails] send-digest → ${data.to}`)
  }
}