import { tString, tEmail, tMinLength, tMaxLength, tOptional, tPattern } from '@axiljs/decorator'

export class RegisterDto {
  @tString() @tMinLength(2) @tMaxLength(100)
  name!: string

  @tEmail()
  email!: string

  @tString() @tMinLength(8) @tPattern(/^(?=.*[A-Z])(?=.*\d).+$/)
  password!: string

  @tOptional() @tString()
  referralCode?: string
}