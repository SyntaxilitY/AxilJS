import { tEntity, tPrimaryKey, tColumn, tSensitive, tRedact } from '@axiljs/decorator'

@tEntity({ table: 'users' })
export class UserEntity {
  @tPrimaryKey()
  id!: number

  @tColumn({ type: 'varchar', length: 255 })
  name!: string

  @tColumn({ unique: true })
  @tSensitive('PII')
  email!: string

  @tColumn({ select: false })
  @tRedact({ strategy: 'remove' })
  password!: string

  @tColumn({ default: 'user' })
  role!: string
}