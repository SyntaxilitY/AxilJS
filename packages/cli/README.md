# @axiljs/cli

The AxilJS command line interface.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install -g @axiljs/cli
```

## Commands

```bash
axil create <name>        # Create a new project
axil run                  # Start dev server with hot reload
axil run src/mvc/main.ts  # Custom entry point with hot reload
axil build                # Compile TypeScript for production
axil test [pattern]       # Run test files
axil deploy               # Generate Docker + Kubernetes files
axil install [package]    # Install a package
axil doctor               # Diagnose project issues
axil --version            # Show version
```

## Quick Start

```bash
axil create my-api
cd my-api
npm install
axil run
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
