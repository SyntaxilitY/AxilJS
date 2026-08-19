/**
 * Configuration schema and validation.
 * Define what env vars your app needs - get type-safe config back.
 *
 * Usage:
 *   const config = defineConfig({
 *     PORT: { type: 'number', default: 3000 },
 *     DATABASE_URL: { type: 'string', required: true },
 *     DEBUG: { type: 'boolean', default: false }
 *   })
 *
 *   config.PORT       // number
 *   config.DATABASE_URL // string
 *   config.DEBUG      // boolean
 */
type FieldType = 'string' | 'number' | 'boolean' | 'json';
type TypeMap = {
    string: string;
    number: number;
    boolean: boolean;
    json: unknown;
};
interface FieldDef<T extends FieldType> {
    type: T;
    required?: boolean;
    default?: TypeMap[T];
    description?: string;
    enum?: TypeMap[T][];
    min?: number;
    max?: number;
}
type Schema = Record<string, FieldDef<FieldType>>;
type InferConfig<S extends Schema> = {
    [K in keyof S]: S[K] extends FieldDef<infer T> ? S[K]['required'] extends true ? TypeMap[T] : S[K]['default'] extends TypeMap[T] ? TypeMap[T] : TypeMap[T] | undefined : never;
};
/**
 * Define and validate application configuration from environment variables.
 * Throws ValidationError on startup if required vars are missing.
 *
 * @param schema  Configuration schema definition
 * @param source  Environment source (default: process.env)
 * @returns       Parsed and typed configuration object
 */
export declare function defineConfig<S extends Schema>(schema: S, source?: Record<string, string | undefined>): InferConfig<S>;
export {};
//# sourceMappingURL=schema.d.ts.map