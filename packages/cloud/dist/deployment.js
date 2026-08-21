"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDeployment = generateDeployment;
const fs_1 = require("fs");
const path_1 = require("path");
// ─── Helpers ─────────────────────────────────────────────────────────────────
/** RFC 1123 subdomain: lowercase, alphanumeric + hyphens, ≤63 chars. */
function k8sName(raw) {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 63);
}
function imageRef(cfg) {
    const name = k8sName(cfg.appName);
    return cfg.registry ? `${cfg.registry}/${name}:${cfg.version}` : `${name}:${cfg.version}`;
}
// ─── Generators ──────────────────────────────────────────────────────────────
function genDockerfile(cfg) {
    return `# ── Build stage ──────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Production stage ─────────────────────────────────────────────
FROM node:22-alpine AS runner

# Non-root user
RUN addgroup -g 1001 -S appgroup && \\
    adduser  -S appuser -u 1001 -G appgroup

WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

USER appuser
EXPOSE ${cfg.port}

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \\
  CMD wget -qO- http://localhost:${cfg.port}${cfg.healthPath ?? '/health'} || exit 1

CMD ["node", "dist/main.js"]
`;
}
function genDockerCompose(cfg) {
    const envBlock = Object.entries(cfg.env ?? {})
        .map(([k, v]) => `      - ${k}=${v}`)
        .join('\n');
    return `version: "3.9"

services:
  app:
    build: .
    ports:
      - "${cfg.port}:${cfg.port}"
    environment:
      - NODE_ENV=production
      - PORT=${cfg.port}
${envBlock}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:${cfg.port}${cfg.healthPath ?? '/health'}"]
      interval: 30s
      timeout: 3s
      retries: 3
`;
}
function genKubernetes(cfg) {
    const name = k8sName(cfg.appName);
    const img = imageRef(cfg);
    const replicas = cfg.replicas ?? 3;
    const hp = cfg.healthPath ?? '/health';
    const cpuReq = cfg.resources?.cpuRequest ?? '100m';
    const cpuLim = cfg.resources?.cpuLimit ?? '500m';
    const memReq = cfg.resources?.memoryRequest ?? '128Mi';
    const memLim = cfg.resources?.memoryLimit ?? '512Mi';
    const minRep = cfg.minReplicas ?? 2;
    const maxRep = cfg.maxReplicas ?? 10;
    const targetCPU = cfg.targetCPU ?? 70;
    const envYaml = Object.entries(cfg.env ?? {})
        .map(([k, v]) => `            - name: ${k}\n              value: ${JSON.stringify(v)}`)
        .join('\n');
    const envSection = envYaml ? `\n          env:\n${envYaml}` : '';
    let manifest = `# ── Deployment ───────────────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  labels:
    app: ${name}
    version: ${cfg.version}
spec:
  replicas: ${replicas}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
        version: ${cfg.version}
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
      containers:
        - name: ${name}
          image: ${img}
          ports:
            - containerPort: ${cfg.port}
              protocol: TCP${envSection}
          resources:
            requests:
              cpu: ${cpuReq}
              memory: ${memReq}
            limits:
              cpu: ${cpuLim}
              memory: ${memLim}
          readinessProbe:
            httpGet:
              path: ${hp}
              port: ${cfg.port}
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: ${hp}
              port: ${cfg.port}
            initialDelaySeconds: 15
            periodSeconds: 20
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]

---
# ── Service ──────────────────────────────────────────────────────
apiVersion: v1
kind: Service
metadata:
  name: ${name}
  labels:
    app: ${name}
spec:
  selector:
    app: ${name}
  ports:
    - port: 80
      targetPort: ${cfg.port}
      protocol: TCP

---
# ── HorizontalPodAutoscaler ──────────────────────────────────────
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${name}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${name}
  minReplicas: ${minRep}
  maxReplicas: ${maxRep}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: ${targetCPU}

---
# ── PodDisruptionBudget ──────────────────────────────────────────
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: ${name}
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: ${name}
`;
    // Optional Ingress
    if (cfg.domain) {
        manifest += `
---
# ── Ingress ──────────────────────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${name}
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  rules:
    - host: ${cfg.domain}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${name}
                port:
                  number: 80
  tls:
    - hosts:
        - ${cfg.domain}
      secretName: ${name}-tls
`;
    }
    return manifest;
}
// ─── Public API ──────────────────────────────────────────────────────────────
/**
 * Generate all deployment artefacts.
 *
 * @param config  Deployment configuration.
 * @param dryRun  When `true`, returns the manifests as strings
 *                instead of writing to disk.  Useful for tests.
 */
function generateDeployment(config, dryRun = false) {
    const files = [
        { filename: 'Dockerfile', content: genDockerfile(config) },
        { filename: 'docker-compose.yml', content: genDockerCompose(config) },
        { filename: 'kubernetes.yaml', content: genKubernetes(config) },
    ];
    if (!dryRun) {
        const dir = './deploy';
        (0, fs_1.mkdirSync)(dir, { recursive: true });
        for (const f of files) {
            (0, fs_1.writeFileSync)((0, path_1.join)(dir, f.filename), f.content, 'utf-8');
        }
        console.log(`\x1b[32m[@axiljs Deploy]\x1b[0m Generated ${files.length} files in ./${dir}/`);
    }
    return files;
}
//# sourceMappingURL=deployment.js.map