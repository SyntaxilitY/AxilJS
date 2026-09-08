import { tEntity, tPrimaryKey, tColumn, tRelation } from '@axiljs/decorator'
import { UserEntity } from './user.entity.js'
import { CategoryEntity } from './category.entity.js'

@tEntity({ table: 'posts' })
export class PostEntity {
  @tPrimaryKey()
  id!: number

  @tColumn({ length: 200 })
  title!: string

  @tColumn({ type: 'text' })
  body!: string

  @tColumn({ type: 'enum', default: 'draft' })
  status!: 'draft' | 'published' | 'archived'

  @tRelation({ type: 'many-to-one', target: () => UserEntity })
  author!: UserEntity

  @tRelation({ type: 'many-to-one', target: () => CategoryEntity })
  category!: CategoryEntity
}