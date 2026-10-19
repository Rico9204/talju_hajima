import { IsObject, IsString, MaxLength } from 'class-validator';

export class CreateToolDto {
  @IsString()
  @MaxLength(5000)
  text: string;

  @IsObject()
  config: Record<string, unknown>;
}
