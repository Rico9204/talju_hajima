import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreatePinDto {
  @IsUUID()
  versionId: string;

  // 안 주면 서버가 "핀 1", "핀 2" 식으로 자동 생성
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;
}
