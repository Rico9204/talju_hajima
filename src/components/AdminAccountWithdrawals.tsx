import { useCallback, useEffect, useState } from "react";
import { dataRepository } from "../api";
import type { AccountWithdrawalRecord } from "../api/types";

// 운영자 창의 "계정 탈퇴·복구": 왼쪽은 탈퇴를 신청한 계정, 오른쪽은 복구를 신청한 계정.
// 이 목록에는 유예 기간(탈퇴 신청 후 14일) 안의 계정만 보인다. 유예 기간이 지나면 서버가 자동으로 삭제하고, "탈퇴 승인"을 누르면 기간이 남아 있어도 바로 삭제한다.
// 복구를 신청한 계정은 탈퇴 신청 목록에서 빠지고 오른쪽 복구 신청 목록으로 옮겨 간다.
const DAY_MS = 86_400_000;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS));

export default function AdminAccountWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<AccountWithdrawalRecord[]>([]);
  const [recoveries, setRecoveries] = useState<AccountWithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const lists = await dataRepository.listAccountWithdrawals();
      setWithdrawals(lists.withdrawals);
      setRecoveries(lists.recoveries);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function act(id: string, run: () => Promise<void>, done: string) {
    setBusyId(id); setError(""); setNotice("");
    try { await run(); await refresh(); setNotice(done); } // 목록이 새로 바뀐 뒤에 완료 안내를 보여 준다
    catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했습니다."); }
    finally { setBusyId(null); }
  }

  function approveWithdrawal(rec: AccountWithdrawalRecord) {
    if (!window.confirm(`‘${rec.displayName || rec.email}’(${rec.email}) 계정의 정보를 지금 바로 삭제할까요?\n\n유예 기간이 아직 남아 있어도 바로 지워져요. 프로필·로그인 정보·프로필 사진이 삭제되고 되돌릴 수 없어요.`)) return;
    void act(rec.userId, () => dataRepository.approveAccountWithdrawal(rec.userId), "탈퇴를 승인해 계정 정보를 삭제했어요.");
  }

  const card = { background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" } as const;
  const muted = { color: "var(--muted-foreground)" } as const;
  const empty = (text: string) => (
    <div className="p-5 border text-center text-sm" style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", ...muted }}>{text}</div>
  );

  return (
    <section className="mb-8" aria-label="계정 탈퇴·복구 관리">
      <div className="mb-4">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ ...muted, fontFamily: "var(--font-jetbrains)" }}>운영자</div>
        <h2 className="text-xl font-700">계정 탈퇴·복구 관리</h2>
        <p className="text-sm mt-1" style={muted}>탈퇴를 신청한 계정은 유예 기간(14일) 동안 여기에 보이고, 기간이 지나면 자동으로 삭제돼요. ‘탈퇴 승인’을 누르면 기간이 남아 있어도 바로 삭제돼요.</p>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="mb-3 text-xs" style={{ color: "#16a34a" }}>{notice}</p>}
      {loading ? <div className="text-sm py-6 text-center" style={muted}>불러오는 중…</div> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div aria-label="탈퇴 신청 목록">
            <h3 className="text-sm font-700 mb-2">탈퇴 신청 ({withdrawals.length})</h3>
            {withdrawals.length === 0 ? empty("탈퇴를 신청한 계정이 없어요.") : (
              <ul className="flex flex-col gap-3">
                {withdrawals.map((rec) => (
                  <li key={rec.userId} className="p-4" style={card}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-700 break-words">{rec.displayName || "(이름 없음)"}</div>
                        <div className="text-xs mt-0.5 break-all" style={muted}>{rec.email}</div>
                      </div>
                      <span className="text-[11px] font-700 px-2 py-0.5 shrink-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}>
                        {`유예 중 · ${daysLeft(rec.purgeAt)}일 후 자동 삭제`}
                      </span>
                    </div>
                    <div className="text-xs mt-2" style={muted}>신청일 {formatDate(rec.requestedAt)} · 자동 삭제일 {formatDate(rec.purgeAt)}</div>
                    <div className="text-xs mt-1 break-words" style={rec.reason ? undefined : muted}>사유: {rec.reason || "입력하지 않음"}</div>
                    {rec.recoveryRejected && <div className="text-[11px] mt-1" style={{ color: "#b45309" }}>복구 신청이 거절된 계정</div>}
                    <button type="button" onClick={() => approveWithdrawal(rec)} disabled={busyId === rec.userId} title="유예 기간이 남아 있어도 계정 정보를 바로 삭제합니다"
                      className="mt-3 text-xs font-700 px-3.5 py-2" style={{ background: "#ef4444", color: "#fff", borderRadius: "40px", opacity: busyId === rec.userId ? 0.6 : 1 }}>
                      {busyId === rec.userId ? "처리 중…" : "탈퇴 승인 (바로 삭제)"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div aria-label="복구 신청 목록">
            <h3 className="text-sm font-700 mb-2">복구 신청 ({recoveries.length})</h3>
            {recoveries.length === 0 ? empty("복구를 신청한 계정이 없어요.") : (
              <ul className="flex flex-col gap-3">
                {recoveries.map((rec) => (
                  <li key={rec.userId} className="p-4" style={card}>
                    <div className="text-sm font-700 break-words">{rec.displayName || "(이름 없음)"}</div>
                    <div className="text-xs mt-0.5 break-all" style={muted}>{rec.email}</div>
                    <div className="text-xs mt-2" style={muted}>탈퇴 신청일 {formatDate(rec.requestedAt)} · 복구 신청일 {rec.recoveryRequestedAt ? formatDate(rec.recoveryRequestedAt) : "-"}</div>
                    <div className="text-xs mt-1 break-words" style={rec.reason ? undefined : muted}>탈퇴 사유: {rec.reason || "입력하지 않음"}</div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button type="button" onClick={() => void act(rec.userId, () => dataRepository.approveAccountRecovery(rec.userId), "복구를 승인했어요. 다시 로그인할 수 있어요.")} disabled={busyId === rec.userId}
                        className="text-xs font-700 px-3.5 py-2" style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px", opacity: busyId === rec.userId ? 0.6 : 1 }}>복구 승인</button>
                      <button type="button" onClick={() => { if (window.confirm("복구 신청을 거절할까요? 이 계정은 탈퇴 신청 목록으로 돌아가고, 다시 복구를 신청할 수 없어요.")) void act(rec.userId, () => dataRepository.rejectAccountRecovery(rec.userId), "복구 신청을 거절했어요."); }} disabled={busyId === rec.userId}
                        className="text-xs font-600 px-3.5 py-2" style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "40px", opacity: busyId === rec.userId ? 0.6 : 1 }}>거절</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
