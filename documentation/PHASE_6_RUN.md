# Build in dependency order
cd packages/common        && npm install && npm run build
cd ../config              && npm install && npm run build
cd ../security            && npm install && npm run build
cd ../pm                  && npm install && npm run build
cd ../orm                 && npm install && npm run build
cd ../auth                && npm install && npm run build
cd ../validation          && npm install && npm run build
cd ../core                && npm install && npm run build
cd ../testing             && npm install && npm run build
cd ../events              && npm install && npm run build
cd ../websocket           && npm install && npm run build
cd ../queue               && npm install && npm run build
cd ../circuit             && npm install && npm run build
cd ../observability       && npm install && npm run build
cd ../ai                  && npm install && npm run build
cd ../cli                 && npm install && npm run build
cd ../cloud               && npm install && npm run build

# Or from root:
npm run build:all

---

## Delivered
### New Package: @axil/cloud

Key Features Added:
* Deployment Toolkit (`@axil deploy`)
* Automatic Dockerfile generation
* Kubernetes manifests (Deployment, Service, Ingress, ConfigMap, HPA)
* Multi-cloud support (AWS, Azure, GCP, self-hosted K8s)
* Multi-Tenancy (tenant isolation middleware)
* Audit Logging (event-driven, immutable logs)
* Feature Flags (runtime toggles, user/tenant scoped)
* Monitoring Dashboard (/dashboard + Prometheus metrics)
* Serverless & Edge Runtime compatibility layer
* CLI Commands: `@axil deploy`, `@axil monitor`, `@axil publish`
