/**
 * PostController — CRUD for blog posts.
 * Uses AxilJS built-in SyntaxilitY Response Manager.
 */
import type { axilRequest as Request, axilResponse as Response } from '@axiljs/core';
export declare class PostController {
    list: (req: Request, res: Response) => void;
    show: (req: Request, res: Response) => void;
    showBySlug: (req: Request, res: Response) => void;
    create: [...import("@axiljs/core").MiddlewareFn[], import("@axiljs/core").RouteHandler];
    update: [...import("@axiljs/core").MiddlewareFn[], import("@axiljs/core").RouteHandler];
    destroy: (req: Request, res: Response) => void;
    publish: (req: Request, res: Response) => void;
}
//# sourceMappingURL=PostController.d.ts.map