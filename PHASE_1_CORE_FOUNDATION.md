## Phase 1: Core Foundation

What we're building:
* Project structure
* CLI tool (@axil command)
* HTTP Server (built-in, no Express)
* Router
* Basic middleware system
* Request/Response abstractions

## Structure
```bash
@axiljs/
├── packages/
│   ├── core/          # Runtime core, HTTP server, Router
│   ├── cli/           # @axil CLI tool
│   └── common/        # Shared types, interfaces
├── package.json       # Workspace root
└── tsconfig.json      # Root TypeScript config
```