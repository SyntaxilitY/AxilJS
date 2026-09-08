import { tEmail, tString, tMinLength } from '@axiljs/decorator'

export class LoginDto {
  @tEmail()
  email!: string

  @tString() @tMinLength(8)
  password!: string
}