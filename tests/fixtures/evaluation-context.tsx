import { createContext, useContext, useState, type ReactNode } from "react";
import type { EvaluationData, EvaluationEntry, EvaluationPhase } from "../../src/api/types";
const Context = createContext<any>(null);
const team = { members: [
  { id: "me", userId: "me", name: "테스트 팀장", avatar: "팀", color: "#2563eb", major: "개발" },
  { id: "one", userId: "one", name: "테스트 동료 1", avatar: "일", color: "#f59e0b", major: "디자인" },
  { id: "two", userId: "two", name: "테스트 동료 2", avatar: "이", color: "#22c55e", major: "기획" },
] };
export function Fixture({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState("active");
  const project = { id: mode === "short" ? "short" : mode === "feedback" ? "feedback" : "test", name: "로컬 UI 검증", status: mode === "done" ? "done" : "active" };
  const storageKey = (phase: string) => "evaluation-restored-ui-fixture:" + project.id + ":" + phase;
  return <Context.Provider value={{
    project, team, currentMember: team.members[0], isLeader: true, isShortTerm: mode === "short",
    getEvaluationMode: async () => true,
    getEvaluations: async (phase: EvaluationPhase): Promise<EvaluationData> => mode === "feedback" && phase === "midterm" ? {
      submitted: false,
      records: [4, 8].map((score, index) => ({ id: "received-" + index, evaluator_id: index ? "two" : "one", recipient_id: "me", phase: "midterm", role: score, deadline: score, communication: score, collaboration: score, quality: score, comment: "중간 피드백 검증", created_at: "2026-09-16T00:00:00Z" })),
    } : JSON.parse(localStorage.getItem(storageKey(phase)) || '{"records":[],"submitted":false}'),
    submitEvaluations: async (phase: EvaluationPhase, entries: EvaluationEntry[]) => {
      const records = entries.map((e, i) => ({ ...e, id: String(i), phase, evaluator_id: "me", created_at: new Date().toISOString() }));
      localStorage.setItem(storageKey(phase), JSON.stringify({ records, submitted: true }));
    },
    completeProject: async () => setMode("done"),
  }}>
    <div className="p-3 flex gap-4" style={{ background: "#fef3c7", color: "#111" }}>
      <strong>테스트 전용 · 실제 DB 미연결</strong>
      <button onClick={() => setMode("active")}>진행 중 사례</button>
      <button onClick={() => setMode("short")}>단기 사례</button>
      <button onClick={() => setMode("feedback")}>중간 피드백 수신 사례</button>
      <button onClick={() => { localStorage.clear(); window.location.reload(); }}>테스트 초기화</button>
    </div>{children}
  </Context.Provider>;
}
export function useProject() { return useContext(Context); }
