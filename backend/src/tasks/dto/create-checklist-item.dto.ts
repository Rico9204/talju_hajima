import { IsString, MinLength } from 'class-validator';

export class CreateChecklistItemDto {
  @IsString()
  @MinLength(1)
  text: string;
}
