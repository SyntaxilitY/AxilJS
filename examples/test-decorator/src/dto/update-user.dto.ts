import { tOptional, tString, tMinLength, tMaxLength, tEmail } from '@axiljs/decorator'

export class UpdateUserDto {
  @tOptional() @tString() @tMinLength(2) @tMaxLength(100)
  name?: string

  @tOptional() @tEmail()
  email?: string
}