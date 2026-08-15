/**
 * axil deploy
 * Generates Docker + Kubernetes deployment files.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

export async function deploy(): Promise<void> {
  console.log('\n\x1b[36m[AxilJS Deploy]\x1b[0m Generating deployment artifacts...\n')

  const cwd = process.cwd()
  const pkgPath = join(cwd, 'package.json')

  if (!existsSync(pkgPath)) {
    console.error('\x1b[31mError:\x1b[0m No package.json found.')
    process.exit(1)
  }

  let pkg: any
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) }
  catch {
    console.error('\x1b[31mError:\x1b[0m Could not parse package.json')
    process.exit(1)
  }

  const appName  = pkg.name    || 'axil-app'
  const version  = pkg.version || '1.0.0'
  const port     = 3000
  const replicas = 3

  const dir = join(cwd, 'deploy')
  mkdirSync(dir, { recursive: true })

  // Dockerfile
  writeFileSync(join(dir, 'Dockerfile'), `# AxilJS Production Dockerfile
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
EXPOSE ${port}
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
`)

  // Kubernetes manifest
  writeFileSync(join(dir, 'deployment.yaml'), `apiVersion: apps/v1
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
        livenessProbe:
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
---
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
`)

  // Deploy script
  writeFileSync(join(dir, 'deploy.sh'), `#!/bin/bash
set -e
APP="${appName}"
VERSION="${version}"
echo "Building $APP:$VERSION..."
docker build -t $APP:$VERSION .
echo "Applying Kubernetes manifests..."
kubectl apply -f deployment.yaml
echo "Deployment complete."
`)

  console.log('\x1b[32m✓\x1b[0m Deployment files generated:\n')
  console.log(`  \x1b[36m${dir}\x1b[0m`)
  console.log('  ├── Dockerfile')
  console.log('  ├── deployment.yaml')
  console.log('  └── deploy.sh\n')
  console.log('Next steps:\n')
  console.log('  npm run build')
  console.log(`  docker build -t ${appName} .`)
  console.log(`  docker run -p ${port}:${port} ${appName}`)
  console.log('')
}