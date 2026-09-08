import { tEntity, tPrimaryKey, tColumn } from '@axiljs/decorator'

@tEntity({ table: 'categories' })
export class CategoryEntity {
  @tPrimaryKey()
  id!: number

  @tColumn({ unique: true })
  name!: string
}