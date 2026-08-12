/**
 * rest run
 * Development server with hot reload.
 * Watches src/ for TypeScript changes → recompiles → restarts automatically.
 *
 * How it works:
 *   1. Compile the project once on startup
 *   2. Start the compiled server from dist/
 *   3. Watch src/ for .ts file changes
 *   4. On change: recompile only changed files (incremental)
 *   5. Kill old server process
 *   6. Start new server process
 *   7. Show timing and what changed
 *
 * This approach is faster than ts-node because:
 *   - Uses tsc incremental compilation (only recompiles changed files)
 *   - Runs compiled JS directly (no TypeScript overhead at runtime)
 *   - Sub-second restarts for most changes
 */
/**
 * Start the REstJS development server with hot reload.
 */
export declare function runDev(): Promise<void>;
//# sourceMappingURL=run.d.ts.map