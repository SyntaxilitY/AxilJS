import { tString, tMinLength, tMaxLength, tOptional, tNumber } from '@axiljs/decorator'

export class CreatePostDto {
  @tString() @tMinLength(3) @tMaxLength(200)
  title!: string

  @tString() @tMinLength(10)
  body!: string

  @tOptional() @tNumber()
  categoryId?: number
}