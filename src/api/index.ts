import type { DataRepository } from "./dataRepository";
import { nestDataRepository } from "./backend/nestDataRepository";

/**
 * Single switch point for where the app's data comes from. Everything else
 * (ProjectContext, components) depends only on the `DataRepository` interface.
 *
 * [2026-09-13] 실제 NestJS 백엔드(제품개발/backend)로 전환함 — 내 프로젝트/멤버/폴더 연동/
 * 워크스페이스/일정은 실제로 동작하고, 과제 보드/팀 채팅/동료 평가/정보 수집은 이번 이식
 * 범위 밖이라 빈 상태로 남음. 자세한 내용은 talju_hajima_이식기록.txt 참고.
 */
export const dataRepository: DataRepository = nestDataRepository;

export type { DataRepository } from "./dataRepository";
export * from "./types";
