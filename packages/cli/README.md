# @axiljs/cli

The official command-line interface for [AxilJS](https://github.com/SyntaxilitY/AxilJS).

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install -g @axiljs/cli
````

## Commands

### Project Commands

```bash
axil create <name>          # Create a new AxilJS project

axil run                    # Start dev server with hot reload
axil run src/mvc/main.ts    # Start with a custom entry point

axil build                  # Compile TypeScript for production

axil test [pattern]         # Run test files

axil deploy                 # Generate Docker + Kubernetes files

axil install [package]      # Install an AxilJS package

axil doctor                 # Diagnose project issues
```

### Decorator Commands

AxilJS provides a semantic decorator system with a comprehensive decorator catalog.

```bash
axil decorator list         # List all available decorators

axil decorator list --category Security
                            # List decorators in a category

axil decorator info <name>  # Show detailed decorator information

axil decorator search <query>
                            # Search decorators by name or description

axil decorator check <file>
                            # Check decorator composition and conflicts

axil decorator graph <file>
                            # Generate decorator metadata graph

axil decorator categories   # Show all decorator categories
```

### CLI Information

```bash
axil --version              # Show CLI version

axil --help                 # Show available commands
```

## Quick Start

Create a new AxilJS project:

```bash
axil create my-api

cd my-api

npm install

axil run
```

Your development server will start with hot reload enabled.

## Decorator Catalog

The decorator catalog organizes AxilJS decorators into semantic categories, including:

* HTTP
* Security
* Data
* Reliability
* Concurrency
* Distributed
* Messaging
* Caching
* Observability
* Compliance
* Runtime
* AI
* Validation
* Contract
* Execution
* Workflow

You can inspect the catalog directly from the CLI:

```bash
axil decorator categories
```

List all decorators:

```bash
axil decorator list
```

Inspect a specific decorator:

```bash
axil decorator info tAuth
```

Search the catalog:

```bash
axil decorator search authentication
```

Check decorator composition:

```bash
axil decorator check src/controllers/user.controller.ts
```

Generate a decorator metadata graph:

```bash
axil decorator graph src/controllers/user.controller.ts
```

## Documentation

Full documentation:

[AxilJS Documentation](https://github.com/SyntaxilitY/AxilJS)

[AxilJS Website](https://www.axiljs.dev/)

## License

See the [LICENSE](https://github.com/SyntaxilitY/AxilJS/blob/main/LICENSE) file for license information.
