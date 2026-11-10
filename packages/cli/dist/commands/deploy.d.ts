/**
 * axil deploy
 * Generates Docker + Kubernetes deployment files.
 */
export interface DeployOptions {
    port?: number | string;
    replicas?: number | string;
    force?: boolean;
    cwd?: string;
}
export declare const DOCKERIGNORE = "node_modules\nnpm-debug.log*\ndist\ncoverage\n.git\n.gitignore\n.env\n.env.*\n!.env.example\n*.db\n*.log\n.DS_Store\n";
export declare function deploy(options?: DeployOptions): Promise<void>;
//# sourceMappingURL=deploy.d.ts.map