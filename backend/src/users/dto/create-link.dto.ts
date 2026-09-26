import { IsIn, IsString, IsUrl, MinLength } from 'class-validator';
import { ProfileLinkType } from '../profile-link.entity.js';

const LINK_TYPES = Object.values(ProfileLinkType);

export class CreateLinkDto {
  @IsUrl()
  url: string;

  @IsIn(LINK_TYPES)
  type: ProfileLinkType;

  @IsString()
  @MinLength(1)
  label: string;
}
