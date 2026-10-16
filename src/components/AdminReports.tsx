import { useEffect, useMemo, useState } from "react";
import { dataRepository } from "../api";
import { BOARD_REPORT_REASONS, htmlToPreview, reportReasonLabel } from "../lib/boardReport";
import type { BoardPostReport, BoardReportReason } from "../api/types";

type StatusFilter = "open" | "resolved" | "dismissed" | "all";
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "미처리" },
  { value: "resolved", label: "처리 완료" },
  { value: "dismissed", label: "기각" },
  { value: "all", label: "전체" },
];
const STATUS_TEXT = { open: "미처리", resolved: "처리 완료", dismissed: "기각" } as const;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : (e as { message?: string })?.message || "처리하지 못했습니다.";
}

// 관리자 신고 관리: 상태·사유(구분)별로 나눠 보고 처리한다. 게시글이 삭제돼도 신고 기록은 남는다.
export default function AdminReports({ onOpenCountChange }: { onOpenCountChange?: (n: number) => void }) {
  const [reports, setReports] = useState<BoardPostReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [reason, setReason] = useState<BoardReportReason | "all">("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BoardPostReport | null>(null);
  // 본문 전체 보기: 게시글 id별로 불러온 글자·이미지(펼친 게시글만)
  const [bodies, setBodies] = useState<Record<number, { text: string; images: string[] } | "loading" | "gone" | "error">>({});

  async function toggleBody(postId: number) {
    if (bodies[postId] && bodies[postId] !== "error") {
      setBodies((prev) => { const next = { ...prev }; delete next[postId]; return next; });
      return;
    }
    setBodies((prev) => ({ ...prev, [postId]: "loading" }));
    try {
      const content = await dataRepository.getBoardPostContent(postId);
      setBodies((prev) => ({ ...prev, [postId]: content === null ? "gone" : htmlToPreview(content) }));
    } catch {
      setBodies((prev) => ({ ...prev, [postId]: "error" }));
    }
  }

  async function load() {
    setError("");
    try {
      const list = await dataRepository.listAllBoardReports();
      setReports(list);
      onOpenCountChange?.(list.filter((r) => r.status === "open").length);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byStatus = useMemo(() => reports.filter((r) => status === "all" || r.status === status), [reports, status]);
  const reasonCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of byStatus) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
    return counts;
  }, [byStatus]);
  const shown = byStatus.filter((r) => reason === "all" || r.reason === reason);
  // 같은 게시글에 여러 건이면 "이 게시글 신고 N건"으로 알려 준다.
  const perPost = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of reports) if (r.postId !== null) m.set(r.postId, (m.get(r.postId) ?? 0) + 1);
    return m;
  }, [reports]);

  async function review(id: number, next: "resolved" | "dismissed") {
    setBusyId(id);
    setError("");
    try {
      await dataRepository.reviewBoardReport(id, next);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  // 게시글 삭제: 같은 게시글의 미처리 신고를 모두 "처리 완료"로 남기고 삭제한다(신고 기록은 유지).
  async function deletePost() {
    if (!deleteTarget || deleteTarget.postId === null) return;
    setBusyId(deleteTarget.id);
    setError("");
    try {
      for (const r of reports.filter((x) => x.postId === deleteTarget.postId && x.status === "open")) {
        await dataRepository.reviewBoardReport(r.id, "resolved");
      }
      await dataRepository.deleteBoardPost(deleteTarget.postId);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  const chip = (active: boolean) => ({
    background: active ? "var(--primary)" : "var(--muted)",
    color: active ? "#fff" : "var(--foreground)",
    borderRadius: "20px",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="처리 상태">
        {STATUS_TABS.map((t) => (
          <button key={t.value} role="tab" aria-selected={status === t.value} onClick={() => setStatus(t.value)} className="text-xs font-700 px-3.5 py-2" style={chip(status === t.value)}>
            {t.label} {t.value === "all" ? reports.length : reports.filter((r) => r.status === t.value).length}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="신고 구분">
        <button onClick={() => setReason("all")} className="text-xs font-700 px-3 py-1.5" style={chip(reason === "all")}>전체 구분 {byStatus.length}</button>
        {BOARD_REPORT_REASONS.map((r) => (
          <button key={r.value} onClick={() => setReason(r.value)} className="text-xs font-700 px-3 py-1.5" style={chip(reason === r.value)}>
            {r.label} {reasonCounts[r.value] ?? 0}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm" style={{ color: "#ef4444" }}>{error}</p>}
      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm p-6 text-center" style={{ color: "var(--muted-foreground)", background: "var(--card)", borderRadius: "var(--radius)" }}>해당하는 신고가 없어요.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.id} className="p-4 space-y-2.5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-800 px-2.5 py-1" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}>{reportReasonLabel(r.reason)}</span>
                <span className="font-700">{STATUS_TEXT[r.status]}</span>
                {r.postId !== null && (perPost.get(r.postId) ?? 0) > 1 && <span style={{ color: "#f59e0b" }}>이 게시글 신고 {perPost.get(r.postId)}건</span>}
                <span className="ml-auto" style={{ color: "var(--muted-foreground)" }}>{new Date(r.createdAt).toLocaleString("ko-KR")}</span>
              </div>
              <div>
                <div className="text-sm font-700 break-words">
                  {r.postTitle || "(제목 없음)"} {r.postId === null && <span className="text-xs font-600" style={{ color: "#ef4444" }}>· 삭제된 게시글</span>}
                </div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>작성자 {r.postAuthorName}</div>
                {(() => {
                  const preview = htmlToPreview(r.postExcerpt);
                  const body = r.postId !== null ? bodies[r.postId] : undefined;
                  return (
                    <>
                      {preview.text && !body && <p className="text-xs mt-1 line-clamp-3" style={{ color: "var(--muted-foreground)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{preview.text}</p>}
                      {r.postId !== null && (
                        <button type="button" onClick={() => void toggleBody(r.postId as number)} className="text-xs font-700 mt-1.5 underline underline-offset-2" style={{ color: "var(--primary)" }}>
                          {body && body !== "error" ? "본문 접기" : "본문 전체 보기"}
                        </button>
                      )}
                      {body === "loading" && <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>}
                      {body === "error" && <p role="alert" className="text-xs mt-1" style={{ color: "#ef4444" }}>본문을 불러오지 못했습니다.</p>}
                      {body === "gone" && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>삭제된 게시글이에요.</p>}
                      {body && typeof body === "object" && (
                        <div className="mt-2 p-3 space-y-2 max-h-80 overflow-y-auto text-sm" style={{ background: "var(--muted)", borderRadius: "12px" }}>
                          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{body.text || "(글 내용 없음)"}</p>
                          {body.images.map((src, i) => (
                            <img key={i} src={src} alt={`본문 이미지 ${i + 1}`} loading="lazy" className="max-w-full rounded-lg" style={{ maxHeight: 240 }} />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="text-xs p-3" style={{ background: "var(--muted)", borderRadius: "12px" }}>
                <div className="font-700 mb-0.5">신고 메시지 · {r.reporterName}</div>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.detail || "(상세 내용 없음)"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status === "open" && (
                  <>
                    <button disabled={busyId === r.id} onClick={() => void review(r.id, "resolved")} className="text-xs font-700 px-3.5 py-2 disabled:opacity-50" style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}>처리 완료</button>
                    <button disabled={busyId === r.id} onClick={() => void review(r.id, "dismissed")} className="text-xs font-700 px-3.5 py-2 disabled:opacity-50" style={{ background: "var(--muted)", borderRadius: "20px" }}>기각</button>
                  </>
                )}
                {r.postId !== null && (
                  <button disabled={busyId === r.id} onClick={() => setDeleteTarget(r)} className="text-xs font-700 px-3.5 py-2 disabled:opacity-50" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}>게시글 삭제</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,18,53,0.48)" }}>
          <section role="alertdialog" aria-label="게시글 삭제 확인" className="w-[min(92vw,420px)] p-5 space-y-3 border" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--foreground)" }}>
            <h2 className="text-base font-800">게시글을 삭제할까요?</h2>
            <p className="text-sm break-words">"{deleteTarget.postTitle}" 글이 영구 삭제되고, 이 글의 미처리 신고는 처리 완료로 기록돼요. 신고 기록은 남습니다.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="text-xs font-700 px-4 py-2" style={{ background: "var(--muted)", borderRadius: "20px" }}>취소</button>
              <button onClick={() => void deletePost()} disabled={busyId !== null} className="text-xs font-700 px-4 py-2 disabled:opacity-50" style={{ background: "#ef4444", color: "#fff", borderRadius: "20px" }}>삭제</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
