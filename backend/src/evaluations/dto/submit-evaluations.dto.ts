import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class EvaluationEntryDto {
  @IsUUID()
  recipientId: string;

  @IsInt()
  @Min(1)
  @Max(10)
  role: number;

  @IsInt()
  @Min(1)
  @Max(10)
  deadline: number;

  @IsInt()
  @Min(1)
  @Max(10)
  communication: number;

  @IsInt()
  @Min(1)
  @Max(10)
  collaboration: number;

  @IsInt()
  @Min(1)
  @Max(10)
  quality: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  comment?: string;
}

export class SubmitEvaluationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluationEntryDto)
  entries: EvaluationEntryDto[];
}
