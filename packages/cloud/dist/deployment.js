"use strict";
/**
 * Deployment Toolkit.
 * Generates Dockerfiles, Kubernetes manifests, and deployment scripts.
 * Supports `@axiljs deploy` command.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDeployment = generateDeployment;
const fs_1 = require("fs");
const path_1 = require("path");
function generateDeployment(config) {
    const dir = './deploy';
    (0, fs_1.mkdirSync)(dir, { recursive: true });
    // Dockerfile
    (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'Dockerfile'), `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
EXPOSE ${config.port}
CMD ["node", "dist/main.js"]
`);
    // Kubernetes Deployment
    const k8s = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${config.appName}
spec:
  replicas: ${config.replicas || 3}
  selector:
    matchLabels:
      app: ${config.appName}
  template:
    metadata:
      labels:
        app: ${config.appName}
    spec:
      containers:
      - name: ${config.appName}
        image: ${config.appName}:${config.version}
        ports:
        - containerPort: ${config.port}
        env:
${Object.entries(config.env || {}).map(([k, v]) => `        - name: ${k}\n          value: "${v}"`).join('\n')}
---
apiVersion: v1
kind: Service
metadata:
  name: ${config.appName}
spec:
  selector:
    app: ${config.appName}
  ports:
  - port: 80
    targetPort: ${config.port}
`;
    (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'deployment.yaml'), k8s);
    // Deployment script
    (0, fs_1.writeFileSync)((0, path_1.join)(dir, 'deploy.sh'), `#!/bin/bash
echo "Building ${config.appName}:${config.version}..."
docker build -t ${config.appName}:${config.version} .
echo "Pushing to registry..."
docker tag ${config.appName}:${config.version} registry.example.com/${config.appName}:${config.version}
docker push registry.example.com/${config.appName}:${config.version}
echo "Applying Kubernetes manifests..."
kubectl apply -f deployment.yaml
echo "Deployment complete."
`);
    console.log(`\x1b[32m[@axiljsJS Deploy]\x1b[0m Generated deployment files in ./${dir}/`);
}
//# sourceMappingURL=deployment.js.map