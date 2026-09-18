import { apiClient } from "./client";
import type { EvaluationAverage, EvaluationData, EvaluationEntry, EvaluationPhase, PeerEvaluationRecord } from "../types";

// 동료 평가 전용 저수준 API. DataRepository 인터페이스 밖 — Workspace/FolderSync와 같은 패턴으로
// useProject() 컨텍스트를 거치지 않고 컴포넌트에서 직접 호출한다.
// 백엔드는 talju_hajima_update의 Supabase 마이그레이션(migration_peer_evaluations.sql +
// migration_evaluation_privacy.sql + migration_evaluation_prototype.sql)을 NestJS로 그대로
// 옮긴 것 — 다만 main1 백엔드엔 "프로젝트 종료" 상태 자체가 없어서, 중간/최종 평가 모두 항상
// 제출 가능한 프로토타입 모드로 고정되어 있다(정상 모드의 상태/기간 게이팅은 적용 안 함).

interface RawEvaluation {
  id: string;
  submissionId: string;
  projectId: string;
  evaluatorId: string;
  recipientId: string;
  phase: EvaluationPhase;
  role: number;
  deadline: number;
  communication: number;
  collaboration: number;
  quality: number;
  comment: string;
  createdAt: string;
}
interface RawEvaluationsResponse {
  records: RawEvaluation[];
  submitted: boolean;
  average: EvaluationAverage;
}

function toRecord(raw: RawEvaluation): PeerEvaluationRecord {
  return {
    id: raw.id,
    evaluatorId: raw.evaluatorId,
    recipientId: raw.recipientId,
    phase: raw.phase,
    role: raw.role,
    deadline: raw.deadline,
    communication: raw.communication,
    collaboration: raw.collaboration,
    quality: raw.quality,
    comment: raw.comment,
    createdAt: raw.createdAt,
  };
}

export async function getEvaluations(projectId: string, phase: EvaluationPhase): Promise<EvaluationData> {
  const { data } = await apiClient.get<RawEvaluationsResponse>(`/projects/${projectId}/evaluations/${phase}`);
  return { records: data.records.map(toRecord), submitted: data.submitted, average: data.average };
}

export async function submitEvaluations(projectId: string, phase: EvaluationPhase, entries: EvaluationEntry[]): Promise<void> {
  await apiClient.post(`/projects/${projectId}/evaluations/${phase}`, {
    entries: entries.map((e) => ({
      recipientId: e.recipientId,
      role: e.role,
      deadline: e.deadline,
      communication: e.communication,
      collaboration: e.collaboration,
      quality: e.quality,
      comment: e.comment,
    })),
  });
}
