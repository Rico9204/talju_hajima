import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class NewBoardPollDto {
  @IsString()
  @MinLength(1)
  question: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  options: string[];

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @IsOptional()
  @IsString()
  closesAt?: string | null;
}

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  content: string;

  // 있으면 그 프로젝트의 팀원 모집 공고가 됨 — 글쓴이가 그 프로젝트의 멤버여야 함.
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['notice', 'free', 'recruit'])
  category?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => NewBoardPollDto)
  poll?: NewBoardPollDto | null;
}
