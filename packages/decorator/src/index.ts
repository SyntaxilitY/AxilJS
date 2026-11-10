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

// Let introspection (listDecorators, getDecoratorInfo, ...) see every
// shipped decorator, not only the ones applied so far.
import { __setCatalogLoader } from './info/info-store'
import * as httpGroup from './decorators/http'
import * as securityGroup from './decorators/security'
import * as dataGroup from './decorators/data'
import * as reliabilityGroup from './decorators/reliability'
import * as concurrencyGroup from './decorators/concurrency'
import * as distributedGroup from './decorators/distributed'
import * as messagingGroup from './decorators/messaging'
import * as cachingGroup from './decorators/caching'
import * as observabilityGroup from './decorators/observability'
import * as complianceGroup from './decorators/compliance'
import * as runtimeGroup from './decorators/runtime'
import * as workflowGroup from './decorators/workflow'
import * as aiGroup from './decorators/ai'
import * as contractGroup from './decorators/contract'
import * as executionGroup from './decorators/execution'
import * as validationGroup from './decorators/validation'

__setCatalogLoader(() => [
  httpGroup, securityGroup, dataGroup, reliabilityGroup, concurrencyGroup,
  distributedGroup, messagingGroup, cachingGroup, observabilityGroup,
  complianceGroup, runtimeGroup, workflowGroup, aiGroup, contractGroup,
  executionGroup, validationGroup
] as Array<Record<string, unknown>>)