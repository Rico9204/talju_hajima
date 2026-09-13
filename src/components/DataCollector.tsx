import { useEffect, useState } from "react";
import { useProject } from "../context/ProjectContext";

type JobStatus = "pending" | "running" | "done" | "failed";
type JobMode = "url" | "keyword";

interface ResultItem {
  id: number;
  title: string;
  snippet: string;
  source: string;
  savedToWorkspace: boolean;
}

interface Job {
  id: number;
  mode: JobMode;
  query: string;
  status: JobStatus;
  createdAt: string;
  items: ResultItem[];
}

const jobsByProject: Record<string, Job[]> = {
  heritage: [
    {
      id: 1, mode: "keyword", query: "강화도 문화유산 등록문화재", status: "done", createdAt: "2026-09-09 14:20",
      items: [
        { id: 1, title: "강화군 등록문화재 현황 — 문화재청 국가유산포털", snippet: "강화군 소재 등록문화재 12건의 지정 현황과 소재지, 관리 주체 정보 요약.", source: "heritage.go.kr", savedToWorkspace: true },
        { id: 2, title: "강화 갑곶돈대 실측 조사 보고서 요약", snippet: "2019년 실측 조사 결과와 보존 상태, 복원 이력 정리.", source: "ghmuseum.incheon.kr", savedToWorkspace: false },
        { id: 3, title: "강화도 근대 개항기 건축물 목록", snippet: "개항기 관련 건축물 8곳의 주소와 건립 연대 정리표.", source: "ncms.nculture.org", savedToWorkspace: false },
      ],
    },
    {
      id: 2, mode: "url", query: "https://www.cha.go.kr/incheon/notice/list.do", status: "running", createdAt: "2026-09-10 10:05",
      items: [{ id: 4, title: "인천시 문화재 보수정비 공고 (2026)", snippet: "2026년 하반기 보수정비 대상 문화재 목록 및 일정 공고문.", source: "cha.go.kr", savedToWorkspace: false }],
    },
    {
      id: 3, mode: "keyword", query: "지역 아카이브 구축 사례 대학교", status: "failed", createdAt: "2026-09-08 21:40", items: [],
    },
  ],
  dialect: [
    {
      id: 101, mode: "keyword", query: "강원도 방언 어휘 조사 논문", status: "done", createdAt: "2026-03-18 11:05",
      items: [
        { id: 201, title: "강원 영서·영동 방언 어휘 비교 연구", snippet: "영서와 영동 지역 방언의 음운·어휘 차이를 비교한 선행 연구 요약.", source: "riss.kr", savedToWorkspace: true },
        { id: 202, title: "국립국어원 방언 조사 지침 (2024)", snippet: "현지 조사 시 표준 질문지와 전사 표기 규칙 안내.", source: "korean.go.kr", savedToWorkspace: true },
      ],
    },
    {
      id: 102, mode: "url", query: "https://www.korean.go.kr/dialect/archive", status: "done", createdAt: "2026-03-25 09:40",
      items: [{ id: 203, title: "지역어 종합 정보 아카이브 목록", snippet: "전국 지역어 조사 자료의 공개 목록과 원문 링크 모음.", source: "korean.go.kr", savedToWorkspace: false }],
    },
  ],
};

const statusMeta: Record<JobStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "대기 중", color: "#7b82a8", bg: "#7b82a818" },
  running: { label: "수집 중", color: "#2563eb", bg: "#2563eb18" },
  done: { label: "완료", color: "#22c55e", bg: "#22c55e18" },
  failed: { label: "실패", color: "#ef4444", bg: "#ef444418" },
};

