/**
 * @axiljs/decorator — public API.
 */

// Core
export * from './core/types'
export {
  registerMetadata,
  getMetadata,
  getAllMetadata,
  hasMetadata,
  getParamMetadata,
  getDecoratedMethods,
  getAllEntries,
  __resetRegistry
} from './core/registry'
export { defineDecorator, makeMetadataDecorator } from './core/define'
export { validateComposition } from './core/validate'

// Info store
export {
  registerDecoratorInfo,
  getDecoratorInfo,
  listDecorators,
  searchDecorators,
  listCategories
} from './info/info-store'

// Decorator groups
export * from './decorators/http'
export * from './decorators/security'
export * from './decorators/data'
export * from './decorators/reliability'
export * from './decorators/concurrency'
export * from './decorators/distributed'
export * from './decorators/messaging'
export * from './decorators/caching'
export * from './decorators/observability'
export * from './decorators/compliance'
export * from './decorators/runtime'
export * from './decorators/workflow'
export * from './decorators/ai'
export * from './decorators/contract'
export * from './decorators/execution'
export * from './decorators/validation'