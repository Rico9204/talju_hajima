import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class AddCommentDto {
  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
}
