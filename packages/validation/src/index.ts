/**
 * @restjs/validation - Public API
 */

export { v } from './schema';
export type { ValidationResult, ValidationError, BaseValidator } from './schema';

export { validate } from './middleware';