import { tString, tEmail, tMinLength, tMaxLength, tEnum, tOptional } from '@axiljs/decorator'

export class CreateUserDto {
  @tString() @tMinLength(2) @tMaxLength(100)
  name!: string

  @tEmail()
  email!: string

  @tOptional() @tEnum(['admin', 'editor', 'user'])
  role?: string
}