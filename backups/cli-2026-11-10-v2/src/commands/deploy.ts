/**
 * axil deploy
 * Generates Docker + Kubernetes deployment files.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

import * as ui from '../ui'

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

  ui.title('deploy', 'Generate Docker + Kubernetes files')

  const cwd = options.cwd || process.cwd()
  const pkgPath = join(cwd, 'package.json')

  if (!existsSync(pkgPath)) {
    ui.error('No package.json found.', 'Run axil deploy from the project root.')
    process.exit(1)
  }

  let pkg: any
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) }
  catch {
    ui.error('Could not parse package.json', ui.path(pkgPath))
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
      ui.warn(`Overwriting existing deploy/${f}`, 'use --force to skip this warning')
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

  ui.success('Deployment files generated', ui.path('deploy/'))
  ui.table([
    [ui.c.green('write'), ui.path('deploy/Dockerfile'),      ui.muted(`node:20-alpine, port ${port}`)],
    [ui.c.green('write'), ui.path('deploy/deployment.yaml'), ui.muted(`${appName}:${version}, ${replicas} replica(s)`)],
    [ui.c.green('write'), ui.path('deploy/deploy.sh'),       ui.muted('build + kubectl apply')],
    [
      dockerignoreStatus === 'kept existing' ? ui.muted('keep') : ui.c.green('write'),
      ui.path('.dockerignore'),
      ui.muted(`(${dockerignoreStatus})`)
    ]
  ], { indent: 4, gap: 2 })

  ui.box('Next steps', [
    ui.cmd('npm run build'),
    ui.cmd(`docker build -f deploy/Dockerfile -t ${appName} .`),
    ui.cmd(`docker run -p ${port}:${port} ${appName}`)
  ])
}