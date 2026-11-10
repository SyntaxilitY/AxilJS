/**
 * Application configuration types.
 * Used when creating a new AxilJS application.
 */
export interface ServerConfig {
    port?: number;
    host?: string;
    http2?: boolean;
    ssl?: {
        key: string;
        cert: string;
    };
    bodyLimit?: string;
    timeout?: number;
    headFallback?: boolean;
    methodNotAllowed?: boolean;
    trustProxy?: TrustProxy;
}
export type TrustProxy = boolean | number | ((address: string, hop: number) => boolean);
export interface AppConfig {
    server?: ServerConfig;
    env?: string;
    prettyJson?: boolean;
    prefix?: string;
    logging?: boolean;
}
export interface RouteDefinition {
    method: string;
    path: string;
    name?: string;
}
//# sourceMappingURL=app.types.d.ts.map