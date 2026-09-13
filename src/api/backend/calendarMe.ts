import { apiClient } from "./client";

// 내가 속한 모든 프로젝트의 일정을 프로젝트 이름과 함께 합쳐서 조회 (백엔드 GET /calendar/me).
// "내 프로젝트" 화면에서 프로젝트별 가장 빠른 일정을 보여주는 데 씀 — DataRepository 인터페이스엔
// 없는, 여러 프로젝트를 가로지르는 조회라 talju의 프로젝트 단위 모델과는 별도로 직접 호출한다.
export interface MyCalendarEvent {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  date: string;
  refType: "deadline" | "meeting" | "presentation" | "other" | null;
}

export function listMyCalendarEvents() {
  return apiClient.get<MyCalendarEvent[]>("/calendar/me");
}
