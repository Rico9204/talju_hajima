import type { DataRepository } from "./dataRepository";
import { nestDataRepository } from "./backend/nestDataRepository";

/**
 * Single switch point for where the app's data comes from. Everything else
 * (ProjectContext, components) depends only on the `DataRepository` interface.
 *
 * [통합 작업] main의 server/(별도 백엔드) 대신, 이 세션에서 계속 써온 backend/(NestJS)
 * 하나로 합쳤다 — "두 백엔드를 나란히 띄우기"보다 "하나로 합치기"를 선택함(통합 계획 참고).
 * board/채팅 그룹/관리자 승인/동료 평가/캠퍼스 공지/푸시 알림 등은 아직 backend/에 포팅 전이라
 * nestDataRepository.ts 안에서 빈 상태/미지원 에러로 채워져 있다 — 화면은 안 깨지지만 그
 * 기능들만 실제로 동작하지 않는다. 워크스페이스/프로젝트/팀/작업/일정/채팅 메시지는 실제로 동작.
 */
export const dataRepository: DataRepository = nestDataRepository;

export type { DataRepository } from "./dataRepository";
export * from "./types";
