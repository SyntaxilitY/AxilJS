/**
 * AuthController — Handles authentication.
 * Uses AxilJS built-in SyntaxilitY Response Manager.
 * No View layer needed — res object handles formatting.
 */
import type { axilRequest as Request, axilResponse as Response } from '@axiljs/core';
import { JWT } from '@axiljs/auth';
export declare class AuthController {
    private jwt;
    constructor(jwt: JWT);
    register: [...import("@axiljs/core").MiddlewareFn[], import("@axiljs/core").RouteHandler];
    login: [...import("@axiljs/core").MiddlewareFn[], import("@axiljs/core").RouteHandler];
    me: (req: Request, res: Response) => void;
    updateProfile: [...import("@axiljs/core").MiddlewareFn[], import("@axiljs/core").RouteHandler];
}
//# sourceMappingURL=AuthController.d.ts.map