# @axiljs/cloud

Enterprise features — multi-tenancy, audit logs, feature flags, and deployment.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/cloud
```

## Usage

```typescript
import { multiTenancy, getTenant, auditLog,
         FeatureFlagManager } from '@axiljs/cloud'

app.use(multiTenancy({ strategy: 'header', headerName: 'x-tenant-id' }))

const flags = new FeatureFlagManager()
flags.define({ name: 'new-checkout', enabled: true, rolloutPercentage: 50 })
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
