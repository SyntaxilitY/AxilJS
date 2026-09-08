/**
 * Core type definitions for the AxilJS semantic decorator system.
 */

export type TDecoratorTarget = 'class' | 'method' | 'property' | 'parameter'

/**
 * The self-describing contract every AxilJS semantic decorator must ship.
 */
export interface TDecoratorInfo {
  name: string
  description: string
  purpose: string
  why: string
  whenToUse: string
  whenNotToUse?: string
  category: string
  targets: TDecoratorTarget[]
  options?: Record<string, unknown>
  runtimeBehavior?: string
  metadataProduced?: string[]
  consumedBy?: string[]
  composesWith?: string[]
  conflictsWith?: string[]
  securityImpact?: string
  performanceImpact?: string
  examples: string[]
}

/**
 * A single metadata entry stored in the registry.
 */
export interface TMetadataEntry {
  decorator: string
  target: object
  propertyKey: string | symbol | undefined
  parameterIndex?: number
  value: unknown
  registeredAt: number
}

/**
 * Universal decorator function signature accepted by defineDecorator.
 */
export type TDecoratorFunction = (
  target: any,
  propertyKey?: string | symbol,
  descriptorOrIndex?: PropertyDescriptor | number
) => any

/**
 * Handler invoked when a decorator is applied.
 */
export type TDecoratorHandler = (
  target: object,
  propertyKey: string | symbol | undefined,
  descriptorOrIndex: PropertyDescriptor | number | undefined
) => void

/**
 * Result of composition validation.
 */
export interface TCompositionResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}