import { IsString } from 'class-validator';

export class SetTagDto {
  // 빈 문자열이면 태그를 지운다.
  @IsString()
  tag: string;
}
