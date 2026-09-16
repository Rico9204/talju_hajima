import { useEffect, useState } from "react";
import type { NewProjectInput } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import { dataRepository } from "../api";
import type { AdminProfileSummary } from "../api/types";

export default function CreateProjectModal({
  onCancel, onCreate,
}: { onCancel: () => void; onCreate: (input: NewProjectInput) => void }) {
  const { isAdmin } = useAuth();
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [adminQuery, setAdminQuery] = useState("");
  const [adminResults, setAdminResults] = useState<AdminProfileSummary[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminProfileSummary | null>(null);
  const [searchingAdmins, setSearchingAdmins] = useState(false);

  const datesValid = !!startDate && !!endDate && new Date(endDate) >= new Date(startDate);
  const canSubmit = name.trim().length > 0 && datesValid && (isAdmin || !!selectedAdmin);

  useEffect(() => {
    if (isAdmin || selectedAdmin) return;
    const trimmed = adminQuery.trim();
    if (!trimmed) {
      setAdminResults([]);
      return;
    }
    let cancelled = false;
    setSearchingAdmins(true);
    const timer = setTimeout(() => {
      dataRepository
        .searchAdmins(trimmed)
        .then((results) => {
          if (!cancelled) setAdminResults(results);
        })
        .finally(() => {
          if (!cancelled) setSearchingAdmins(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [adminQuery, isAdmin, selectedAdmin]);

  function formatDateKR(dateStr: string): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${y}년 ${m}월 ${d}일`;
  }

  function submit() {
    if (!canSubmit) return;
    onCreate({
      name,
      org,
      period: `${formatDateKR(startDate)} ~ ${formatDateKR(endDate)}`,
      startDate,
      endDate,
      requestedAdminId: selectedAdmin?.id,
    });
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

        <label className="text-xs font-600 block mb-1.5">
          진행 기간 <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <div className="flex flex-col gap-2 mb-2">
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
              <p className="text-xs" style={{ color: days < 0 ? "#ef4444" : days < 14 ? "#f59e0b" : "var(--muted-foreground)" }}>
                {days >= 0 ? `총 ${days}일` : "종료일이 시작일보다 빠릅니다"}
                {days >= 0 && days < 14 && " · 2주 미만이라 중간 점검이 자동으로 생략됩니다"}
              </p>
            );
          })()}
        </div>

        {!isAdmin && (
          <div className="mb-5">
            <label className="text-xs font-600 block mb-1.5">
              승인 요청 관리자 <span style={{ color: "#ef4444" }}>*</span>
            </label>
            {selectedAdmin ? (
              <div
                className="flex items-center justify-between gap-2 px-3 py-2.5"
                style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-700 truncate">{selectedAdmin.displayName}</div>
                  <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                    {selectedAdmin.org || selectedAdmin.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedAdmin(null); setAdminQuery(""); }}
                  className="text-xs font-600 px-2 py-1 shrink-0"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  변경
                </button>
              </div>
            ) : (
              <>
                <input
                  value={adminQuery}
                  onChange={(e) => setAdminQuery(e.target.value)}
                  placeholder="관리자 소속·이름·이메일로 검색"
                  className="w-full text-sm px-3 py-2.5 outline-none"
                  style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
                />
                {adminQuery.trim() && (
                  <div className="mt-1.5 max-h-40 overflow-y-auto" style={{ border: "1px solid var(--border)", borderRadius: "10px" }}>
                    {searchingAdmins ? (
                      <div className="text-xs px-3 py-2" style={{ color: "var(--muted-foreground)" }}>검색 중…</div>
                    ) : adminResults.length === 0 ? (
                      <div className="text-xs px-3 py-2" style={{ color: "var(--muted-foreground)" }}>일치하는 관리자가 없어요.</div>
                    ) : (
                      adminResults.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => { setSelectedAdmin(a); setAdminResults([]); }}
                          className="w-full text-left px-3 py-2 transition-all"
                          style={{ background: "var(--card)" }}
                        >
                          <div className="text-xs font-700">{a.displayName}</div>
                          <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{a.org || a.email}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
            <p className="text-xs mt-1.5" style={{ color: "var(--muted-foreground)" }}>
              프로젝트는 "승인 대기" 상태로 만들어지고, 지정한 관리자가 승인해야 팀 관리·채팅·과제 등을 사용할 수 있어요.
            </p>
          </div>
        )}

        <div className="flex gap-2 mt-5">
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
