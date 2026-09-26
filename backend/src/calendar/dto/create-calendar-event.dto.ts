import { IsDateString, IsHexColor, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const EVENT_TYPES = ['deadline', 'meeting', 'presentation', 'other'] as const;
export type CalendarEventType = (typeof EVENT_TYPES)[number];

export class CreateCalendarEventDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsDateString()
  date: string;

  // 기간 일정일 때만 넣음. date보다 이전이면 무시(같은 하루 일정으로 취급)된다.
  @IsOptional()
  @IsDateString()
  endDate?: string;

  // 지정하지 않으면 type 기본 색을 프론트에서 사용
  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsIn(EVENT_TYPES)
  type: CalendarEventType;
}