export default function DataCollector() {
  const { project } = useProject();
  const [jobsState, setJobsState] = useState<Record<string, Job[]>>(jobsByProject);
  const jobs = jobsState[project.id] || [];
  const [selectedJob, setSelectedJob] = useState<number | null>(jobs[0]?.id ?? null);
  const [mode, setMode] = useState<JobMode>("keyword");
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());

  useEffect(() => {
    setSelectedJob(jobsState[project.id]?.[0]?.id ?? null);
    setChecked(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const job = jobs.find((j) => j.id === selectedJob) || null;
  const locked = project.status === "done";

  function setProjectJobs(updater: (prev: Job[]) => Job[]) {
    setJobsState((prev) => ({ ...prev, [project.id]: updater(prev[project.id] || []) }));
  }

  function startJob() {
    if (!query.trim() || locked) return;
    const newJob: Job = { id: Date.now(), mode, query: query.trim(), status: "pending", createdAt: new Date().toISOString().slice(0, 16).replace("T", " "), items: [] };
    setProjectJobs((p) => [newJob, ...p]);
    setSelectedJob(newJob.id);
    setQuery("");
  }

  function toggleCheck(id: number) {
    setChecked((p) => {
      const next = new Set(p);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function saveChecked() {
    if (!job) return;
    setProjectJobs((prev) => prev.map((j) => (j.id !== job.id ? j : { ...j, items: j.items.map((it) => (checked.has(it.id) ? { ...it, savedToWorkspace: true } : it)) })));
    setChecked(new Set());
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          정보 수집 · {project.name}
        </div>
        <h1 className="text-2xl font-700">Research Collector</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          URL 스크래핑 또는 키워드 크롤링으로 자료를 모으고, 검토 후 워크스페이스에 저장하세요
        </p>
      </div>

      {/* New job form */}
      <div className="p-5 mb-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
        {locked ? (
          <div className="text-xs text-center py-2" style={{ color: "var(--muted-foreground)" }}>
            종료된 프로젝트에서는 새 수집 작업을 시작할 수 없습니다. 이전 수집 기록은 아래에서 확인할 수 있어요.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              {(["keyword", "url"] as JobMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="text-xs font-700 px-4 py-2 transition-all"
                  style={{ background: mode === m ? "var(--primary)" : "var(--muted)", color: mode === m ? "#fff" : "var(--muted-foreground)", borderRadius: "20px" }}
                >
                  {m === "keyword" ? "키워드 크롤링" : "URL 스크래핑"}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startJob()}
                placeholder={mode === "keyword" ? "예: 강화도 문화유산 등록문화재" : "예: https://www.cha.go.kr/..."}
                className="flex-1 text-sm px-3.5 py-2.5 border outline-none"
                style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
              />
              <button
                onClick={startJob}
                className="px-5 py-2.5 text-sm font-700 shrink-0 transition-all"
                style={{
                  background: query.trim() ? "var(--primary)" : "var(--muted)",
                  color: query.trim() ? "#fff" : "var(--muted-foreground)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: query.trim() ? "0 4px 12px rgba(37,99,235,0.3)" : "none",
                }}
              >
                수집 시작
              </button>
            </div>
            <p className="text-xs mt-2.5" style={{ color: "var(--muted-foreground)" }}>
              수집된 자료는 자동 저장되지 않으며, 검토 후 선택한 항목만 워크스페이스에 저장됩니다.
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* Job list */}
        <div className="col-span-2 flex flex-col gap-2.5">
          {jobs.map((j) => {
            const sm = statusMeta[j.status];
            const active = selectedJob === j.id;
            return (
              <button
                key={j.id}
                onClick={() => { setSelectedJob(j.id); setChecked(new Set()); }}
                className="p-4 text-left transition-all"
                style={{
                  background: active ? "var(--primary)" : "var(--card)",
                  borderRadius: "var(--radius)",
                  boxShadow: active ? "0 8px 24px rgba(37,99,235,0.25)" : "var(--shadow-card)",
                  color: active ? "#fff" : "var(--foreground)",
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-600 px-2 py-0.5" style={{ background: active ? "rgba(255,255,255,0.18)" : sm.bg, color: active ? "#fff" : sm.color, borderRadius: "20px" }}>
                    {sm.label}
                  </span>
                  <span
                    className="text-xs font-600 px-2 py-0.5"
                    style={{ background: active ? "rgba(255,255,255,0.18)" : "var(--muted)", color: active ? "rgba(255,255,255,0.85)" : "var(--muted-foreground)", borderRadius: "20px" }}
                  >
                    {j.mode === "keyword" ? "키워드" : "URL"}
                  </span>
                </div>
                <div className="text-sm font-600 truncate">{j.query}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs" style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{j.createdAt}</span>
                  <span className="text-xs" style={{ color: active ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)" }}>· {j.items.length}건 수집</span>
                </div>
              </button>
            );
          })}
          {jobs.length === 0 && (
            <div className="p-6 text-center text-xs border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}>
              수집 작업이 없습니다
            </div>
          )}
        </div>

        {/* Result panel */}
        <div className="col-span-3">
          {job ? (
            <div className="p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-600 px-2 py-0.5" style={{ background: statusMeta[job.status].bg, color: statusMeta[job.status].color, borderRadius: "20px" }}>
                  {statusMeta[job.status].label}
                </span>
                {checked.size > 0 && (
                  <button
                    onClick={saveChecked}
                    className="text-xs font-700 px-3 py-1.5 transition-all"
                    style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}
                  >
                    선택 {checked.size}건 워크스페이스에 저장 →
                  </button>
                )}
              </div>
              <h3 className="text-sm font-700 mt-2 mb-3 break-all">{job.query}</h3>

              {job.status === "failed" && (
                <div className="p-4 text-xs text-center" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "12px" }}>
                  수집에 실패했습니다. URL 접근이 제한되었거나 키워드 결과가 없을 수 있어요.
                </div>
              )}
              {job.status === "running" && job.items.length === 0 && (
                <div className="p-4 text-xs text-center" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "12px" }}>
                  수집 중입니다… 결과가 도착하는 대로 아래에 표시됩니다.
                </div>
              )}

              <div className="flex flex-col gap-2.5">
                {job.items.map((it) => (
                  <div key={it.id} className="flex items-start gap-3 p-3.5" style={{ background: "var(--muted)", borderRadius: "12px" }}>
                    {!it.savedToWorkspace ? (
                      <button
                        onClick={() => !locked && toggleCheck(it.id)}
                        className="w-5 h-5 mt-0.5 flex items-center justify-center shrink-0 text-xs font-700 transition-all"
                        style={{
                          background: checked.has(it.id) ? "var(--primary)" : "var(--card)",
                          color: "#fff",
                          border: checked.has(it.id) ? "none" : "2px solid var(--border)",
                          borderRadius: "6px",
                          cursor: locked ? "default" : "pointer",
                        }}
                      >
                        {checked.has(it.id) ? "✓" : ""}
                      </button>
                    ) : (
                      <div className="w-5 h-5 mt-0.5 flex items-center justify-center shrink-0 text-xs" style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "6px" }}>✓</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-600 leading-snug">{it.title}</div>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{it.snippet}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs font-500" style={{ color: "var(--primary)", fontFamily: "var(--font-jetbrains)" }}>{it.source}</span>
                        {it.savedToWorkspace && (
                          <span className="text-xs font-600 px-1.5 py-0.5" style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "3px" }}>워크스페이스 저장됨</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="p-8 border text-center h-full flex flex-col items-center justify-center"
              style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
            >
              작업을 선택하면 수집 결과를 확인할 수 있어요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
