import { IsOptional, IsString } from 'class-validator';

// 참여 시점에 계정 프로필(학교/학과/학번)을 같이 채울 수 있다 — 처음 참여하는 사용자가
// 프로필을 채우는 자연스러운 지점이라 그렇지, 값은 계정(User)에 저장된다 (UsersService.fillProfileOnJoin).
export class AcceptInvitationDto {
  @IsOptional()
  @IsString()
  school?: string;

  @IsOptional()
  @IsString()
  major?: string;

  @IsOptional()
  @IsString()
  student?: string;
}
