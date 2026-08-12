"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepEqual = deepEqual;
/**
 * Deep equality comparison.
 * Used internally by expect().toEqual().
 */
function deepEqual(a, b) {
    // Strict equality covers primitives and same reference
    if (a === b)
        return true;
    // Null checks
    if (a === null || b === null)
        return false;
    if (a === undefined || b === undefined)
        return false;
    // Type must match
    if (typeof a !== typeof b)
        return false;
    // Arrays
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length)
            return false;
        return a.every((item, i) => deepEqual(item, b[i]));
    }
    // One is array, other is not
    if (Array.isArray(a) !== Array.isArray(b))
        return false;
    // Objects
    if (typeof a === 'object' && typeof b === 'object') {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length)
            return false;
        return keysA.every(key => deepEqual(a[key], b[key]));
    }
    return false;
}
//# sourceMappingURL=deep-equal.js.map