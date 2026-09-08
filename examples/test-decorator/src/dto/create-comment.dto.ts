import { tString, tMinLength, tMaxLength } from '@axiljs/decorator'

export class CreateCommentDto {
  @tString() @tMinLength(1) @tMaxLength(2000)
  body!: string
}