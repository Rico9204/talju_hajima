import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class SetScheduleLinkDto {
  @IsIn(['team', 'personal'])
  field: 'team' | 'personal';

  @IsOptional()
  @IsUUID()
  eventId?: string | null;
}
