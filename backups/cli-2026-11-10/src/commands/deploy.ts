/**
 * axil deploy
 * Generates Docker + Kubernetes deployment files.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

export interface DeployOptions {
  // Container port (default: 3000)
  port?: number | string
  // Kubernetes replicas (default: 3)
  replicas?: number | string
  // Overwrite existing files silently, incl. an existing .dockerignore (default: false)
  force?: boolean
  // Project directory (default: process.cwd())
  cwd?: string
}

function positiveInt(value: number | string | undefined, fallback: number, label: string, max: number): number {
  if (value === undefined || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new Error(`Invalid ${label} "${value}". Expected an integer between 1 and ${max}.`)
  }
  return n
}

export const DOCKERIGNORE = `node_modules
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
`

export async function deploy(options: DeployOptions = {}): Promise<void> {
  const port     = positiveInt(options.port, 3000, '--port', 65535)
  const replicas = positiveInt(options.replicas, 3, '--replicas', 1000)
  const force    = options.force === true

  console.log('\n\x1b[36m[AxilJS Deploy]\x1b[0m Generating deployment artifacts...\n')

  const cwd = options.cwd || process.cwd()
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

  // Docker image names and Kubernetes resource names must be lowercase
  // DNS-1123 labels — a scoped npm name like "@org/api" is invalid as-is.
  const appName  = String(pkg.name || 'axil-app')
    .toLowerCase().replace(/^@/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'axil-app'
  const version  = pkg.version || '1.0.0'

  const dir = join(cwd, 'deploy')
  mkdirSync(dir, { recursive: true })

  for (const f of ['Dockerfile', 'deployment.yaml', 'deploy.sh']) {
    if (!force && existsSync(join(dir, f))) {
      console.log(`\x1b[33mWarning:\x1b[0m Overwriting existing deploy/${f}`)
    }
  }

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
ENV PORT=${port}
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
# Build context is the project root (package.json, src/), not deploy/
cd "$(dirname "$0")/.."
echo "Building $APP:$VERSION..."
docker build -f deploy/Dockerfile -t $APP:$VERSION .
echo "Applying Kubernetes manifests..."
kubectl apply -f deploy/deployment.yaml
echo "Deployment complete."
`)

  // .dockerignore lives next to package.json (the docker build context root)
  const dockerignorePath = join(cwd, '.dockerignore')
  let dockerignoreStatus = 'kept existing'
  if (!existsSync(dockerignorePath)) {
    writeFileSync(dockerignorePath, DOCKERIGNORE)
    dockerignoreStatus = 'created'
  } else if (force) {
    writeFileSync(dockerignorePath, DOCKERIGNORE)
    dockerignoreStatus = 'overwritten'
  }

  console.log('\x1b[32m✓\x1b[0m Deployment files generated:\n')
  console.log(`  \x1b[36m${dir}\x1b[0m`)
  console.log('  ├── Dockerfile')
  console.log('  ├── deployment.yaml')
  console.log('  └── deploy.sh')
  console.log(`  .dockerignore (${dockerignoreStatus})\n`)
  console.log('Next steps:\n')
  console.log('  npm run build')
  console.log(`  docker build -f deploy/Dockerfile -t ${appName} .`)
  console.log(`  docker run -p ${port}:${port} ${appName}`)
  console.log('')
}