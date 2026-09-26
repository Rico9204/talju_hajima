import { IsString, MinLength } from 'class-validator';

export class ToggleCommentReactionDto {
  @IsString()
  @MinLength(1)
  emoji: string;
}
