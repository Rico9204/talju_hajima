import { IsString } from 'class-validator';

export class PingPresenceDto {
  // 워크스페이스 루트에 연동 중이면 빈 문자열.
  @IsString()
  root: string;
}
