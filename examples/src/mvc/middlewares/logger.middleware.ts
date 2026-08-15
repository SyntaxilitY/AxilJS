/**
 * Request logger middleware specific to the MVC example
 */

import { MiddlewareFn } from '@axiljs/common'

export function mvcLogger(): MiddlewareFn {
  return (req, res, next) => {
    const start = Date.now()
    const originalEnd = (res.raw as any).end.bind(res.raw)

    ;(res.raw as any).end = function (...args: any[]) {
      const ms     = Date.now() - start
      const status = res.raw.statusCode
      const color  = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m'

      console.log(
        `\x1b[90m${new Date().toLocaleTimeString()}\x1b[0m ` +
        `\x1b[36m[MVC]\x1b[0m ` +
        `\x1b[35m${req.method}\x1b[0m ` +
        `${req.path} ` +
        `${color}${status}\x1b[0m ` +
        `\x1b[90m${ms}ms\x1b[0m`
      )

      return originalEnd(...args)
    }

    next()
  }
}