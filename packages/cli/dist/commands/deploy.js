"use strict";
/**
 * axil deploy
 * Generates Docker + Kubernetes deployment files.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOCKERIGNORE = void 0;
exports.deploy = deploy;
const fs_1 = require("fs");
const path_1 = require("path");
const scale_1 = require("@axiljs/scale");
const ui = __importStar(require("../ui"));
function positiveInt(value, fallback, label, max) {
    if (value === undefined || value === '')
        return fallback;
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isInteger(n) || n < 1 || n > max) {
        throw new Error(`Invalid ${label} "${value}". Expected an integer between 1 and ${max}.`);
    }
    return n;
}
exports.DOCKERIGNORE = `node_modules
npm-debug.log*
dist
coverage
.git
.gitignore
.env
.env.*
!.env.example
*.db
*.log
.DS_Store
`;
async function deploy(options = {}) {
    const port = positiveInt(options.port, 3000, '--port', 65535);
    const force = options.force === true;
    ui.title('deploy', 'Generate Docker + Kubernetes files');
    const cwd = options.cwd || process.cwd();
    // axil.scaling.json sizes the pods, replicas and autoscaler (see axil capacity)
    let scaling;
    let sized = false;
    try {
        const raw = (0, scale_1.loadScalingConfig)(cwd);
        if (raw) {
            scaling = (0, scale_1.resolveScaling)(raw, { cores: 1, memoryBytes: 2 ** 30 });
            sized = raw.horizontal?.instanceSize !== undefined;
            ui.success(`Using ${scale_1.SCALING_FILE}`, `instances ${scaling.horizontal.min}–${scaling.horizontal.max}${sized ? `, ${scaling.horizontal.instanceSize.cpus} CPU / ${scaling.horizontal.instanceSize.memoryGb} GB pods` : ''}`);
        }
    }
    catch (err) {
        ui.error(err.message, `Fix ${scale_1.SCALING_FILE} or remove it.`);
        process.exit(1);
    }
    const replicas = positiveInt(options.replicas, scaling?.horizontal.min ?? 3, '--replicas', 1000);
    const hpa = scaling !== undefined && scaling.horizontal.max > replicas;
    const cpus = scaling?.horizontal.instanceSize.cpus ?? 1;
    const memGi = scaling?.horizontal.instanceSize.memoryGb ?? 1;
    // availableParallelism() ignores CPU quotas, so pin the worker count to the pod size
    const workers = scaling ? (scaling.vertical.workersAuto ? Math.max(1, Math.floor(cpus)) : scaling.vertical.workers) : 1;
    const grace = scaling ? Math.ceil(scaling.vertical.shutdownTimeoutMs / 1000) + 5 : 30;
    const pkgPath = (0, path_1.join)(cwd, 'package.json');
    if (!(0, fs_1.existsSync)(pkgPath)) {
        ui.error('No package.json found.', 'Run axil deploy from the project root.');
        process.exit(1);
    }
    let pkg;
    try {
        pkg = JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf-8'));
    }
    catch {
        ui.error('Could not parse package.json', ui.path(pkgPath));
        process.exit(1);
    }
    // Docker image names and Kubernetes resource names must be lowercase
    // DNS-1123 labels — a scoped npm name like "@org/api" is invalid as-is.
    const appName = String(pkg.name || 'axil-app')
        .toLowerCase().replace(/^@/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'axil-app';
    const version = pkg.version || '1.0.0';
    const dir = (0, path_1.join)(cwd, 'deploy');
    (0, fs_1.mkdirSync)(dir, { recursive: true });
    for (const f of ['Dockerfile', 'deployment.yaml', 'deploy.sh']) {
        if (!force && (0, fs_1.existsSync)((0, path_1.join)(dir, f))) {
            ui.warn(`Overwriting existing deploy/${f}`, 'use --force to skip this warning');
        }
    }
    // Dockerfile
    (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'Dockerfile'), `# AxilJS Production Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
${scaling ? `# serve() reads worker, connection and shutdown limits from it
COPY axil.scaling.json ./
` : ''}EXPOSE ${port}
ENV NODE_ENV=production
ENV PORT=${port}
# Containers must listen on all interfaces to be reachable
ENV HOST=0.0.0.0
CMD ["node", "dist/main.js"]
`);
    // Kubernetes manifest
    (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'deployment.yaml'), `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:
      - name: ${appName}
        image: ${appName}:${version}
        ports:
        - containerPort: ${port}
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "${port}"
        - name: HOST
          value: "0.0.0.0"
${scaling ? `        - name: AXIL_WORKERS
          value: "${workers}"
` : ''}${sized ? `        resources:
          requests:
            cpu: "${cpus}"
            memory: "${memGi}Gi"
          limits:
            cpu: "${cpus}"
            memory: "${memGi}Gi"
` : ''}        livenessProbe:
          httpGet:
            path: /health/live
            port: ${port}
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: ${port}
          initialDelaySeconds: 5
          periodSeconds: 10
${scaling ? `      terminationGracePeriodSeconds: ${grace}
` : ''}---
apiVersion: v1
kind: Service
metadata:
  name: ${appName}
spec:
  selector:
    app: ${appName}
  ports:
  - port: 80
    targetPort: ${port}
${hpa ? `---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${appName}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${appName}
  minReplicas: ${replicas}
  maxReplicas: ${scaling.horizontal.max}
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: ${Math.round(100 / (1 + scaling.headroom))}
` : ''}`);
    // Deploy script
    (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'deploy.sh'), `#!/bin/bash
set -e
APP="${appName}"
VERSION="${version}"
# Build context is the project root (package.json, src/), not deploy/
cd "$(dirname "$0")/.."
echo "Building $APP:$VERSION..."
docker build -f deploy/Dockerfile -t $APP:$VERSION .
echo "Applying Kubernetes manifests..."
kubectl apply -f deploy/deployment.yaml
echo "Deployment complete."
`);
    // .dockerignore lives next to package.json (the docker build context root)
    const dockerignorePath = (0, path_1.join)(cwd, '.dockerignore');
    let dockerignoreStatus = 'kept existing';
    if (!(0, fs_1.existsSync)(dockerignorePath)) {
        (0, fs_1.writeFileSync)(dockerignorePath, exports.DOCKERIGNORE);
        dockerignoreStatus = 'created';
    }
    else if (force) {
        (0, fs_1.writeFileSync)(dockerignorePath, exports.DOCKERIGNORE);
        dockerignoreStatus = 'overwritten';
    }
    ui.success('Deployment files generated', ui.path('deploy/'));
    ui.table([
        [ui.c.green('write'), ui.path('deploy/Dockerfile'), ui.muted(`node:20-alpine, port ${port}`)],
        [ui.c.green('write'), ui.path('deploy/deployment.yaml'), ui.muted(`${appName}:${version}, ${hpa ? `${replicas}–${scaling.horizontal.max} replicas (HPA)` : `${replicas} replica(s)`}${scaling ? `, ${workers} workers/pod` : ''}`)],
        [ui.c.green('write'), ui.path('deploy/deploy.sh'), ui.muted('build + kubectl apply')],
        [
            dockerignoreStatus === 'kept existing' ? ui.muted('keep') : ui.c.green('write'),
            ui.path('.dockerignore'),
            ui.muted(`(${dockerignoreStatus})`)
        ]
    ], { indent: 4, gap: 2 });
    ui.box('Next steps', [
        ui.cmd('npm run build'),
        ui.cmd(`docker build -f deploy/Dockerfile -t ${appName} .`),
        ui.cmd(`docker run -p ${port}:${port} ${appName}`)
    ]);
}
//# sourceMappingURL=deploy.js.map