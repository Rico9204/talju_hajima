import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ActToolDto {
  @IsString()
  @MaxLength(50)
  action: string;

  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;
}
