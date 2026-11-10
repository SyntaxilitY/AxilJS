/**
 * AxilJS CLI
 * create command
 *
 * Creates a production-ready AxilJS application, installs dependencies,
 * and prints the exact commands required to start development.
 */
export type Database = 'none' | 'sqlite' | 'postgres' | 'mysql';
export declare const DATABASES: Database[];
export interface ProjectOptions {
    database: Database;
    includeAuth: boolean;
    includeAI: boolean;
    includeWebsocket: boolean;
    includeQueue: boolean;
}
/**
 * Non-interactive options for createProject(). Every field is optional:
 * a field that is set skips its prompt.
 */
export interface CreateOptions {
    yes?: boolean;
    db?: Database;
    auth?: boolean;
    ai?: boolean;
    ws?: boolean;
    queue?: boolean;
    skipInstall?: boolean;
    force?: boolean;
    cwd?: string;
    interactive?: boolean;
}
export declare const CREATE_DEFAULTS: ProjectOptions;
export declare function createProject(name: string, opts?: CreateOptions): Promise<void>;
export interface ResourceNames {
    file: string;
    className: string;
    entity: string;
    route: string;
    table: string;
    plural: string;
    singular: string;
}
export declare function toKebab(input: string): string;
export declare function toPascal(input: string): string;
export declare function toSnake(input: string): string;
/** Derive file/class/route/table names from a user-supplied resource name. */
export declare function resourceNames(input: string): ResourceNames;
export declare function generateResourceController(options: ProjectOptions, n: ResourceNames): string;
export declare function generateResourceService(options: ProjectOptions, n: ResourceNames, fields?: string[]): string;
export declare function generateEntity(n: ResourceNames, fields?: string[]): string;
export declare function generateCreateTableMigration(database: Database, migrationName: string, table: string, fields?: string[], uniqueFields?: string[]): string;
export declare function generateEmptyMigration(migrationName: string): string;
//# sourceMappingURL=create.d.ts.map