/**
 * Generic workflow semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tWorkflow ──────────────────────────────────────────────────────────

export interface TWorkflowOptions {
  version?: string
  resumable?: boolean
}

export const tWorkflow = (
  name: string,
  options: TWorkflowOptions = {}
): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tWorkflow',
      description: 'Declares a class as a workflow',
      purpose: 'Marks a class as a durable, resumable workflow',
      why: 'Long-running workflows require explicit lifecycle semantics',
      whenToUse: 'On classes representing multi-step durable processes',
      category: 'Workflow',
      targets: ['class'],
      consumedBy: ['Workflow Engine'],
      composesWith: ['tStep', 'tCheckpoint', 'tResume', 'tCompensate'],
      examples: ['@tWorkflow("document-processing")']
    },
    (target) => {
      registerMetadata('tWorkflow', target, undefined, { name, ...options })
    }
  )

// ── tResume ────────────────────────────────────────────────────────────

export interface TResumeOptions {
  from?: string
}

export const tResume = (options: TResumeOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tResume',
      description: 'Declares a resume entry point in a workflow',
      purpose: 'Registers the method as the target of a workflow resume',
      why: 'Explicit resume points are necessary for durable execution',
      whenToUse: 'On workflow steps that may be resumed after failure',
      category: 'Workflow',
      targets: ['method'],
      consumedBy: ['Workflow Engine'],
      composesWith: ['tWorkflow', 'tCheckpoint'],
      examples: ['@tResume({ from: "after-index" })']
    },
    (target, propertyKey) => {
      registerMetadata('tResume', target, propertyKey, options)
    }
  )