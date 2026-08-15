/**
 * Deployment Toolkit.
 * Generates Dockerfiles, Kubernetes manifests, and deployment scripts.
 * Supports `@axil deploy` command.
 */
export interface DeploymentConfig {
    appName: string;
    version: string;
    port: number;
    replicas?: number;
    domain?: string;
    env?: Record<string, string>;
    cloud?: 'aws' | 'azure' | 'gcp' | 'k8s';
}
export declare function generateDeployment(config: DeploymentConfig): void;
//# sourceMappingURL=deployment.d.ts.map