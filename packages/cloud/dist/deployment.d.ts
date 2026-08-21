/**
 * Deployment Toolkit.
 *
 * Generates production-grade Docker and Kubernetes manifests.
 *
 * Key differences from the original:
 *   ✓ Node 22 Alpine multi-stage build.
 *   ✓ Non-root container user.
 *   ✓ Docker Compose file.
 *   ✓ Full K8s: Deployment, Service, HPA, PDB, optional Ingress.
 *   ✓ Readiness & liveness probes.
 *   ✓ Resource requests / limits.
 *   ✓ Rolling update strategy.
 *   ✓ Security context.
 *   ✓ Sanitised K8s names (RFC 1123).
 *   ✓ No hard-coded fake registry.
 *   ✓ Dry-run mode returns strings instead of writing to disk.
 */
import type { DeploymentConfig, GeneratedManifest } from './types';
export type { DeploymentConfig, GeneratedManifest };
/**
 * Generate all deployment artefacts.
 *
 * @param config  Deployment configuration.
 * @param dryRun  When `true`, returns the manifests as strings
 *                instead of writing to disk.  Useful for tests.
 */
export declare function generateDeployment(config: DeploymentConfig, dryRun?: boolean): GeneratedManifest[];
//# sourceMappingURL=deployment.d.ts.map