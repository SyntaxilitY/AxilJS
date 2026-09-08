/**
 * Data & database semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tDatabase ──────────────────────────────────────────────────────────

export interface TDatabaseOptions {
  operation: 'read' | 'write' | 'readwrite'
  replica?: 'primary' | 'replica' | 'auto'
  timeout?: number
}

export const tDatabase = (options: TDatabaseOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tDatabase',
      description: 'Declares database execution semantics',
      purpose: 'Describes how a method interacts with the database',
      why: 'Allows AxilJS and the ORM to route queries appropriately without coupling',
      whenToUse: 'On any method that reads or writes to the database',
      whenNotToUse: 'On methods that only manipulate in-memory data',
      category: 'Data',
      targets: ['method', 'class'],
      consumedBy: ['VacuumORM', 'Transaction Engine', '@axiljs/observability', '@axiljs/cloud'],
      composesWith: ['tTransaction', 'tConsistent', 'tReadOnly', 'tTenantIsolated'],
      conflictsWith: ['tReadOnly'],
      performanceImpact: 'Read operations may be routed to replicas for lower latency',
      examples: [
        '@tDatabase({ operation: "read" })',
        '@tDatabase({ operation: "write", replica: "primary" })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tDatabase', target, propertyKey, options)
    }
  )

// ── tTransaction ───────────────────────────────────────────────────────

export interface TTransactionOptions {
  isolation?: 'read-uncommitted' | 'read-committed' | 'repeatable-read' | 'serializable'
  timeout?: number
  propagation?: 'required' | 'requires-new' | 'nested' | 'never'
}

export const tTransaction = (options: TTransactionOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tTransaction',
      description: 'Wraps a method in a database transaction boundary',
      purpose: 'Ensures the method executes atomically under the given isolation',
      why: 'Transactional boundaries are a critical database semantic',
      whenToUse: 'On operations that must succeed or fail as a single unit',
      category: 'Data',
      targets: ['method'],
      consumedBy: ['VacuumORM', 'Transaction Engine'],
      composesWith: ['tDatabase', 'tIsolation', 'tOutbox'],
      examples: ['@tTransaction()', '@tTransaction({ isolation: "serializable" })']
    },
    (target, propertyKey) => {
      registerMetadata('tTransaction', target, propertyKey, options)
    }
  )

// ── tIsolation ─────────────────────────────────────────────────────────

export type TIsolationLevel =
  | 'read-uncommitted'
  | 'read-committed'
  | 'repeatable-read'
  | 'serializable'
  | 'snapshot'

export const tIsolation = (level: TIsolationLevel): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tIsolation',
      description: 'Declares required transaction isolation',
      purpose: 'Enforces a minimum isolation level for the operation',
      why: 'Isolation choice materially affects correctness and performance',
      whenToUse: 'On operations sensitive to concurrent modification',
      category: 'Data',
      targets: ['method'],
      consumedBy: ['VacuumORM', 'Transaction Engine'],
      composesWith: ['tTransaction', 'tDatabase'],
      examples: ['@tIsolation("serializable")']
    },
    (target, propertyKey) => {
      registerMetadata('tIsolation', target, propertyKey, { level })
    }
  )

// ── tConsistent ────────────────────────────────────────────────────────

export type TConsistencyLevel = 'strong' | 'eventual' | 'snapshot' | 'bounded'

export const tConsistent = (level: TConsistencyLevel): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tConsistent',
      description: 'Declares consistency requirement for a read/write',
      purpose: 'Communicates the required consistency guarantee to the storage layer',
      why: 'Distributed systems require explicit consistency semantics',
      whenToUse: 'When correctness depends on a specific consistency model',
      category: 'Data',
      targets: ['method'],
      consumedBy: ['VacuumORM', 'Cache Consumer', 'Storage Router'],
      composesWith: ['tDatabase', 'tCache'],
      examples: ['@tConsistent("strong")', '@tConsistent("eventual")']
    },
    (target, propertyKey) => {
      registerMetadata('tConsistent', target, propertyKey, { level })
    }
  )

// ── tReadOnly ──────────────────────────────────────────────────────────

export const tReadOnly = (): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tReadOnly',
      description: 'Forbids any write operations within the method',
      purpose: 'Guarantees the method only performs reads',
      why: 'A read-only guarantee is a valuable safety semantic',
      whenToUse: 'On query, report, and export operations',
      whenNotToUse: 'On any method that mutates state',
      category: 'Data',
      targets: ['method', 'class'],
      consumedBy: ['VacuumORM', 'Static Analyzer'],
      composesWith: ['tDatabase', 'tCache'],
      conflictsWith: ['tDatabase (write)'],
      examples: ['@tReadOnly()']
    },
    (target, propertyKey) => {
      registerMetadata('tReadOnly', target, propertyKey, {})
    }
  )

// ── tTenantIsolated ────────────────────────────────────────────────────

export const tTenantIsolated = (): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tTenantIsolated',
      description: 'Auto-scopes queries to the current tenant',
      purpose: 'Injects a tenant filter into every query performed by the method',
      why: 'Tenant isolation is a critical multi-tenant safety semantic',
      whenToUse: 'On every operation that touches tenant-scoped data',
      category: 'Data',
      targets: ['method', 'class'],
      consumedBy: ['VacuumORM', '@axiljs/cloud'],
      composesWith: ['tDatabase', 'tTransaction'],
      securityImpact: 'CRITICAL — prevents cross-tenant data leakage',
      examples: ['@tTenantIsolated()']
    },
    (target, propertyKey) => {
      registerMetadata('tTenantIsolated', target, propertyKey, {})
    }
  )

// ── tEntity / tColumn / tPrimaryKey / tRelation ────────────────────────

export interface TEntityOptions {
  table?: string
  schema?: string
}

export const tEntity = (options: TEntityOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tEntity',
      description: 'Declares a class as a database entity',
      purpose: 'Marks a class as mapped to a database table',
      why: 'Entity mapping is a core data semantic',
      whenToUse: 'On classes that represent persistent domain models',
      category: 'Data',
      targets: ['class'],
      consumedBy: ['VacuumORM'],
      composesWith: ['tColumn', 'tRelation'],
      examples: ['@tEntity({ table: "users" })']
    },
    (target) => {
      registerMetadata('tEntity', target, undefined, options)
    }
  )

export interface TColumnOptions {
  name?: string
  type?: string
  length?: number
  nullable?: boolean
  unique?: boolean
  default?: unknown
  primary?: boolean
  select?: boolean
}

export const tColumn = (options: TColumnOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tColumn',
      description: 'Declares an entity property as a database column',
      purpose: 'Maps a class property to a table column with a type contract',
      why: 'Column mapping is a core data semantic',
      whenToUse: 'On every persistent property of an entity',
      category: 'Data',
      targets: ['property'],
      consumedBy: ['VacuumORM'],
      composesWith: ['tEntity'],
      examples: ['@tColumn()', '@tColumn({ type: "varchar", length: 255 })']
    },
    (target, propertyKey) => {
      registerMetadata('tColumn', target, propertyKey, options)
    }
  )

export const tPrimaryKey = (options: TColumnOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tPrimaryKey',
      description: 'Declares an entity primary key column',
      purpose: 'Marks a property as the entity primary key',
      why: 'Primary key identification is a core data semantic',
      whenToUse: 'On the primary key property of every entity',
      category: 'Data',
      targets: ['property'],
      consumedBy: ['VacuumORM'],
      composesWith: ['tEntity'],
      examples: ['@tPrimaryKey()']
    },
    (target, propertyKey) => {
      registerMetadata('tPrimaryKey', target, propertyKey, { ...options, primary: true })
    }
  )

export type TRelationType = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many'

export interface TRelationOptions {
  type: TRelationType
  target: () => Function
  inverse?: string
  cascade?: boolean | Array<'insert' | 'update' | 'remove'>
  eager?: boolean
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT'
}

export const tRelation = (options: TRelationOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tRelation',
      description: 'Declares an entity relationship',
      purpose: 'Describes a relationship between two entities',
      why: 'Relationship modeling is a core ORM semantic',
      whenToUse: 'On properties that reference other entities',
      category: 'Data',
      targets: ['property'],
      consumedBy: ['VacuumORM'],
      composesWith: ['tEntity', 'tColumn'],
      examples: [
        '@tRelation({ type: "many-to-one", target: () => User })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tRelation', target, propertyKey, options)
    }
  )