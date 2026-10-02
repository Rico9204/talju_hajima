import { IsString, MinLength } from 'class-validator';

export class MoveFileDto {
  // 파일이 옮겨갈 새 경로(파일명 포함) — 예: "폴더/파일.txt".
  @IsString()
  @MinLength(1)
  path: string;
}
