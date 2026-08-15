/**
 * Product Routes
 */

import type { axilRequest as Req, axilResponse as Res } from '@axiljs/core'
import { Application, Response } from '@axiljs/core'
import { JWT, authenticate, requireRole } from '@axiljs/auth'
import { v, validate } from '@axiljs/validation'
import { ProductService } from '../services/ProductService'

export function registerProductRoutes(app: Application, jwt: JWT) {
  const products = new ProductService()
  const authMw   = authenticate(jwt) as any
  const adminMw  = requireRole('admin') as any

  // GET /api/products — public
  app.get('/api/products', async (req: Req, res: Res) => {
    const { page, limit } = Response.getPaginationParams(req as any)
    const category = req.query.category as string | undefined

    const result = await products.list({ page, limit, category })

    res.paginated(result.data, result.total, result.page, result.limit, 'Products fetched')
  })

  // GET /api/products/:id — public
  app.get('/api/products/:id', async (req: Req, res: Res) => {
    const product = await products.findById(Number(req.params.id))

    if (!product) return res.notFound('Product not found')

    res.success(product, 'Product fetched')
  })

  // POST /api/products — admin only
  app.post('/api/products', authMw, adminMw,
    validate({
      body: v.object({
        name:        v.string().min(2).max(200),
        description: v.string().max(2000).optional(),
        price:       v.number().min(0),
        stock:       v.number().min(0).integer(),
        category:    v.string().max(100).optional()
      })
    }) as any,
    async (req: Req, res: Res) => {
      const product = await products.create(req.body as any)

      res.created(product, 'Product created')
    }
  )

  // PUT /api/products/:id — admin only
  app.put('/api/products/:id', authMw, adminMw,
    validate({
      body: v.object({
        name:        v.string().min(2).max(200).optional(),
        description: v.string().max(2000).optional(),
        price:       v.number().min(0).optional(),
        stock:       v.number().min(0).integer().optional(),
        category:    v.string().max(100).optional()
      })
    }) as any,
    async (req: Req, res: Res) => {
      const product = await products.update(Number(req.params.id), req.body as any)

      if (!product) return res.notFound('Product not found')

      res.success(product, 'Product updated')
    }
  )

  // DELETE /api/products/:id — admin only (soft delete)
  app.delete('/api/products/:id', authMw, adminMw, async (req: Req, res: Res) => {
    const deleted = await products.delete(Number(req.params.id))

    if (!deleted) return res.notFound('Product not found')

    res.success(null, 'Product deleted')
  })
}