/**
 * Cart Service — in-memory cart per user session.
 * In production, use Redis or database.
 */

import { ProductService } from './ProductService'

interface CartItem {
  productId: number
  name:      string
  price:     number
  quantity:  number
  subtotal:  number
}

// In-memory carts: userId → items
const carts = new Map<number, CartItem[]>()

export class CartService {
  private productService = new ProductService()

  getCart(userId: number): { items: CartItem[]; total: number } {
    const items = carts.get(userId) || []
    const total = items.reduce((sum, item) => sum + item.subtotal, 0)
    return { items, total: parseFloat(total.toFixed(2)) }
  }

  async addItem(userId: number, productId: number, quantity: number) {
    const product = await this.productService.findById(productId)
    if (!product) return { error: 'Product not found' }
    if (product.stock as number < quantity) return { error: `Only ${product.stock} in stock` }

    const items    = carts.get(userId) || []
    const existing = items.find(i => i.productId === productId)

    if (existing) {
      existing.quantity += quantity
      existing.subtotal  = parseFloat((existing.price * existing.quantity).toFixed(2))
    } else {
      items.push({
        productId,
        name:     product.name as string,
        price:    parseFloat(product.price as string),
        quantity,
        subtotal: parseFloat((parseFloat(product.price as string) * quantity).toFixed(2))
      })
    }

    carts.set(userId, items)
    return this.getCart(userId)
  }

  removeItem(userId: number, productId: number) {
    const items = carts.get(userId) || []
    const filtered = items.filter(i => i.productId !== productId)
    carts.set(userId, filtered)
    return this.getCart(userId)
  }

  clearCart(userId: number) {
    carts.delete(userId)
    return { items: [], total: 0 }
  }
}