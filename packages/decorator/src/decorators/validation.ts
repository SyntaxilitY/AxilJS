/**
 * Validation semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

const validationDecorator = (
  name: string,
  description: string,
  examples: string[]
) => (options?: Record<string, unknown>): TDecoratorFunction =>
  defineDecorator(
    {
      name,
      description,
      purpose: `Validates that the value satisfies the "${name}" constraint`,
      why: 'Validation constraints are declarative field semantics',
      whenToUse: 'On DTO properties that must satisfy input constraints',
      category: 'Validation',
      targets: ['property'],
      consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
      composesWith: ['tOptional', 'tNested', 'tArray'],
      examples
    },
    (target, propertyKey) => {
      const existing =
        ((target as any).__axiljs_validators__?.[propertyKey as string] as unknown[]) ?? []
      const store = ((target as any).__axiljs_validators__ ??= {})
      store[propertyKey as string] = [...existing, { name, options: options ?? {} }]
      registerMetadata(name, target, propertyKey, options ?? {})
    }
  )

export const tString = validationDecorator(
  'tString', 'Value must be a string', ['@tString()']
)
export const tNumber = validationDecorator(
  'tNumber', 'Value must be a number', ['@tNumber()']
)
export const tBoolean = validationDecorator(
  'tBoolean', 'Value must be a boolean', ['@tBoolean()']
)
export const tEmail = validationDecorator(
  'tEmail', 'Value must be a valid email address', ['@tEmail()']
)
export const tUrl = validationDecorator(
  'tUrl', 'Value must be a valid URL', ['@tUrl()']
)
export const tUuid = validationDecorator(
  'tUuid', 'Value must be a valid UUID', ['@tUuid()', '@tUuid({ version: 4 })']
)
export const tOptional = validationDecorator(
  'tOptional', 'Property may be omitted', ['@tOptional()']
)
export const tArray = validationDecorator(
  'tArray', 'Value must be an array', ['@tArray()']
)

// Parameterized helpers

export const tMin = (n: number): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tMin',
      description: 'Numeric minimum',
      purpose: 'Enforces a minimum numeric value',
      why: 'Declarative numeric bounds simplify DTO contracts',
      whenToUse: 'On numeric properties with lower bounds',
      category: 'Validation',
      targets: ['property'],
      consumedBy: ['@axiljs/validation'],
      composesWith: ['tNumber', 'tMax'],
      examples: ['@tMin(0)']
    },
    (target, propertyKey) => {
      registerMetadata('tMin', target, propertyKey, { value: n })
    }
  )

export const tMax = (n: number): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tMax',
      description: 'Numeric maximum',
      purpose: 'Enforces a maximum numeric value',
      why: 'Declarative numeric bounds simplify DTO contracts',
      whenToUse: 'On numeric properties with upper bounds',
      category: 'Validation',
      targets: ['property'],
      consumedBy: ['@axiljs/validation'],
      composesWith: ['tNumber', 'tMin'],
      examples: ['@tMax(100)']
    },
    (target, propertyKey) => {
      registerMetadata('tMax', target, propertyKey, { value: n })
    }
  )

export const tMinLength = (n: number): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tMinLength',
      description: 'Minimum string length',
      purpose: 'Enforces a minimum length on string values',
      why: 'Declarative length bounds simplify DTO contracts',
      whenToUse: 'On string properties with a lower length bound',
      category: 'Validation',
      targets: ['property'],
      consumedBy: ['@axiljs/validation'],
      composesWith: ['tString', 'tMaxLength'],
      examples: ['@tMinLength(2)']
    },
    (target, propertyKey) => {
      registerMetadata('tMinLength', target, propertyKey, { value: n })
    }
  )

export const tMaxLength = (n: number): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tMaxLength',
      description: 'Maximum string length',
      purpose: 'Enforces a maximum length on string values',
      why: 'Declarative length bounds simplify DTO contracts',
      whenToUse: 'On string properties with an upper length bound',
      category: 'Validation',
      targets: ['property'],
      consumedBy: ['@axiljs/validation'],
      composesWith: ['tString', 'tMinLength'],
      examples: ['@tMaxLength(100)']
    },
    (target, propertyKey) => {
      registerMetadata('tMaxLength', target, propertyKey, { value: n })
    }
  )

export const tPattern = (pattern: RegExp): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tPattern',
      description: 'Regex pattern match',
      purpose: 'Enforces a regex pattern on string values',
      why: 'Declarative pattern matching simplifies DTO contracts',
      whenToUse: 'On string properties with a specific shape',
      category: 'Validation',
      targets: ['property'],
      consumedBy: ['@axiljs/validation'],
      composesWith: ['tString'],
      examples: ['@tPattern(/^[a-z0-9-]+$/)']
    },
    (target, propertyKey) => {
      registerMetadata('tPattern', target, propertyKey, { source: pattern.source, flags: pattern.flags })
    }
  )

export const tEnum = (values: readonly (string | number)[]): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tEnum',
      description: 'Value must be one of the listed options',
      purpose: 'Restricts a property to a fixed set of allowed values',
      why: 'Enumerated fields need explicit value contracts',
      whenToUse: 'On properties with a bounded value set',
      category: 'Validation',
      targets: ['property'],
      consumedBy: ['@axiljs/validation', 'OpenAPI Generator'],
      composesWith: ['tString', 'tNumber'],
      examples: ['@tEnum(["admin", "user"])']
    },
    (target, propertyKey) => {
      registerMetadata('tEnum', target, propertyKey, { values: [...values] })
    }
  )

export const tNested = (typeFn: () => Function): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tNested',
      description: 'Validates a nested object against another DTO',
      purpose: 'Applies the nested DTO validators to the property value',
      why: 'Nested validation is a fundamental composition semantic',
      whenToUse: 'On properties whose value is another DTO',
      category: 'Validation',
      targets: ['property'],
      consumedBy: ['@axiljs/validation'],
      composesWith: ['tOptional', 'tArray'],
      examples: ['@tNested(() => AddressDto)']
    },
    (target, propertyKey) => {
      registerMetadata('tNested', target, propertyKey, { typeFn })
    }
  )

export const tCustom = (
  fn: (value: unknown) => boolean | string | Promise<boolean | string>
): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tCustom',
      description: 'Custom validation function',
      purpose: 'Runs a user-supplied validator against the property value',
      why: 'Application-specific validation is a natural extension point',
      whenToUse: 'When built-in validators are insufficient',
      category: 'Validation',
      targets: ['property'],
      consumedBy: ['@axiljs/validation'],
      composesWith: [],
      examples: ['@tCustom((v) => typeof v === "string" && v.startsWith("ax_"))']
    },
    (target, propertyKey) => {
      registerMetadata('tCustom', target, propertyKey, { fn })
    }
  )