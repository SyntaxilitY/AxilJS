/**
 * Global registry of every TDecoratorInfo shipped with an AxilJS decorator.
 * The CLI, IDE tooling, and validators query this store.
 */

import type { TDecoratorInfo } from '../core/types'

const infoRegistry = new Map<string, TDecoratorInfo>()

/**
 * Register a decorator's TDecoratorInfo contract.
 * Called exactly once per decorator at import time.
 */
export function registerDecoratorInfo(info: TDecoratorInfo): void {
  if (!info.name) {
    throw new Error('TDecoratorInfo.name is required')
  }
  if (!info.description) {
    throw new Error(`TDecoratorInfo.description is required for ${info.name}`)
  }
  if (!info.purpose) {
    throw new Error(`TDecoratorInfo.purpose is required for ${info.name}`)
  }
  if (!info.why) {
    throw new Error(`TDecoratorInfo.why is required for ${info.name}`)
  }
  if (!info.whenToUse) {
    throw new Error(`TDecoratorInfo.whenToUse is required for ${info.name}`)
  }
  if (!info.category) {
    throw new Error(`TDecoratorInfo.category is required for ${info.name}`)
  }
  if (!info.targets || info.targets.length === 0) {
    throw new Error(`TDecoratorInfo.targets must not be empty for ${info.name}`)
  }
  if (!info.examples || info.examples.length === 0) {
    throw new Error(`TDecoratorInfo.examples must contain at least one example for ${info.name}`)
  }

  infoRegistry.set(info.name, info)
}

/** Get the TDecoratorInfo for a single decorator. */
export function getDecoratorInfo(name: string): TDecoratorInfo | undefined {
  return infoRegistry.get(name)
}

/** List every registered decorator, optionally filtered by category. */
export function listDecorators(filter?: { category?: string }): TDecoratorInfo[] {
  const all = Array.from(infoRegistry.values())
  if (filter?.category) return all.filter(d => d.category === filter.category)
  return all
}

/** Free-text search across every field. */
export function searchDecorators(query: string): TDecoratorInfo[] {
  const q = query.toLowerCase()
  return Array.from(infoRegistry.values()).filter(d => {
    return (
      d.name.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.purpose.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      d.why.toLowerCase().includes(q)
    )
  })
}

/** Enumerate every category that has at least one decorator. */
export function listCategories(): string[] {
  const set = new Set<string>()
  for (const info of infoRegistry.values()) set.add(info.category)
  return Array.from(set).sort()
}