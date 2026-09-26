import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class FileEntryDto {
  @IsString()
  @MinLength(1)
  path: string;

  @IsString()
  content: string;

  // 이 파일을 마지막으로 읽었을 때의 버전 id. 서버의 현재 버전과 같으면 즉시 반영(빨리감기),
  // 다르면(또는 없으면) 분기가 생긴다.
  @IsOptional()
  @IsString()
  baseVersionId?: string;

  // 이 변경에 대한 메모(버전 노트). 워크스페이스에서 수동으로 올릴 때만 선택적으로 붙는다.
  @IsOptional()
  @IsString()
  note?: string;

  // 지정하면 baseVersionId를 파일의 currentVersionId 대신 이 핀의 현재 위치와 비교하고,
  // 빨리감기에 성공하면 파일이 아니라 이 핀이 새 버전으로 이동한다.
  @IsOptional()
  @IsString()
  pinId?: string;
}

export class SyncFilesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FileEntryDto)
  files: FileEntryDto[];
}
