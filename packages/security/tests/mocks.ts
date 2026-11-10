import type { axilRequest, axilResponse } from '@axiljs/common';

export function mockReq(overrides: Partial<axilRequest> = {}): axilRequest {
  return {
    raw: {} as any,
    method: 'GET',
    url: '/',
    path: '/',
    params: {},
    query: {},
    headers: {},
    body: null,
    ip: '127.0.0.1',
    locals: {},
    ...overrides
  } as axilRequest;
}

export interface MockRes extends axilResponse {
  headers: Record<string, string>;
  removed: string[];
}

export function mockRes(): MockRes {
  const headers: Record<string, string> = {};
  const removed: string[] = [];
  const res = {
    headers,
    removed,
    raw: {
      removeHeader: (name: string) => {
        removed.push(name);
      }
    },
    header(name: string, value: string) {
      headers[name] = value;
      return res;
    }
  } as unknown as MockRes;
  return res;
}

/** Run a middleware and resolve with whatever it passed to next(). */
export async function run(
  mw: (req: axilRequest, res: axilResponse, next: (e?: Error) => void) => void | Promise<void>,
  req: axilRequest,
  res: axilResponse
): Promise<{ called: boolean; error?: Error }> {
  let outcome: { called: boolean; error?: Error } = { called: false };
  await mw(req, res, (error?: Error) => {
    outcome = { called: true, error };
  });
  return outcome;
}
