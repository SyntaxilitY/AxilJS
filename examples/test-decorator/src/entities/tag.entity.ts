import { tEntity, tPrimaryKey, tColumn } from '@axiljs/decorator'

@tEntity({ table: 'tags' })
export class TagEntity {
  @tPrimaryKey()
  id!: number

  @tColumn({ unique: true })
  name!: string
}