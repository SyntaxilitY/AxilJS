/**
 * A minimal validation consumer.
 * Reads the validation decorators (`tString`, `tEmail`, `tMinLength`, ...)
 * that were registered on a DTO class prototype.
 */

interface ValidatorEntry {
  name: string
  options: Record<string, unknown>
}

type ValidatorMap = Record<string, ValidatorEntry[]>

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateDto(dtoClass: Function, data: Record<string, unknown>): ValidationResult {
  const proto = dtoClass.prototype
  const validators = (proto as any).__axiljs_validators__ as ValidatorMap | undefined
  const errors: string[] = []

  if (!validators) return { valid: true, errors }

  for (const [field, rules] of Object.entries(validators)) {
    const value = data[field]
    const isOptional = rules.some(r => r.name === 'tOptional')

    if ((value === undefined || value === null) && isOptional) continue

    for (const rule of rules) {
      switch (rule.name) {
        case 'tString':
          if (typeof value !== 'string') errors.push(`${field} must be a string`)
          break
        case 'tNumber':
          if (typeof value !== 'number') errors.push(`${field} must be a number`)
          break
        case 'tBoolean':
          if (typeof value !== 'boolean') errors.push(`${field} must be a boolean`)
          break
        case 'tEmail':
          if (typeof value !== 'string' || !EMAIL_RE.test(value)) {
            errors.push(`${field} must be a valid email`)
          }
          break
        case 'tMinLength':
          if (typeof value === 'string' && value.length < (rule.options.value as number)) {
            errors.push(`${field} must be at least ${rule.options.value} characters`)
          }
          break
        case 'tMaxLength':
          if (typeof value === 'string' && value.length > (rule.options.value as number)) {
            errors.push(`${field} must be at most ${rule.options.value} characters`)
          }
          break
        case 'tMin':
          if (typeof value === 'number' && value < (rule.options.value as number)) {
            errors.push(`${field} must be >= ${rule.options.value}`)
          }
          break
        case 'tMax':
          if (typeof value === 'number' && value > (rule.options.value as number)) {
            errors.push(`${field} must be <= ${rule.options.value}`)
          }
          break
        case 'tPattern': {
          const re = new RegExp(rule.options.source as string, rule.options.flags as string)
          if (typeof value !== 'string' || !re.test(value)) {
            errors.push(`${field} does not match required format`)
          }
          break
        }
        case 'tEnum':
          if (!(rule.options.values as unknown[]).includes(value as never)) {
            errors.push(`${field} must be one of ${(rule.options.values as unknown[]).join(', ')}`)
          }
          break
      }
    }
  }

  return { valid: errors.length === 0, errors }
}