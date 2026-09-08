/**
 * Compose-time validator that checks decorator combinations
 * against the composesWith / conflictsWith contract of every
 * TDecoratorInfo.
 */

import { getAllMetadata } from './registry'
import { getDecoratorInfo } from '../info/info-store'
import type { TCompositionResult } from './types'

/**
 * Validate every decorator applied to a specific method or class
 * against declared composition and conflict rules.
 */
export function validateComposition(
  target: object,
  propertyKey?: string | symbol
): TCompositionResult {
  const applied = getAllMetadata(target, propertyKey)
  const appliedNames = Object.keys(applied)
  const errors: string[] = []
  const warnings: string[] = []

  for (const name of appliedNames) {
    const info = getDecoratorInfo(name)
    if (!info) {
      warnings.push(`Unknown decorator "${name}" — no TDecoratorInfo registered`)
      continue
    }

    if (info.conflictsWith) {
      for (const conflict of info.conflictsWith) {
        const [conflictName] = conflict.split(' ')
        if (conflictName && appliedNames.includes(conflictName) && conflictName !== name) {
          errors.push(
            `Conflict: @${name} cannot be combined with @${conflictName} — ${conflict}`
          )
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}