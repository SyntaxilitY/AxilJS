/**
 * @axiljs/scale - Public API
 *
 * Vertical scaling (cluster), capacity planning and multi-process readiness.
 */

export {
  defineScaling,
  resolveScaling,
  loadScalingConfig,
  SCALING_FILE,
  SCALING_TEMPLATE
} from './config';
export type {
  ScalingConfig,
  ScalingTarget,
  VerticalScaling,
  HorizontalScaling,
  ResolvedScaling
} from './config';

export { detectSystem } from './system';
export type { SystemInfo } from './system';

export { loadTest, calibrate, summarize } from './loadgen';
export type { LoadTestOptions, LoadTestResult, LatencySummary, CalibrationResult } from './loadgen';

export { planCapacity, hostChecks, fmtNum } from './planner';
export type { CapacityInput, CapacityReport, Finding, Level, Measurement } from './planner';

export { scanSource, scanProject } from './readiness';
export type { ReadinessFinding } from './readiness';

export { serve } from './cluster';
export type { Listenable, ServeOptions, ServeHandle } from './cluster';
