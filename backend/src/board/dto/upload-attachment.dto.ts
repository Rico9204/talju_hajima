import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UploadAttachmentDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsInt()
  @Min(0)
  byteSize: number;

  @IsIn(['image', 'file'])
  kind: 'image' | 'file';

  @IsOptional()
  @IsString()
  mimeType?: string;

  // base64 data: URL — ProjectFile.content와 동일한 방식으로 그대로 저장한다.
  @IsString()
  @MinLength(1)
  data: string;
}
