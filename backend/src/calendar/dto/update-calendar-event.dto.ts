import { IsDateString, IsHexColor, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { CalendarEventType } from './create-calendar-event.dto.js';

const EVENT_TYPES = ['deadline', 'meeting', 'presentation', 'other'] as const;

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  // null을 명시적으로 보내면 기간 일정을 하루짜리로 되돌림.
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsIn(EVENT_TYPES)
  type?: CalendarEventType;
}
