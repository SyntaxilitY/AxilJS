/**
 * Auth Service — register, login, profile
 */
import { JWT } from '@axiljs/auth';
export declare class AuthService {
    private jwt;
    constructor(jwt: JWT);
    private get driver();
    register(data: {
        name: string;
        email: string;
        password: string;
        role?: string;
    }): Promise<{
        error: string;
        user?: undefined;
        token?: undefined;
    } | {
        error?: undefined;
        user: Record<string, unknown>;
        token: string;
    }>;
    login(email: string, password: string): Promise<{
        user?: undefined;
        token?: undefined;
        error: string;
    } | {
        error?: undefined;
        user: {
            [x: string]: unknown;
        };
        token: string;
    }>;
    getProfile(userId: number): Promise<Record<string, unknown>>;
}
//# sourceMappingURL=AuthService.d.ts.map