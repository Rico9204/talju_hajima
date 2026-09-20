import { useState } from "react";
import type { NewProjectInput } from "../context/ProjectContext";

type PeriodMode = "text" | "calendar";

export default function CreateProjectModal({
  onCancel, onCreate,
}: { onCancel: () => void; onCreate: (input: NewProjectInput, recruitMessage?: string) => void }) {
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("text");
  const [periodText, setPeriodText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [recruit, setRecruit] = useState(false);
  const [recruitMessage, setRecruitMessage] = useState("");

  const periodTextTrimmed = periodText.trim();
  const periodTextInvalid = periodMode === "text" && periodTextTrimmed.length > 0 && !/\d/.test(periodTextTrimmed);
  const canSubmit = name.trim().length > 0 && !periodTextInvalid;

  function formatDateKR(dateStr: string): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${y}년 ${m}월 ${d}일`;
  }

  function resolvedPeriod(): string {
    if (periodMode === "calendar") {
      if (startDate && endDate) return `${formatDateKR(startDate)} ~ ${formatDateKR(endDate)}`;
      if (startDate) return `${formatDateKR(startDate)} 시작`;
      return "";
    }
    return periodText;
  }

  function submit() {
    if (!canSubmit) return;
    const useDates = periodMode === "calendar" && startDate && endDate;
    onCreate(
      {
        name,
        org,
        period: resolvedPeriod(),
        startDate: useDates ? startDate : undefined,
        endDate: useDates ? endDate : undefined,
      },
      recruit ? recruitMessage.trim() || "팀원을 모집합니다." : undefined,
    );
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="w-[26rem] max-w-[92vw] p-6"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="w-10 h-10 flex items-center justify-center text-lg font-700 mb-3"
          style={{ background: "#2563eb18", color: "var(--primary)", borderRadius: "12px" }}
        >
          +
        </div>
        <h3 className="font-700 mb-1">새 프로젝트 만들기</h3>
        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
          새 팀플 프로젝트를 시작하면 팀 관리·채팅·과제·워크스페이스·동료 평가가 이 프로젝트 전용으로 분리되고, 만든 사람이 자동으로 팀장이 됩니다.
        </p>

        <label className="text-xs font-600 block mb-1.5">
          프로젝트명 <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 캡스톤 디자인 — 스마트팜 센서"
          className="w-full text-sm px-3 py-2.5 outline-none mb-3"
          style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
        />

        <label className="text-xs font-600 block mb-1.5">소속 · 분반</label>
        <input
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          placeholder="예: 컴퓨터공학과 · 4분반"
          className="w-full text-sm px-3 py-2.5 outline-none mb-3"
          style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
        />

        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-600 block">진행 기간</label>
          <div className="flex gap-1 p-0.5" style={{ background: "var(--muted)", borderRadius: "20px" }}>
            {(["text", "calendar"] as PeriodMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPeriodMode(m)}
                className="text-xs font-600 px-2.5 py-1 transition-all"
                style={{
                  background: periodMode === m ? "var(--card)" : "transparent",
                  color: periodMode === m ? "var(--primary)" : "var(--muted-foreground)",
                  borderRadius: "16px",
                  boxShadow: periodMode === m ? "var(--shadow-card)" : "none",
                }}
              >
                {m === "text" ? "직접 입력" : "달력 선택"}
              </button>
            ))}
          </div>
        </div>

        {periodMode === "text" ? (
          <>
            <input
              value={periodText}
              onChange={(e) => setPeriodText(e.target.value)}
              placeholder="예: 2026-2학기 · 9월 ~ 12월"
              className="w-full text-sm px-3 py-2.5 outline-none"
              style={{
                border: `2px solid ${periodTextInvalid ? "#ef4444" : "var(--border)"}`,
                borderRadius: "10px",
                background: "var(--muted)",
                fontFamily: "var(--font-outfit)",
              }}
            />
            <p className="text-xs mt-1 mb-5" style={{ color: periodTextInvalid ? "#ef4444" : "var(--muted-foreground)" }}>
              {periodTextInvalid ? "연도·월 등 숫자가 포함된 기간을 입력해주세요." : "연도나 월 등 숫자를 포함해 입력해주세요."}
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-2 mb-5">
            <div className="flex items-center gap-2">
              <span className="text-xs w-8 shrink-0" style={{ color: "var(--muted-foreground)" }}>시작</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 min-w-0 text-sm px-3 py-2.5 outline-none"
                style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-jetbrains)" }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs w-8 shrink-0" style={{ color: "var(--muted-foreground)" }}>종료</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 min-w-0 text-sm px-3 py-2.5 outline-none"
                style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-jetbrains)" }}
              />
            </div>
            {startDate && endDate && (() => {
              const days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000);
              return (
                <p className="text-xs" style={{ color: days < 14 ? "#f59e0b" : "var(--muted-foreground)" }}>
                  {days >= 0 ? `총 ${days}일` : "종료일이 시작일보다 빠릅니다"}
                  {days >= 0 && days < 14 && " · 2주 미만이라 중간 점검이 자동으로 생략됩니다"}
                </p>
              );
            })()}
          </div>
        )}

        <label className="flex items-center gap-2 text-xs font-600 mb-2 cursor-pointer">
          <input type="checkbox" checked={recruit} onChange={(e) => setRecruit(e.target.checked)} />
          만들면서 게시판에 팀원 모집 공고도 올리기
        </label>
        {recruit && (
          <textarea
            value={recruitMessage}
            onChange={(e) => setRecruitMessage(e.target.value)}
            placeholder="모집 공고 내용 (예: 어떤 역할이 몇 명 필요한지)"
            rows={2}
            className="w-full text-sm px-3 py-2.5 outline-none mb-3 resize-none"
            style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
          />
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-600"
            style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
          >
            취소
          </button>
          <button
            onClick={submit}
            className="flex-1 py-2.5 text-sm font-700 transition-all"
            style={{
              background: canSubmit ? "var(--primary)" : "var(--border)",
              color: canSubmit ? "#fff" : "var(--muted-foreground)",
              borderRadius: "40px",
              boxShadow: canSubmit ? "0 4px 12px rgba(37,99,235,0.3)" : "none",
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            프로젝트 만들기
          </button>
        </div>
      </div>
    </div>
  );
}
