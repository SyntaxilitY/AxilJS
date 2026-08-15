/**
 * Order Routes
 */

import type { axilRequest as Req, axilResponse as Res } from '@axiljs/core'
import { Application, Response } from '@axiljs/core'
import { JWT, authenticate, requireRole } from '@axiljs/auth'
import { v, validate } from '@axiljs/validation'
import { OrderService } from '../services/OrderService'

export function registerOrderRoutes(app: Application, jwt: JWT) {
  const orders = new OrderService()
  const authMw = authenticate(jwt) as any
  const adminMw = requireRole('admin') as any

  // POST /api/orders/checkout
  app.post('/api/orders/checkout', authMw,
    validate({
      body: v.object({
        address: v.string().min(10).max(500)
      })
    }) as any,
    async (req: Req, res: Res) => {
      const userId = Number((req.locals.user as any).sub)
      const body   = req.body as any

      try {
        const result = await orders.checkout(userId, body.address)

        if ('error' in result) return res.badRequest(result.error as string)

        res.created(result, 'Order placed')
      } catch (err) {
        res.badRequest((err as Error).message)
      }
    }
  )

  // GET /api/orders — user sees own, admin sees all
  app.get('/api/orders', authMw, async (req: Req, res: Res) => {
    const userId          = Number((req.locals.user as any).sub)
    const { page, limit } = Response.getPaginationParams(req as any)

    const result = await orders.listByUser(userId, page, limit)

    res.paginated(result.data, result.total, result.page, result.limit, 'Orders fetched')
  })

  // GET /api/orders/:id
  app.get('/api/orders/:id', authMw, async (req: Req, res: Res) => {
    const userId = Number((req.locals.user as any).sub)
    const role   = (req.locals.user as any).role

    // Admin can see any order, customer only their own
    const order = await orders.findById(
      Number(req.params.id),
      role === 'admin' ? undefined : userId
    )

    if (!order) return res.notFound('Order not found')

    res.success(order, 'Order fetched')
  })

  // PATCH /api/orders/:id/status — admin only
  app.patch('/api/orders/:id/status', authMw, adminMw,
    validate({
      body: v.object({
        status: v.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
      })
    }) as any,
    async (req: Req, res: Res) => {
      const body   = req.body as any
      const result = await orders.updateStatus(Number(req.params.id), body.status)

      if (!result) return res.notFound('Order not found')
      if ('error' in result) return res.badRequest(result.error as string)

      res.success(result, `Order status updated to ${body.status}`)
    }
  )
}