/**
 * Project templates for `axil create <name> --template <id>`.
 *
 * A template supplies the application: its source files, tests, README,
 * .env.example, dependencies and next steps. `axil create` adds the shared
 * scaffolding around it (package.json shell, tsconfig.json, .gitignore),
 * writes everything, and runs npm install.
 *
 * Generated projects are ESM TypeScript (`"type": "module"`, module Node16):
 * relative imports end in `.js`, tests live in `src/**\/*.test.ts` and run
 * with `axil test` (compiled by tsc first, so decorators are fine).
 */

export interface TemplateContext {
  /** Project (directory and package) name. */
  name: string
  /** Semver range for sibling @axiljs/* packages, e.g. "^0.3.0". */
  axilRange: string
  /** Version of the CLI creating the project, e.g. "0.3.2". */
  cliVersion: string
}

export interface ProjectTemplate {
  /** Value of --template, kebab-case. */
  id: string
  /** Display name, e.g. "REST API". */
  title: string
  /** One line for help screens and the template picker. */
  summary: string
  /** @axiljs packages it showcases, for the picker / docs. */
  packages: string[]
  /** Port the app listens on (shown in the summary and next steps). */
  port: number
  /** Runtime dependencies (use ctx.axilRange for @axiljs/*). */
  dependencies(ctx: TemplateContext): Record<string, string>
  /** Extra devDependencies, merged over the shared ones. */
  devDependencies?(ctx: TemplateContext): Record<string, string>
  /** Extra package.json scripts, merged over dev/build/start/test. */
  scripts?: Record<string, string>
  /**
   * Every project file except package.json, tsconfig.json and .gitignore,
   * keyed by POSIX path relative to the project root. Must include
   * src/main.ts, README.md and .env.example.
   */
  files(ctx: TemplateContext): Record<string, string>
  /**
   * Steps after `cd <name>`, `npm install` and copying .env.example:
   * [command or "Edit .env"-style instruction, optional hint].
   */
  nextSteps(ctx: TemplateContext): Array<[string, string?]>
}
