import { IsString, MinLength } from 'class-validator';

export class SaveSubscriptionDto {
  @IsString()
  @MinLength(1)
  endpoint: string;

  @IsString()
  @MinLength(1)
  p256dh: string;

  @IsString()
  @MinLength(1)
  auth: string;
}
