/**
 * Messaging, events, and queue semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tOnEvent ───────────────────────────────────────────────────────────

export interface TOnEventOptions {
  async?: boolean
  priority?: number
}

export const tOnEvent = (
  pattern: string,
  options: TOnEventOptions = {}
): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tOnEvent',
      description: 'Subscribes to events matching a pattern',
      purpose: 'Registers the method as an event handler',
      why: 'Event subscription is a fundamental pub/sub semantic',
      whenToUse: 'On any handler that must react to a domain event',
      category: 'Messaging',
      targets: ['method'],
      consumedBy: ['@axiljs/events'],
      composesWith: ['tRetry', 'tInbox', 'tIdempotent'],
      examples: [
        '@tOnEvent("user.created")',
        '@tOnEvent("order.*", { async: true })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tOnEvent', target, propertyKey, { pattern, ...options })
    }
  )

// ── tEmit ──────────────────────────────────────────────────────────────

export const tEmit = (event: string): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tEmit',
      description: 'Emits an event with the method return value',
      purpose: 'Publishes an event after the method resolves successfully',
      why: 'Declarative emission removes ad-hoc event publication',
      whenToUse: 'On methods whose completion signals a domain event',
      category: 'Messaging',
      targets: ['method'],
      consumedBy: ['@axiljs/events', 'Outbox Consumer'],
      composesWith: ['tOutbox', 'tTransaction'],
      examples: ['@tEmit("order.created")']
    },
    (target, propertyKey) => {
      registerMetadata('tEmit', target, propertyKey, { event })
    }
  )

// ── tOnce ──────────────────────────────────────────────────────────────

export const tOnce = (event: string): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tOnce',
      description: 'Subscribes to an event exactly once',
      purpose: 'Removes the subscription after the first invocation',
      why: 'One-shot subscription simplifies bootstrap and warmup handlers',
      whenToUse: 'On handlers that must fire only once during process lifetime',
      category: 'Messaging',
      targets: ['method'],
      consumedBy: ['@axiljs/events'],
      composesWith: [],
      examples: ['@tOnce("app.ready")']
    },
    (target, propertyKey) => {
      registerMetadata('tOnce', target, propertyKey, { event })
    }
  )

// ── tMessage ───────────────────────────────────────────────────────────

export interface TMessageOptions {
  channel: string
  contentType?: string
}

export const tMessage = (options: TMessageOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tMessage',
      description: 'Declares a message handler on a channel',
      purpose: 'Registers the method as a consumer for a messaging channel',
      why: 'Channel-based messaging is a distinct semantic from event pub/sub',
      whenToUse: 'On methods consuming messages from a broker',
      category: 'Messaging',
      targets: ['method'],
      consumedBy: ['Message Broker Consumer'],
      composesWith: ['tInbox', 'tRetry', 'tDeadLetter'],
      examples: ['@tMessage({ channel: "payments.inbox" })']
    },
    (target, propertyKey) => {
      registerMetadata('tMessage', target, propertyKey, options)
    }
  )

// ── tDeadLetter ────────────────────────────────────────────────────────

export interface TDeadLetterOptions {
  channel: string
  maxAttempts?: number
}

export const tDeadLetter = (options: TDeadLetterOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tDeadLetter',
      description: 'Declares dead-letter behavior for a handler',
      purpose: 'Sends terminally failed messages to a dead-letter channel',
      why: 'Dead-letter handling is a first-class messaging semantic',
      whenToUse: 'On queue and message handlers that must not drop failures silently',
      category: 'Messaging',
      targets: ['method'],
      consumedBy: ['@axiljs/queue', 'Message Broker Consumer'],
      composesWith: ['tJob', 'tMessage', 'tRetry'],
      examples: ['@tDeadLetter({ channel: "failed-payments", maxAttempts: 5 })']
    },
    (target, propertyKey) => {
      registerMetadata('tDeadLetter', target, propertyKey, options)
    }
  )

// ── tQueue ─────────────────────────────────────────────────────────────

export interface TQueueOptions {
  concurrency?: number
  maxAttempts?: number
}

export const tQueue = (name: string, options: TQueueOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tQueue',
      description: 'Declares a class as a queue processor',
      purpose: 'Registers a class as the worker for a named queue',
      why: 'Queue declarations belong to the class-level semantic layer',
      whenToUse: 'On worker classes that process background jobs',
      category: 'Messaging',
      targets: ['class'],
      consumedBy: ['@axiljs/queue'],
      composesWith: ['tJob'],
      examples: ['@tQueue("emails", { concurrency: 5 })']
    },
    (target) => {
      registerMetadata('tQueue', target, undefined, { name, ...options })
    }
  )

// ── tJob ───────────────────────────────────────────────────────────────

export interface TJobOptions {
  attempts?: number
  backoff?: 'fixed' | 'exponential'
  timeout?: number
  priority?: 'low' | 'normal' | 'high'
}

export const tJob = (name: string, options: TJobOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tJob',
      description: 'Declares a job handler within a queue',
      purpose: 'Registers a method as the handler for a named job',
      why: 'Job handling is a fundamental background-work semantic',
      whenToUse: 'On methods that process a specific job type in a queue',
      category: 'Messaging',
      targets: ['method'],
      consumedBy: ['@axiljs/queue'],
      composesWith: ['tQueue', 'tRetry', 'tDeadLetter', 'tTimeout'],
      examples: ['@tJob("send-welcome", { attempts: 3 })']
    },
    (target, propertyKey) => {
      registerMetadata('tJob', target, propertyKey, { name, ...options })
    }
  )

// ── tEnqueue ───────────────────────────────────────────────────────────

export const tEnqueue = (queue: string, job: string): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tEnqueue',
      description: 'Enqueues a job after the method completes',
      purpose: 'Auto-enqueues a job with the method return value as data',
      why: 'Declarative enqueue removes boilerplate producer code',
      whenToUse: 'On methods whose result should become a queued job payload',
      category: 'Messaging',
      targets: ['method'],
      consumedBy: ['@axiljs/queue'],
      composesWith: ['tTransaction', 'tOutbox'],
      examples: ['@tEnqueue("emails", "send-welcome")']
    },
    (target, propertyKey) => {
      registerMetadata('tEnqueue', target, propertyKey, { queue, job })
    }
  )