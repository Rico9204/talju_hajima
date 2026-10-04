import { useEffect, useState } from "react";
import { dataRepository } from "../api";
import { BOARD_REPORT_REASONS, reportReasonLabel } from "../lib/boardReport";
import type { BoardPost, BoardPostReport, BoardReportReason } from "../api/types";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : (e as { message?: string })?.message || "처리하지 못했습니다.";
}

// 신고 사유 선택 창(게시글·댓글 신고가 함께 쓴다). 접수되면 onDone.
function ReportDialog({ post, title, note, initialDetail = "", onClose, onDone }: {
  post: BoardPost; title: string; note?: string; initialDetail?: string; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState<BoardReportReason>("spam");
  const [detail, setDetail] = useState(initialDetail.slice(0, 500));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await dataRepository.reportBoardPost(post.id, reason, detail.trim());
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,18,53,0.48)" }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
          <section role="dialog" aria-label={title} className="w-[min(92vw,440px)] p-5 space-y-4 border" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--foreground)" }}>
            <h2 className="text-base font-800">{title}</h2>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>신고 내용은 관리자만 볼 수 있고, 작성자에게는 알려지지 않아요.{note && <><br />{note}</>}</p>
            <div className="space-y-2">
              {BOARD_REPORT_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="report-reason" checked={reason === r.value} onChange={() => setReason(r.value)} />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="자세한 내용을 적어 주세요 (선택, 500자)"
              className="w-full text-sm p-3 outline-none resize-none"
              style={{ background: "var(--muted)", borderRadius: "12px" }}
            />
            {error && <p role="alert" className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={onClose} className="text-xs font-700 px-4 py-2" style={{ background: "var(--muted)", borderRadius: "20px" }}>취소</button>
              <button type="button" disabled={busy} onClick={() => void submit()} className="text-xs font-700 px-4 py-2 disabled:opacity-50" style={{ background: "#ef4444", color: "#fff", borderRadius: "20px" }}>{busy ? "접수 중…" : "신고하기"}</button>
            </div>
          </section>
        </div>
  );
}

// 게시글 신고 버튼 + 사유 선택 창. 본인 글이 아닌 게시글에만 보인다.
export function PostReportButton({ post, onReported }: { post: BoardPost; onReported: () => void }) {
  const [open, setOpen] = useState(false);
  const done = post.reportedByMe ?? false;
  return (
    <>
      <button
        type="button"
        disabled={done}
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-5 py-2.5 text-xs font-700 transition-all disabled:opacity-60"
        style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "20px", border: "1px solid transparent" }}
      >
        {done ? "🚩 신고함" : "🚩 신고"}
      </button>
      {open && <ReportDialog post={post} title="게시글 신고" onClose={() => setOpen(false)} onDone={() => { setOpen(false); onReported(); }} />}
    </>
  );
}

// 댓글·대댓글 신고: 댓글만 따로 신고하는 기록이 아직 없어서, 이 게시글의 신고로 접수하고 신고한 댓글(작성자·내용)을
// 자세한 내용에 적어 관리자가 어느 댓글인지 알 수 있게 한다. 한 게시글에는 한 사람이 한 번만 신고할 수 있다.
// (예전에는 "신고가 접수되었습니다" 알림만 띄우고 아무것도 보내지 않았다.)
export function CommentReportButton({ post, author, text, small = false, onReported }: { post: BoardPost; author: string; text: string; small?: boolean; onReported: () => void }) {
  const [open, setOpen] = useState(false);
  const done = post.reportedByMe ?? false;
  return (
    <>
      <button
        type="button"
        disabled={done}
        onClick={() => setOpen(true)}
        className={`${small ? "text-[10px] px-1.5" : "text-[11px] px-2"} font-600 py-0.5 transition-all hover:bg-red-500/10 disabled:opacity-50`}
        style={{ color: "#ef4444", borderRadius: "6px" }}
        title={done ? "이 게시글은 이미 신고했어요" : small ? "대댓글 신고하기" : "댓글 신고하기"}
      >
        {done ? "🚩 신고함" : "🚨 신고"}
      </button>
      {open && (
        <ReportDialog post={post} title={small ? "대댓글 신고" : "댓글 신고"}
          note="이 게시글의 신고로 접수되고, 아래에 신고한 댓글이 적혀 관리자에게 전달돼요. 한 게시글은 한 번만 신고할 수 있어요."
          initialDetail={`[${small ? "대댓글" : "댓글"}] ${author}: ${text.replace(/\s+/g, " ").slice(0, 300)}\n`}
          onClose={() => setOpen(false)} onDone={() => { setOpen(false); onReported(); }} />
      )}
    </>
  );
}

// 운영자용: 이 게시글에 들어온 신고 목록과 처리(처리 완료/기각).
export function PostReportList({ postId }: { postId: number }) {
  const [reports, setReports] = useState<BoardPostReport[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    try {
      setReports(await dataRepository.listBoardPostReports(postId));
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => { void load(); }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function review(id: number, status: "resolved" | "dismissed") {
    setBusyId(id);
    setError("");
    try {
      await dataRepository.reviewBoardReport(id, status);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  if (!reports || reports.length === 0) return error ? <p role="alert" className="text-xs" style={{ color: "#ef4444" }}>{error}</p> : null;
  const open = reports.filter((r) => r.status === "open").length;
  const statusText = { open: "미처리", resolved: "처리 완료", dismissed: "기각" } as const;
  return (
    <section className="p-4 space-y-3 border" style={{ background: "#ef444410", borderColor: "#ef444440", borderRadius: "var(--radius)" }}>
      <h2 className="text-sm font-800" style={{ color: "#ef4444" }}>🚩 신고 {reports.length}건 (미처리 {open}건) — 운영자에게만 보여요</h2>
      {error && <p role="alert" className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}
      <ul className="space-y-2">
        {reports.map((r) => (
          <li key={r.id} className="p-3 text-xs space-y-1.5" style={{ background: "var(--card)", borderRadius: "12px" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-700">{reportReasonLabel(r.reason)}</span>
              <span style={{ color: "var(--muted-foreground)" }}>{r.reporterName} · {new Date(r.createdAt).toLocaleString("ko-KR")}</span>
              <span className="ml-auto font-700">{statusText[r.status]}</span>
            </div>
            {r.detail && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.detail}</p>}
            {r.status === "open" && (
              <div className="flex gap-2">
                <button type="button" disabled={busyId === r.id} onClick={() => void review(r.id, "resolved")} className="font-700 px-3 py-1.5 disabled:opacity-50" style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}>처리 완료</button>
                <button type="button" disabled={busyId === r.id} onClick={() => void review(r.id, "dismissed")} className="font-700 px-3 py-1.5 disabled:opacity-50" style={{ background: "var(--muted)", borderRadius: "20px" }}>기각</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
