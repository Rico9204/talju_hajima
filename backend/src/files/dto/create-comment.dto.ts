import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  content: string;

  // 특정 버전(페이지)에 남기는 댓글이면 그 버전 id — 안 주면 파일 전체에 대한 일반 댓글로 저장됨.
  @IsOptional()
  @IsUUID()
  versionId?: string;
}
