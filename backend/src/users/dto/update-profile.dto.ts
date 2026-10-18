import { IsHexColor, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  school?: string;

  @IsOptional()
  @IsString()
  major?: string;

  @IsOptional()
  @IsString()
  student?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsHexColor()
  bannerColor?: string;

  // http(s) URL 또는 data: URL(base64) 둘 다 허용 — 이미지 업로드가 별도 스토리지 없이
  // base64를 그대로 저장하는 방식이라 @IsUrl()은 data: URL을 거부해서 쓸 수 없다.
  @IsOptional()
  @IsString()
  bannerImageUrl?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  backgroundImageUrl?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
