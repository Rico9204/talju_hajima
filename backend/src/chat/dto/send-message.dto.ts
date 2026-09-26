import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class SendMessageDto {
  @ValidateIf((dto: SendMessageDto) => !dto.fileId)
  @IsString()
  text?: string;

  @IsOptional()
  @IsUUID()
  fileId?: string;
}
