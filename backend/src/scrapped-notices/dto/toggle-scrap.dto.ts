import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ToggleScrapDto {
  @IsString()
  @MinLength(1)
  id: string;

  @IsString()
  @MinLength(1)
  schoolCode: string;

  @IsString()
  @MinLength(1)
  schoolName: string;

  @IsIn(['all', 'contest', 'job', 'general', 'internship'])
  category: string;

  @IsString()
  title: string;

  @IsString()
  author: string;

  @IsString()
  postDate: string;

  @IsString()
  link: string;

  @IsOptional()
  @IsString()
  categoryLabel?: string;
}
