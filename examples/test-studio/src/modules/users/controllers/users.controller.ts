/**
 * Users Controller.
 */

import { Application } from '@axiljs/core'
import type { axilRequest as Request, axilResponse as Response } from '@axiljs/core'
import { UsersService } from '../services/users.service.js'
import { JWT, authenticate } from '@axiljs/auth'

export class UsersController {
  private readonly usersService = new UsersService()

  private readonly jwt = new JWT(
    process.env.JWT_SECRET ||
      'change-this-secret-to-a-random-value-with-at-least-32-characters'
  )

  register(app: Application): void {
    app.get('/users', authenticate(this.jwt), this.list.bind(this) as any)
    app.get('/users/:id',    this.getById.bind(this) as any)
    app.post('/users',       this.create.bind(this)  as any)
    app.put('/users/:id',    this.update.bind(this)  as any)
    app.delete('/users/:id', this.remove.bind(this)  as any)
  }

  async list(_req: Request, res: Response): Promise<void> {
    const users = await this.usersService.findAll()
    // res.success({ data: users, total: users.length }, 'Users retrieved successfully')
    res.HTTP_200_OK(users, 'Users retrieved successfully');
  }

  async getById(req: Request, res: Response): Promise<void> {
    const user = await this.usersService.findById(req.params.id)
    res.success({ data: user }, 'User retrieved successfully')
  }

  async create(req: Request, res: Response): Promise<void> {
    const user = await this.usersService.create(req.body as any)
    res.created({ data: user }, 'User created successfully')
  }

  async update(req: Request, res: Response): Promise<void> {
    const user = await this.usersService.update(req.params.id, req.body as any)
    res.success({ data: user }, 'User updated successfully')
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.usersService.delete(req.params.id)
    res.noContent()
  }
}
