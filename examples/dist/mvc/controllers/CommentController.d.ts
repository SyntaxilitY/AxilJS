/**
 * CommentController — Comments on posts.
 * Uses AxilJS built-in SyntaxilitY Response Manager.
 */
import type { axilRequest as Request, axilResponse as Response } from '@axiljs/core';
export declare class CommentController {
    list: (req: Request, res: Response) => void;
    create: [...import("@axiljs/core").MiddlewareFn[], import("@axiljs/core").RouteHandler];
    destroy: (req: Request, res: Response) => void;
}
//# sourceMappingURL=CommentController.d.ts.map