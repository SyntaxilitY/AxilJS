/**
 * Execution semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tAtomic ────────────────────────────────────────────────────────────

export const tAtomic = (): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tAtomic',
      description: 'Declares atomic execution semantics',
      purpose: 'Guarantees the operation appears atomic to its consumer',
      why: 'Atomicity is a first-class execution semantic',
      whenToUse: 'On operations that must be all-or-nothing from the outside',
      category: 'Execution',
      targets: ['method'],
      consumedBy: ['Runtime', 'Static Analyzer'],
      composesWith: ['tTransaction', 'tIdempotent', 'tLock'],
      examples: ['@tAtomic()']
    },
    (target, propertyKey) => {
      registerMetadata('tAtomic', target, propertyKey, {})
    }
  )

// ── tPure ──────────────────────────────────────────────────────────────

export const tPure = (): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tPure',
      description: 'Declares the method is side-effect free',
      purpose: 'Guarantees no observable side effects outside the return value',
      why: 'Purity enables aggressive memoization and parallelization',
      whenToUse: 'On computations that only depend on their inputs',
      whenNotToUse: 'On any operation that reads mutable state or performs I/O',
      category: 'Execution',
      targets: ['method'],
      consumedBy: ['Static Analyzer', 'Runtime'],
      composesWith: ['tMemoize', 'tCache'],
      conflictsWith: ['tSideEffect'],
      examples: ['@tPure()']
    },
    (target, propertyKey) => {
      registerMetadata('tPure', target, propertyKey, {})
    }
  )

// ── tSideEffect ────────────────────────────────────────────────────────

export const tSideEffect = (kind: string): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tSideEffect',
      description: 'Explicitly declares a side effect',
      purpose: 'Documents that the operation performs the given side effect',
      why: 'Explicit side-effect declarations aid analysis and audit',
      whenToUse: 'On operations touching external systems or shared state',
      category: 'Execution',
      targets: ['method'],
      consumedBy: ['Static Analyzer'],
      composesWith: ['tAudit', 'tRetry'],
      conflictsWith: ['tPure'],
      examples: ['@tSideEffect("external-api")', '@tSideEffect("filesystem")']
    },
    (target, propertyKey) => {
      registerMetadata('tSideEffect', target, propertyKey, { kind })
    }
  )

// ── tRequires ──────────────────────────────────────────────────────────

export const tRequires = (capabilities: string[]): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tRequires',
      description: 'Declares required backend capabilities',
      purpose: 'Lists capabilities the runtime must provide for the operation',
      why: 'Capability graphs replace hidden module coupling',
      whenToUse: 'On operations depending on identifiable capabilities',
      category: 'Execution',
      targets: ['method', 'class'],
      consumedBy: ['Static Analyzer', 'Runtime', '@axiljs/studio'],
      composesWith: ['tProvides'],
      examples: ['@tRequires(["database", "redis", "payments"])']
    },
    (target, propertyKey) => {
      registerMetadata('tRequires', target, propertyKey, { capabilities })
    }
  )

// ── tProvides ──────────────────────────────────────────────────────────

export const tProvides = (capability: string): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tProvides',
      description: 'Declares a provided backend capability',
      purpose: 'Marks the operation as providing a named capability',
      why: 'Capability graphs complement tRequires for static tooling',
      whenToUse: 'On operations that fulfill a named system capability',
      category: 'Execution',
      targets: ['method', 'class'],
      consumedBy: ['Static Analyzer', 'Runtime', '@axiljs/studio'],
      composesWith: ['tRequires'],
      examples: ['@tProvides("payment.completed")']
    },
    (target, propertyKey) => {
      registerMetadata('tProvides', target, propertyKey, { capability })
    }
  )