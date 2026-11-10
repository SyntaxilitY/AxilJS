/**
 * Deep equality comparison.
 * Used internally by expect().toEqual().
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Strict equality covers primitives and same reference
  if (a === b) return true;

  // NaN is not === itself but should deep-equal NaN
  if (typeof a === 'number' && typeof b === 'number') {
    return Number.isNaN(a) && Number.isNaN(b);
  }

  // Null checks
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;

  // Type must match
  if (typeof a !== typeof b) return false;

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  // One is array, other is not
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  // Built-ins whose state is not in own enumerable keys (Object.keys() is []
  // for all of them, so without this any two Dates/Maps/Sets compare equal)
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return a instanceof RegExp && b instanceof RegExp && String(a) === String(b);
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key))) return false;
    }
    return true;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item) && !Array.from(b).some(other => deepEqual(item, other))) return false;
    }
    return true;
  }

  // Objects
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);

    if (keysA.length !== keysB.length) return false;

    return keysA.every(key =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    );
  }

  return false;
}