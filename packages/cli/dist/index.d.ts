/**
 * @axiljs/cli — Public API
 * Exports CLI utilities for programmatic use.
 */
export { createProject } from './commands/create';
export { runDev } from './commands/run';
export { buildProject } from './commands/build';
export { installPackages } from './commands/install';
export { runTests } from './commands/test';
export { runDoctor } from './commands/doctor';
export { deploy } from './commands/deploy';
export { generate } from './commands/generate';
export { migrate } from './commands/migrate';
export { verify } from './commands/verify';
export { parseArgs, COMMANDS, formatCommandHelp } from './args';
export type { CreateOptions } from './commands/create';
export type { GenerateOptions, GenerateResult } from './commands/generate';
export type { MigrateOptions } from './commands/migrate';
export type { DeployOptions } from './commands/deploy';
export type { VerifyOptions, VerifyReport } from './commands/verify';
//# sourceMappingURL=index.d.ts.map