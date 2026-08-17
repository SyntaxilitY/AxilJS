import {
  Entity,
  BaseModel,
  PrimaryKey,
  Column,
  BelongsTo,
  Index
} from '@axiljs/orm'

import { User } from './user.model'

@Entity('posts')
export class Post extends BaseModel {

  @PrimaryKey({ autoIncrement: true })
  id!: number

  @Column({ type: 'string', length: 500 })
  title!: string

  @Column({ type: 'text' })
  body!: string

  @Column({ type: 'integer', name: 'user_id' })
  @Index()
  userId!: number

  @BelongsTo(() => User, { foreignKey: 'user_id' })
  user!: User
}