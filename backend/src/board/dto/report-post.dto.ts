import { IsIn, IsString, MinLength } from 'class-validator';

export class ReportPostDto {
  @IsIn(['spam', 'abuse', 'sexual', 'privacy', 'other'])
  reason: string;

  @IsString()
  @MinLength(1)
  detail: string;
}
