/**
 * Cart Routes
 */

import type { axilRequest as Req, axilResponse as Res } from '@axil/core'
import { Application } from '@axil/core'
import { JWT, authenticate } from '@axil/auth'
import { v, validate } from '@axil/validation'
import { CartService } from '../services/CartService'

export function registerCartRoutes(app: Application, jwt: JWT) {
  const cart   = new CartService()
  const authMw = authenticate(jwt) as any

  // GET /api/cart
  app.get('/api/cart', authMw, (req: Req, res: Res) => {
    const userId = Number((req.locals.user as any).sub)
    const result = cart.getCart(userId)

    res.success(result, 'Cart fetched')
  })

  // POST /api/cart/add
  app.post('/api/cart/add', authMw,
    validate({
      body: v.object({
        productId: v.number().integer().positive(),
        quantity:  v.number().integer().positive()
      })
    }) as any,
    async (req: Req, res: Res) => {
      const userId = Number((req.locals.user as any).sub)
      const body   = req.body as any
      const result = await cart.addItem(userId, body.productId, body.quantity)

      if ('error' in result) return res.badRequest(result.error)

      res.success(result, 'Item added to cart')
    }
  )

  // DELETE /api/cart/remove/:productId
  app.delete('/api/cart/remove/:productId', authMw, (req: Req, res: Res) => {
    const userId = Number((req.locals.user as any).sub)
    const result = cart.removeItem(userId, Number(req.params.productId))

    res.success(result, 'Item removed from cart')
  })

  // DELETE /api/cart/clear
  app.delete('/api/cart/clear', authMw, (req: Req, res: Res) => {
    const userId = Number((req.locals.user as any).sub)
    const result = cart.clearCart(userId)

    res.success(result, 'Cart cleared')
  })
}