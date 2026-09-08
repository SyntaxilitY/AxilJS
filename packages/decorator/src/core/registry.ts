/**
 * Framework-independent global metadata registry.
 *
 * All semantic decorators write here.
 * All consumers read from here.
 * The registry is the only shared state between decorators and consumers.
 */

import type { TMetadataEntry } from './types'

const METHOD_KEY = Symbol('axiljs.method-metadata')
const CLASS_KEY = Symbol('axiljs.class-metadata')
const PARAM_KEY = Symbol('axiljs.param-metadata')

interface MethodMeta {
  [decoratorName: string]: unknown
}

interface ClassMeta {
  [decoratorName: string]: unknown
}

interface ParamMeta {
  [decoratorName: string]: Array<{ index: number; value: unknown }>
}

const allEntries: TMetadataEntry[] = []

function getStore<T>(target: object, key: symbol): T {
  if (!(target as any)[key]) {
    Object.defineProperty(target, key, {
      value: Object.create(null),
      enumerable: false,
      configurable: false,
      writable: true
    })
  }
  return (target as any)[key]
}

/**
 * Register decorator metadata against a target.
 */
export function registerMetadata<T>(
  decoratorName: string,
  target: object,
  propertyKey: string | symbol | undefined,
  value: T,
  parameterIndex?: number
): void {
  if (parameterIndex !== undefined && propertyKey !== undefined) {
    const store = getStore<Record<string | symbol, ParamMeta>>(target, PARAM_KEY)
    if (!store[propertyKey as string]) store[propertyKey as string] = Object.create(null)
    const decMap = store[propertyKey as string]
    if (!decMap[decoratorName]) decMap[decoratorName] = []
    decMap[decoratorName].push({ index: parameterIndex, value })
  } else if (propertyKey !== undefined) {
    const store = getStore<Record<string | symbol, MethodMeta>>(target, METHOD_KEY)
    if (!store[propertyKey as string]) store[propertyKey as string] = Object.create(null)
    store[propertyKey as string][decoratorName] = value
  } else {
    const store = getStore<ClassMeta>(target, CLASS_KEY)
    store[decoratorName] = value
  }

  allEntries.push({
    decorator: decoratorName,
    target,
    propertyKey,
    parameterIndex,
    value,
    registeredAt: Date.now()
  })
}

/**
 * Retrieve a single decorator's metadata from a target.
 */
export function getMetadata<T = unknown>(
  decoratorName: string,
  target: object,
  propertyKey?: string | symbol
): T | undefined {
  if (propertyKey !== undefined) {
    const store = (target as any)[METHOD_KEY] as Record<string | symbol, MethodMeta> | undefined
    return store?.[propertyKey as string]?.[decoratorName] as T | undefined
  }
  const store = (target as any)[CLASS_KEY] as ClassMeta | undefined
  return store?.[decoratorName] as T | undefined
}

/**
 * Retrieve parameter-level metadata.
 */
export function getParamMetadata(
  decoratorName: string,
  target: object,
  propertyKey: string | symbol
): Array<{ index: number; value: unknown }> {
  const store = (target as any)[PARAM_KEY] as Record<string | symbol, ParamMeta> | undefined
  return store?.[propertyKey as string]?.[decoratorName] ?? []
}

/**
 * Retrieve every decorator's metadata for a given target.
 */
export function getAllMetadata(
  target: object,
  propertyKey?: string | symbol
): Record<string, unknown> {
  if (propertyKey !== undefined) {
    const store = (target as any)[METHOD_KEY] as Record<string | symbol, MethodMeta> | undefined
    return { ...(store?.[propertyKey as string] ?? {}) }
  }
  const store = (target as any)[CLASS_KEY] as ClassMeta | undefined
  return { ...(store ?? {}) }
}

/**
 * Check if a specific decorator has been applied.
 */
export function hasMetadata(
  decoratorName: string,
  target: object,
  propertyKey?: string | symbol
): boolean {
  return getMetadata(decoratorName, target, propertyKey) !== undefined
}

/**
 * Enumerate every method that has any metadata registered on a class prototype.
 */
export function getDecoratedMethods(target: object): string[] {
  const store = (target as any)[METHOD_KEY] as Record<string | symbol, MethodMeta> | undefined
  return store ? Object.keys(store) : []
}

/**
 * Return every registered entry — useful for CLI graph generation.
 */
export function getAllEntries(): readonly TMetadataEntry[] {
  return allEntries
}

/**
 * Reset the registry (test-only).
 */
export function __resetRegistry(): void {
  allEntries.length = 0
}