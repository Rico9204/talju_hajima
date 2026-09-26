import { IsBoolean } from 'class-validator';

export class ToggleChecklistItemDto {
  @IsBoolean()
  done: boolean;
}
