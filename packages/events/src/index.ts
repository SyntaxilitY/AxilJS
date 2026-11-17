/**
 * @axiljs/events - Public API
 */

export { EventBus, getGlobalEventBus, setGlobalEventBus, assertJsonSafe } from './event-bus';
export { OnEvent, registerEventHandlers } from './decorators';
export type { EventsLogger, RegisterEventHandlersOptions } from './decorators';
export { InMemoryTransport, createLinkedTransports } from './in-memory-transport';
export {
  ClusterTransport,
  installClusterEventRelay,
  isClusterEventEnvelope,
  processChannel,
  nodeClusterHost,
  CLUSTER_EVENTS_TAG,
  CLUSTER_EVENTS_VERSION
} from './cluster-transport';
export type {
  ClusterEventEnvelope,
  ClusterChannel,
  ClusterTransportOptions,
  ClusterWorkerLike,
  ClusterRelayHost,
  ClusterEventRelayOptions
} from './cluster-transport';
export * from './types';