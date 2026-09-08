/**
 * Factory for building semantic decorators that register both
 * their TDecoratorInfo contract and their runtime metadata.
 */

import { registerMetadata } from './registry'
import { registerDecoratorInfo } from '../info/info-store'
import type {
  TDecoratorInfo,
  TDecoratorFunction,
  TDecoratorHandler
} from './types'

/**
 * Define a semantic decorator with a complete TDecoratorInfo contract.
 *
 * The returned function is a universal decorator that adapts to
 * class, method, property, and parameter usage.
 */
export function defineDecorator(
  info: TDecoratorInfo,
  handler: TDecoratorHandler
): TDecoratorFunction {
  registerDecoratorInfo(info)

  return function (
    target: any,
    propertyKey?: string | symbol,
    descriptorOrIndex?: PropertyDescriptor | number
  ): any {
    handler(target, propertyKey, descriptorOrIndex)
    return descriptorOrIndex && typeof descriptorOrIndex !== 'number'
      ? descriptorOrIndex
      : undefined
  }
}

/**
 * Convenience wrapper that builds a decorator whose only job is to
 * register a fixed value against the target under a named key.
 */
export function makeMetadataDecorator<TOptions>(
  info: TDecoratorInfo
): (options?: TOptions) => TDecoratorFunction {
  return (options?: TOptions) =>
    defineDecorator(info, (target, propertyKey, descriptorOrIndex) => {
      const parameterIndex =
        typeof descriptorOrIndex === 'number' ? descriptorOrIndex : undefined
      registerMetadata(info.name, target, propertyKey, options ?? {}, parameterIndex)
    })
}