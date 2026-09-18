import { apiClient } from "./client";

// 프로젝트 단위 일정(캘린더) API. DataRepository 인터페이스 밖 — 제품개발/frontend의
// api/calendar.ts를 그대로 이식. talju_hajima 원래 있던 개인/팀 범위(scope)·공개범위(visibility)
// 구분은 이 실제 백엔드 캘린더 엔티티엔 없는 개념이라(제목/날짜/기간/색/refType만 존재) 대체하지 않음.

export type CalendarEventType = "deadline" | "meeting" | "presentation" | "other";
export type CalendarEventSource = "crawled" | "system" | "manual";

export interface CalendarEvent {
  id: string;
  projectId: string;
  title: string;
  date: string;
  endDate: string | null;
  color: string | null;
  refType: CalendarEventType | null;
  // "manual"(직접 추가)만 수정/삭제 가능 — crawled/system은 그 출처에서만 관리됨(백엔드
  // calendar.service.ts의 findEditable 참고).
  source: CalendarEventSource;
}

export function listCalendarEvents(projectId: string) {
  return apiClient.get<CalendarEvent[]>(`/projects/${projectId}/calendar`);
}

export function createCalendarEvent(
  projectId: string,
  input: { title: string; date: string; endDate?: string; color?: string; type: CalendarEventType },
) {
  return apiClient.post<CalendarEvent>(`/projects/${projectId}/calendar`, input);
}

export function updateCalendarEvent(
  projectId: string,
  eventId: string,
  patch: Partial<{ title: string; date: string; endDate: string | null; color: string; type: CalendarEventType }>,
) {
  return apiClient.patch<CalendarEvent>(`/projects/${projectId}/calendar/${eventId}`, patch);
}

export function deleteCalendarEvent(projectId: string, eventId: string) {
  return apiClient.delete<void>(`/projects/${projectId}/calendar/${eventId}`);
}
