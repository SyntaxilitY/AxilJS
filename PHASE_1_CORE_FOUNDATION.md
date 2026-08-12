## Phase 1: Core Foundation

What we're building:
* Project structure
* CLI tool (rest command)
* HTTP Server (built-in, no Express)
* Router
* Basic middleware system
* Request/Response abstractions

## Structure
```bash
restjs/
├── packages/
│   ├── core/          # Runtime core, HTTP server, Router
│   ├── cli/           # rest CLI tool
│   └── common/        # Shared types, interfaces
├── package.json       # Workspace root
└── tsconfig.json      # Root TypeScript config
```