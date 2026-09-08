import { tEntity, tPrimaryKey, tColumn, tRelation } from '@axiljs/decorator'
import { PostEntity } from './post.entity.js'
import { UserEntity } from './user.entity.js'

@tEntity({ table: 'comments' })
export class CommentEntity {
  @tPrimaryKey()
  id!: number

  @tColumn({ type: 'text' })
  body!: string

  @tRelation({ type: 'many-to-one', target: () => PostEntity })
  post!: PostEntity

  @tRelation({ type: 'many-to-one', target: () => UserEntity })
  author!: UserEntity
}