/**
 * Order Service — checkout, list orders, update status
 */

import { getDB }          from '../db'
import { CartService }    from './CartService'
import { ProductService } from './ProductService'

export class OrderService {
  private cartService    = new CartService()
  private productService = new ProductService()

  private get driver() { return getDB().getDriver() }

  async checkout(userId: number, address: string) {
    const cart = this.cartService.getCart(userId)

    if (cart.items.length === 0) return { error: 'Cart is empty' }

    // Transaction: create order + items + reduce stock
    const order = await this.driver.transaction(async (trx) => {
      // Create order
      const orderResult = await trx.query(
        `INSERT INTO orders (user_id, status, total, address) VALUES ($1, 'pending', $2, $3) RETURNING *`,
        [userId, cart.total, address]
      )
      const order = orderResult.rows[0]

      // Create order items and reduce stock
      for (const item of cart.items) {
        await trx.query(
          `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)`,
          [order.id, item.productId, item.quantity, item.price]
        )

        // Reduce stock
        const stockResult = await trx.query(
          `UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND stock >= $1 RETURNING id`,
          [item.quantity, item.productId]
        )

        if (stockResult.rows.length === 0) {
          throw new Error(`Insufficient stock for product ${item.name}`)
        }
      }

      return order
    })

    // Clear cart after successful checkout
    this.cartService.clearCart(userId)

    return order
  }

  async listByUser(userId: number, page: number, limit: number) {
    const offset = (page - 1) * limit

    const countResult = await this.driver.query(
      'SELECT COUNT(*) as total FROM orders WHERE user_id = $1', [userId]
    )

    const ordersResult = await this.driver.query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    // Get items for each order
    const orders = []
    for (const order of ordersResult.rows) {
      const itemsResult = await this.driver.query(
        `SELECT oi.*, p.name as product_name
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [order.id]
      )
      orders.push({ ...order, items: itemsResult.rows })
    }

    return {
      data:  orders,
      total: parseInt(countResult.rows[0]?.total as string || '0', 10),
      page,
      limit
    }
  }

  async findById(orderId: number, userId?: number) {
    let query = 'SELECT * FROM orders WHERE id = $1'
    const params: any[] = [orderId]

    if (userId) {
      query += ' AND user_id = $2'
      params.push(userId)
    }

    const result = await this.driver.query(query, params)
    if (result.rows.length === 0) return null

    const order = result.rows[0]

    const itemsResult = await this.driver.query(
      `SELECT oi.*, p.name as product_name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [orderId]
    )

    return { ...order, items: itemsResult.rows }
  }

  async updateStatus(orderId: number, status: string) {
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']
    if (!validStatuses.includes(status)) return { error: `Invalid status. Use: ${validStatuses.join(', ')}` }

    const result = await this.driver.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, orderId]
    )

    return result.rows[0] || null
  }
}