/**
 * Simulated SMTP client. Takes `latencyMs` per send and fails with a
 * temporary error at `failureRate`, so the queue's retry/backoff path is
 * easy to see. Swap it for a real provider without touching the job code.
 */

import { setTimeout as sleep } from 'node:timers/promises'
import { randomUUID } from 'node:crypto'

export interface Email {
  to: string
  subject: string
  body?: string
}

export interface MailerOptions {
  latencyMs: number
  failureRate: number
  random?: () => number
}

export class SimulatedMailer {
  private readonly random: () => number

  constructor(private readonly options: MailerOptions) {
    this.random = options.random ?? Math.random
  }

  async send(email: Email, signal?: AbortSignal): Promise<{ messageId: string, acceptedAt: string }> {
    await sleep(this.options.latencyMs, undefined, { signal })
    if (this.random() < this.options.failureRate) {
      throw new Error(`SMTP 451 4.3.0: temporary failure delivering to ${email.to}`)
    }
    return { messageId: `<${randomUUID()}@mail.local>`, acceptedAt: new Date().toISOString() }
  }
}
