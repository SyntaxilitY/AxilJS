import {
  Entity,
  BaseModel,
  PrimaryKey,
  Column,
  HasMany,
  Index
} from '@axiljs/orm'
import { Post } from './post.model'

@Entity('users')
export class User extends BaseModel {

  @PrimaryKey({ autoIncrement: true })
  id!: number

  @Column({ type: 'string', length: 255 })
  name!: string

  @Column({ type: 'string', length: 255, unique: true })
  @Index({ unique: true })
  email!: string

  @Column({ type: 'string', length: 255 })
  password!: string

  @Column({ type: 'string', length: 50 })
  role!: string

  @Column({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date

  @HasMany(() => Post, { foreignKey: 'user_id' })
  posts!: Post[]
}