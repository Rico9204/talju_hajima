import { useEffect, useState } from "react";
import { dataRepository } from "../api";
import { useAuth } from "../context/AuthContext";

// "계정 정보" 창: 아이디(이메일) 확인, 비밀번호 변경, 회원 탈퇴.
// 탈퇴는 아이디와 비밀번호를 다시 입력해야 신청되고(사유는 선택), 참여한 프로젝트가 있으면 잠긴다.
// 신청해도 14일 동안은 계정 정보가 보관되고 그 안에 복구를 신청할 수 있다(로그인 화면에서). 14일이 지난 뒤 운영자가 승인하면 삭제된다.
export const WITHDRAWN_NOTICE_KEY = "talju-withdrawn-notice";

const inputStyle = { background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--foreground)" } as const;
const labelStyle = { color: "var(--muted-foreground)" } as const;

export default function AccountInfoModal({ onClose }: { onClose: () => void }) {
  const { user, updatePassword, withdrawAccount, signOut } = useAuth();
  const email = user?.email ?? "";
  const displayName = String((user?.user_metadata as { display_name?: unknown } | undefined)?.display_name ?? "");

  // ── 비밀번호 변경 ──
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwNotice, setPwNotice] = useState("");
  const [changing, setChanging] = useState(false);
  async function submitPasswordChange() {
    if (!pw.current) return setPwNotice("현재 비밀번호를 입력해 주세요.");
    if (pw.current === pw.next) return setPwNotice("새 비밀번호는 기존 비밀번호와 다르게 설정해야 합니다.");
    if (pw.next.length < 6) return setPwNotice("새 비밀번호는 6자 이상이어야 합니다.");
    if (pw.next !== pw.confirm) return setPwNotice("새 비밀번호와 확인이 일치하지 않습니다.");
    setChanging(true);
    const result = await updatePassword(pw.current, pw.next);
    setChanging(false);
    if (result.error) return setPwNotice(result.error);
    setPw({ current: "", next: "", confirm: "" });
    setPwNotice("비밀번호가 변경되었습니다.");
  }

  // ── 회원 탈퇴 ──
  // 참여한 프로젝트가 있으면 잠근다(서버도 같은 규칙으로 거절한다). 프로젝트 이름은 내 프로젝트 목록에서 찾는다.
  const [myProjectIds, setMyProjectIds] = useState<string[] | null>(null);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;
    dataRepository.listMyProjectIds().then((list) => { if (active) setMyProjectIds(list); }).catch(() => { if (active) setMyProjectIds([]); });
    dataRepository.listProjects().then((list) => { if (active) setProjectNames(new Map(list.map((p) => [p.id, p.name]))); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const joined = (myProjectIds ?? []).map((id) => projectNames.get(id) ?? "프로젝트");
  const locked = myProjectIds !== null && myProjectIds.length > 0;

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [idInput, setIdInput] = useState("");
  const [pwInput, setPwInput] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const canWithdraw = !locked && myProjectIds !== null && idInput.trim() !== "" && pwInput !== "" && !withdrawing;

  async function submitWithdraw() {
    setWithdrawError("");
    if (idInput.trim().toLowerCase() !== email.toLowerCase()) return setWithdrawError("아이디(이메일)가 현재 로그인한 계정과 다릅니다.");
    if (!window.confirm("정말 탈퇴를 신청할까요?\n\n신청하면 바로 로그아웃되고 로그인할 수 없어요. 14일 동안은 계정 정보가 보관되며 그 안에 복구를 신청할 수 있고, 그 뒤에는 운영자 승인으로 정보가 삭제돼요.")) return;
    setWithdrawing(true);
    const result = await withdrawAccount(idInput.trim(), pwInput, reason);
    setWithdrawing(false);
    if (result.error) return setWithdrawError(result.error);
    try { sessionStorage.setItem(WITHDRAWN_NOTICE_KEY, "1"); } catch { /* 안내 문구만 못 보일 뿐 탈퇴는 이미 접수됨 */ }
    await signOut(); // 로그인 화면으로 돌아가며 접수 안내를 보여 준다
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(15,18,53,0.42)", backdropFilter: "blur(4px)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="account-info-title" className="w-[460px] max-w-full max-h-[90vh] overflow-y-auto p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.22)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 id="account-info-title" className="text-lg font-700">계정 정보</h3>
          <button type="button" onClick={onClose} aria-label="계정 정보 닫기" className="w-8 h-8 flex items-center justify-center text-lg" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}>×</button>
        </div>

        <section aria-label="아이디" className="mb-5">
          <div className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <span className="text-xs font-600 pt-0.5" style={labelStyle}>아이디</span>
            <span className="font-600 break-all">{email}</span>
            <span className="text-xs font-600 pt-0.5" style={labelStyle}>이름</span>
            <span>{displayName || "—"}</span>
          </div>
          <p className="text-[11px] mt-2" style={labelStyle}>이름·학교·연락처 같은 프로필 정보는 ‘프로필 편집’에서 바꿀 수 있어요. 아이디(이메일)는 바꿀 수 없어요.</p>
        </section>

        <section aria-label="비밀번호 변경" className="pt-4 mb-5" style={{ borderTop: "1px solid var(--border)" }}>
          <h4 className="text-sm font-700 mb-3">비밀번호 변경</h4>
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="account-pw-current" className="block text-xs font-600 mb-1" style={labelStyle}>현재 비밀번호</label>
              <input id="account-pw-current" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} className="w-full px-3 py-2.5 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="account-pw-next" className="block text-xs font-600 mb-1" style={labelStyle}>새 비밀번호</label>
              <input id="account-pw-next" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} placeholder="6자 이상 (기존과 다른 비밀번호)" className="w-full px-3 py-2.5 text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="account-pw-confirm" className="block text-xs font-600 mb-1" style={labelStyle}>새 비밀번호 확인</label>
              <input id="account-pw-confirm" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") void submitPasswordChange(); }} placeholder="새 비밀번호 다시 입력" className="w-full px-3 py-2.5 text-sm outline-none" style={inputStyle} />
            </div>
          </div>
          {pwNotice && <p role="status" className="mt-3 text-xs font-600" style={{ color: pwNotice.includes("변경되었습니다") ? "#22c55e" : "#ef4444" }}>{pwNotice}</p>}
          <button type="button" onClick={() => void submitPasswordChange()} disabled={changing} className="w-full mt-3 py-2.5 text-sm font-700" style={{ background: "var(--primary)", borderRadius: "40px", color: "#fff", opacity: changing ? 0.6 : 1 }}>{changing ? "변경 중…" : "비밀번호 변경하기"}</button>
        </section>

        <section aria-label="회원 탈퇴" className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <h4 className="text-sm font-700 mb-2">회원 탈퇴</h4>
          <ul className="text-xs list-disc pl-4 mb-3 flex flex-col gap-1" style={labelStyle}>
            <li>탈퇴를 신청하면 바로 로그아웃되고, 로그인할 수 없어요.</li>
            <li>신청 후 14일 동안은 계정 정보를 그대로 보관하고, 그 안에 로그인 화면에서 복구를 신청할 수 있어요.</li>
            <li>14일이 지난 뒤 운영자가 승인하면 계정 정보가 삭제되고 되돌릴 수 없어요.</li>
          </ul>

          {locked ? (
            <div role="note" className="text-xs p-3" style={{ background: "#f59e0b18", color: "#b45309", borderRadius: "10px" }}>
              <p className="font-700 mb-1">🔒 참여한 프로젝트가 있어 탈퇴할 수 없어요.</p>
              <p className="mb-1">참여 중인 프로젝트: {joined.join(", ")}</p>
              <p>프로젝트에서 제외되거나 프로젝트가 삭제된 뒤에 탈퇴를 신청할 수 있어요.</p>
            </div>
          ) : !withdrawOpen ? (
            <button type="button" onClick={() => setWithdrawOpen(true)} disabled={myProjectIds === null} className="w-full py-2.5 text-sm font-600" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "40px", opacity: myProjectIds === null ? 0.5 : 1 }}>탈퇴 신청하기</button>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="withdraw-reason" className="block text-xs font-600 mb-1" style={labelStyle}>탈퇴 사유 (선택)</label>
                <textarea id="withdraw-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} placeholder="남겨 주시면 서비스 개선에 참고할게요. 비워 둬도 돼요." className="w-full px-3 py-2.5 text-sm outline-none resize-y" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="withdraw-id" className="block text-xs font-600 mb-1" style={labelStyle}>아이디(이메일) 다시 입력</label>
                <input id="withdraw-id" type="email" autoComplete="off" value={idInput} onChange={(e) => setIdInput(e.target.value)} placeholder={email} className="w-full px-3 py-2.5 text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="withdraw-pw" className="block text-xs font-600 mb-1" style={labelStyle}>비밀번호 다시 입력</label>
                <input id="withdraw-pw" type="password" autoComplete="off" value={pwInput} onChange={(e) => setPwInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && canWithdraw) void submitWithdraw(); }} className="w-full px-3 py-2.5 text-sm outline-none" style={inputStyle} />
              </div>
              {withdrawError && <p role="alert" className="text-xs font-600" style={{ color: "#ef4444" }}>{withdrawError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setWithdrawOpen(false); setReason(""); setIdInput(""); setPwInput(""); setWithdrawError(""); }} className="flex-1 py-2.5 text-sm font-600" style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}>취소</button>
                <button type="button" onClick={() => void submitWithdraw()} disabled={!canWithdraw} className="flex-1 py-2.5 text-sm font-700" style={{ background: "#ef4444", borderRadius: "40px", color: "#fff", opacity: canWithdraw ? 1 : 0.5 }}>{withdrawing ? "신청 중…" : "탈퇴 신청"}</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
