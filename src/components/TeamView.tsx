import StillImg from "./StillImg";
import { useEffect, useState } from "react";
import { dataRepository } from "../api";
import { useProject, useProjectManagement } from "../context/ProjectContext";
import PentagonChart from "./PentagonChart";
import { collaborationTrust } from "../lib/collaborationTrust";
import { useEvaluationScoreCca } from "../lib/useEvaluationScoreCca";
import EvaluationInfoButton from "./EvaluationInfoButton";
import CcaBadge from "./CcaBadge";
import { useAccountBackground } from "../lib/useAccountBackground";
import WindowPanel from "./WindowPanel";
import type { Member, MemberPresenceState } from "../api/types";

const TONE = {
  blue: { bg: "rgba(74,116,181,0.12)", fg: "#2f4e80" },
  amber: { bg: "rgba(214,154,78,0.14)", fg: "#7a4f12" },
  green: { bg: "rgba(91,154,116,0.14)", fg: "#2f6b4a" },
  red: { bg: "rgba(201,98,91,0.12)", fg: "#8f3a35" },
  violet: { bg: "rgba(126,116,184,0.14)", fg: "#54498f" },
  neutral: { bg: "rgba(75,86,107,0.10)", fg: "#3a4357" },
} as const;

function formatPresenceTooltip(m: Member, state?: MemberPresenceState): string {
  const isOnline = m.online && !!state;
  const isIdle = isOnline && state?.status === "idle";

  if (isOnline && state) {
    const onlineDate = new Date(state.onlineAt);
    const timeStr = onlineDate.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    if (isIdle) {
      return `[자리비움] 10분 이상 비활동\n접속 시각: 오늘 ${timeStr}`;
    }
    return `[온라인] 접속 시각: 오늘 ${timeStr}`;
  }

  if (!m.lastSeenAt) {
    return "[오프라인] 접속 기록 없음";
  }

  const seenDate = new Date(m.lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - seenDate.getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));

  let timeDesc = "";
  if (diffMs < 0 || diffMins < 1) {
    timeDesc = "방금 전";
  } else if (diffMins < 60) {
    timeDesc = `${diffMins}분 전`;
  } else if (diffMins < 24 * 60 && seenDate.getDate() === now.getDate()) {
    const timeStr = seenDate.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    timeDesc = `오늘 ${timeStr}`;
  } else {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (yesterday.getDate() === seenDate.getDate() && yesterday.getMonth() === seenDate.getMonth()) {
      const timeStr = seenDate.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      timeDesc = `어제 ${timeStr}`;
    } else {
      timeDesc = `${seenDate.getMonth() + 1}월 ${seenDate.getDate()}일`;
    }
  }

  return `[오프라인] 마지막 접속: ${timeDesc}`;
}

export default function TeamView({ onMessage }: { onMessage?: (memberId: string) => void }) {
  const { project, team, tasks, transferLeadership, markProjectDone, kickMember, setViceLeader, currentMember, isLeader, isViceLeader, openMemberProfile, onlineMemberStates } = useProject();
  const { isAdmin } = useProjectManagement();
  const { lineSafeStyle } = useAccountBackground();
  const scoreCca = useEvaluationScoreCca();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [pendingTransfer, setPendingTransfer] = useState<{ id: string; name: string } | null>(null);
  const [pendingKick, setPendingKick] = useState<{ id: string; name: string } | null>(null);
  const [pendingVice, setPendingVice] = useState<{ id: string; name: string; appoint: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onCopied = () => { setInviteCopied(true); clearTimeout(timer); timer = setTimeout(() => setInviteCopied(false), 1500); };
    window.addEventListener("collabpeer:join-code-copied", onCopied);
    return () => { window.removeEventListener("collabpeer:join-code-copied", onCopied); clearTimeout(timer); };
  }, []);

  async function runAction(action: () => Promise<void>, done: () => void) {
    if (busy) return; setBusy(true); setActionError(null);
    try { await action(); done(); }
    catch (err) { setActionError(err && typeof err === "object" && "message" in err ? String(err.message) : "처리에 실패했습니다."); }
    finally { setBusy(false); }
  }
  const [pendingFinish, setPendingFinish] = useState(false);

  useEffect(() => {
    setSelectedId(null);
    setMemberSearch("");
  }, [project.id]);

  const members = team.members;
  const memberSearchTrimmed = memberSearch.trim().toLowerCase();
  // 접속 상태(온라인 → 자리비움 → 오프라인)가 직책보다 먼저. 같은 상태 안에서는 기존 순서(팀장·부팀장 우선)를 유지한다(안정 정렬).
  const presenceRank = (m: (typeof members)[number]) => {
    const presence = onlineMemberStates[m.id];
    if (!m.online || !presence) return 2;
    return presence.status === "idle" ? 1 : 0;
  };
  const filteredMembers = (memberSearchTrimmed
    ? members.filter((m) => m.name.toLowerCase().includes(memberSearchTrimmed))
    : members
  ).slice().sort((a, b) => presenceRank(a) - presenceRank(b));
  const showMemberSearch = members.length > 6;
  const onlineCount = members.filter((m) => m.online && !!onlineMemberStates[m.id]).length;
  const cardStyle = { background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" };

  // 선택된 팀원이 전체적으로 몇 개 프로젝트에 참여했고 몇 명과 함께했는지 —
  // "협업 신뢰도" 카드는 이 프로젝트 기준 점수만 보여주므로 별도로 조회한다.
  // early return(팀원 0명) 이전에 둬야 훅 순서가 매 렌더 동일하게 유지된다.
  const selectedUserId = (members.find((m) => m.id === selectedId) ?? members[0])?.userId ?? null;
  const [participationStats, setParticipationStats] = useState<{ projectCount: number; collaboratorCount: number } | null>(null);
  useEffect(() => {
    setParticipationStats(null);
    if (!selectedUserId) return;
    let active = true;
    dataRepository.getMemberParticipationStats(selectedUserId)
      .then((stats) => { if (active) setParticipationStats(stats); })
      .catch(() => { if (active) setParticipationStats(null); });
    return () => { active = false; };
  }, [selectedUserId]);

  if (members.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
            팀 구성원
          </div>
          <h1 className="text-2xl font-700">{team.teamLabel}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{team.teamSub}</p>
        </div>
        <div
          className="p-8 border text-center"
          style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)", ...lineSafeStyle }}
        >
          <div className="text-3xl mb-3">◎</div>
          <div className="text-sm font-600">아직 팀원이 없어요</div>
          <div className="text-sm mt-1">이 프로젝트에 참여한 팀원만 여기에 표시됩니다</div>
        </div>
      </div>
    );
  }

  const sel = members.find((m) => m.id === selectedId) ?? members[0];
  // sel.tasks.{done,total} are dead DB columns (default 0, never updated) —
  // compute the real counts from this project's actual tasks instead.
  const selTasks = tasks.filter((t) => t.assigneeIds.includes(sel.id));
  const selTasksDone = selTasks.filter((t) => t.status === "done").length;
  const selTasksTotal = selTasks.length;
  // 담당 역할은 따로 입력하지 않고, 이 팀원이 맡은 과제에 단 태그(과제 보드)를 모아 보여 준다.
  const selRoles = [...new Set(selTasks.flatMap((t) => t.tags))];
  const canManage = isLeader || isAdmin;
  const canTransfer = isLeader && project.status !== "done" && sel && sel.id !== currentMember?.id && !sel.isLeader;
  const canKick = canManage && project.status === "active" && project.approvalStatus === "approved" && sel && sel.id !== currentMember?.id && !sel.isLeader;
  // 부팀장 임명·해임은 팀장과 관리자만. 팀원 제외와 같은 조건(진행 중인 승인된 프로젝트)에서만 가능하다.
  const canAppointVice = canManage && project.status === "active" && project.approvalStatus === "approved" && sel && !sel.isLeader;
  const canFinish = canManage && project.status === "active";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
            팀 정보
          </div>
          <h1 className="text-2xl font-700">{team.teamLabel}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>{members.length}명 · 지금 온라인 {onlineCount}명 · {team.teamSub}</p>
        </div>
        {canFinish && (
          <button
            onClick={() => { setActionError(null); setPendingFinish(true); }}
            className="text-xs font-700 px-3.5 py-2 shrink-0 transition-all"
            style={{ background: "#22c55e66", color: "#fff", borderRadius: "20px" }}
          >
            프로젝트 종료
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
        {/* 팀원 목록 */}
        <WindowPanel id="team-roster" title={`팀원 ${members.length}`} style={cardStyle} bodyClassName="p-2.5">
          {showMemberSearch && (
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="팀원 검색"
              className="w-full text-xs px-3 py-1.5 border outline-none mb-2"
              style={{ borderColor: "var(--border)", borderRadius: "20px", background: "var(--background)", fontFamily: "var(--font-outfit)" }}
            />
          )}
          <ul className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto scrollbar-thin">
            {filteredMembers.map((m) => {
              const isSelected = sel.id === m.id;
              const presence = onlineMemberStates[m.id];
              const isOnline = m.online && !!presence;
              const isIdle = isOnline && presence?.status === "idle";
              const mine = tasks.filter((t) => t.assigneeIds.includes(m.id));
              const mineDone = mine.filter((t) => t.status === "done").length;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    aria-current={isSelected ? "true" : undefined}
                    title={`${m.name} (${m.role})\n${formatPresenceTooltip(m, presence)}`}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--muted)]"
                    style={{ borderRadius: "12px", background: isSelected ? "var(--secondary)" : undefined }}
                  >
                    <span className="relative shrink-0">
                      <span
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-700 overflow-hidden"
                        style={{ background: "var(--surface-opaque)", color: m.color }}
                      >
                        {m.avatarUrl ? <StillImg src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" draggable={false} /> : m.avatar}
                      </span>
                      <span
                        className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full"
                        style={{ background: isOnline ? (isIdle ? "#f59e0b" : "#22c55e") : "#94a3b8", border: "2px solid var(--card)" }}
                        aria-label={isOnline ? (isIdle ? "자리비움" : "온라인") : "오프라인"}
                      />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-700 truncate">{m.name}</span>
                        {m.isLeader && <span className="text-[10px] font-700 px-1.5 py-0.5 shrink-0" style={{ background: TONE.amber.bg, color: TONE.amber.fg, borderRadius: "20px" }}>🧭 팀장</span>}
                        {m.isViceLeader && <span className="text-[10px] font-700 px-1.5 py-0.5 shrink-0" style={{ background: TONE.violet.bg, color: TONE.violet.fg, borderRadius: "20px" }}>🚩 부팀장</span>}
                      </span>
                      <span className="block text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{m.role} · {mineDone}/{mine.length} 완료</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {filteredMembers.length === 0 && (
              <li className="text-xs py-4 text-center" style={{ color: "var(--muted-foreground)" }}>검색 결과가 없어요</li>
            )}
          </ul>
          {project.status === "active" && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("collabpeer:copy-join-code"))}
              title={isLeader || isViceLeader ? "복사할 때마다 새 코드가 발급돼요(이전 코드는 바로 무효, 6시간 유효)" : "참여 코드를 복사해 팀원에게 전달해요"}
              className="mt-2 w-full text-xs font-600 py-2.5 transition-colors hover:bg-[var(--muted)]"
              style={{ color: "var(--muted-foreground)", border: "1px dashed var(--border)", borderRadius: "12px" }}
            >
              {inviteCopied ? "복사됨! 팀원에게 전달하세요" : "＋ 참여 코드를 복사해 팀원 초대"}
            </button>
          )}
        </WindowPanel>

        <div className="flex flex-col gap-4 min-w-0">
          {/* 선택한 팀원 프로필 */}
          <WindowPanel id="team-profile" title={`${sel.name} · ${sel.role}`} style={cardStyle} bodyClassName="p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <button
                type="button"
                onClick={() => openMemberProfile(sel.id)}
                title={`${sel.name} 프로필 보기`}
                className="w-[68px] h-[68px] rounded-full flex items-center justify-center text-2xl font-700 shrink-0 overflow-hidden"
                style={{ background: "var(--surface-opaque)", color: sel.color }}
              >
                {sel.avatarUrl ? <StillImg src={sel.avatarUrl} alt={sel.name} className="w-full h-full object-cover" /> : sel.avatar}
              </button>
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl font-700">{sel.name}</span>
                  {sel.isLeader && <span className="text-xs px-2 py-0.5 font-600" style={{ background: TONE.amber.bg, color: TONE.amber.fg, borderRadius: "20px" }}>🧭 팀장</span>}
                  {sel.isViceLeader && <span className="text-xs px-2 py-0.5 font-600" style={{ background: TONE.violet.bg, color: TONE.violet.fg, borderRadius: "20px" }}>🚩 부팀장</span>}
                  <span className="text-xs px-2 py-0.5 font-600" style={{ background: sel.online ? TONE.green.bg : TONE.neutral.bg, color: sel.online ? TONE.green.fg : TONE.neutral.fg, borderRadius: "20px" }}>
                    {sel.online ? "온라인" : "오프라인"}
                  </span>
                </div>
                <div className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
                  {sel.role} · {sel.major} · <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "12px" }}>{sel.student}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {sel.id !== currentMember?.id && onMessage && (
                  <button
                    onClick={() => onMessage(sel.id)}
                    title="메시지 보내기"
                    aria-label="메시지 보내기"
                    className="flex items-center gap-1 text-xs font-700 px-3 py-1.5 transition-all"
                    style={{ background: TONE.blue.bg, color: TONE.blue.fg, borderRadius: "20px" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    채팅
                  </button>
                )}
                {canTransfer && (
                  <button
                    onClick={() => setPendingTransfer({ id: sel.id, name: sel.name })}
                    title="팀장 권한 위임"
                    aria-label="팀장 권한 위임"
                    className="flex items-center gap-1 text-xs font-700 px-3 py-1.5 transition-all"
                    style={{ background: TONE.amber.bg, color: TONE.amber.fg, borderRadius: "20px" }}
                  >
                    🧭 위임
                  </button>
                )}
                {canAppointVice && (
                  <button
                    disabled={busy}
                    onClick={() => { setActionError(null); setPendingVice({ id: sel.id, name: sel.name, appoint: !sel.isViceLeader }); }}
                    title={sel.isViceLeader ? "부팀장 해임" : "부팀장 임명"}
                    aria-label={sel.isViceLeader ? "부팀장 해임" : "부팀장 임명"}
                    className="flex items-center gap-1 text-xs font-700 px-3 py-1.5 transition-all"
                    style={{ background: TONE.violet.bg, color: TONE.violet.fg, borderRadius: "20px" }}
                  >
                    {sel.isViceLeader ? "🚩 부팀장 해임" : "🚩 부팀장 임명"}
                  </button>
                )}
                {canKick && (
                  <button
                    onClick={() => { setActionError(null); setPendingKick({ id: sel.id, name: sel.name }); }}
                    title="팀에서 제외"
                    aria-label="팀에서 제외"
                    className="flex items-center gap-1 text-xs font-700 px-3 py-1.5 transition-all"
                    style={{ background: TONE.red.bg, color: TONE.red.fg, borderRadius: "20px" }}
                  >
                    ✕ 제외
                  </button>
                )}
              </div>
            </div>

            {actionError && !pendingTransfer && !pendingKick && !pendingVice && !pendingFinish && (
              <p role="alert" className="mt-4 text-xs" style={{ color: "#ef4444" }}>{actionError}</p>
            )}

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-600" style={{ color: "var(--muted-foreground)" }} title="이 팀원이 맡은 과제에 단 태그예요">담당 역할</span>
              {selRoles.map((r) => (
                <span key={r} className="text-xs font-500 px-2.5 py-1" style={{ background: TONE.blue.bg, color: TONE.blue.fg, borderRadius: "20px" }}>
                  {r}
                </span>
              ))}
              {selRoles.length === 0 && (
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>맡은 과제에 태그를 달면 여기에 보여요</span>
              )}
            </div>
          </WindowPanel>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 협업 신뢰도 */}
            <WindowPanel id="team-trust" title="협업 신뢰도" style={cardStyle} bodyClassName="p-5">
              <div className="text-xs mb-2 flex items-start justify-between gap-2" style={{ color: "var(--muted-foreground)" }}>
                <span>{team.teamLabel.replace(" 팀", "")} 기준</span>
                <EvaluationInfoButton section={sel.evalCount > 0 ? "trust" : "disclosure"} />
              </div>
              {sel.evalCount > 0 ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-300" style={{ color: "var(--primary-text)", fontFamily: "var(--font-outfit)" }}>
                      {sel.score.toFixed(2)}
                    </span>
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>/ 10.0</span>
                    {scoreCca && <CcaBadge />}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    {collaborationTrust(sel.score, sel.evalCount).label} · {collaborationTrust(sel.score, sel.evalCount).evidence}
                  </div>
                  <div className="mt-3 h-2 w-full" style={{ background: "var(--border)", borderRadius: "5px" }}>
                    <div className="h-2" style={{ width: `${(sel.score / 10) * 100}%`, background: "var(--primary)", borderRadius: "5px" }} />
                  </div>
                </>
              ) : (
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>공개 대기</p>
              )}
              <div className="grid grid-cols-3 gap-2 mt-5 text-center">
                {[
                  { label: "완료 과제", value: `${selTasksDone}/${selTasksTotal}` },
                  { label: "완료율", value: `${selTasksTotal ? Math.round((selTasksDone / selTasksTotal) * 100) : 0}%` },
                  { label: "함께한 동료", value: `${participationStats?.collaboratorCount ?? 0}명` },
                ].map((st) => (
                  <div key={st.label}>
                    <div className="text-lg font-700" style={{ fontFamily: "var(--font-outfit)" }}>{st.value}</div>
                    <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{st.label}</div>
                  </div>
                ))}
              </div>
              {participationStats && (
                <p className="text-[11px] mt-3 text-center" style={{ color: "var(--muted-foreground)" }}>지금까지 참여한 프로젝트 {participationStats.projectCount}회</p>
              )}
            </WindowPanel>

            {/* 항목별 참고 지표 */}
            <WindowPanel id="team-criteria" title="협업 항목별 참고 지표" style={cardStyle} bodyClassName="p-5">
              <div className="flex justify-end mb-1">
                <EvaluationInfoButton section="score" />
              </div>
              {sel.evalCount > 0 ? (
                <div className="flex justify-center">
                  <PentagonChart
                    data={[
                      { label: "역할 이행", value: sel.criteriaScores.role },
                      { label: "약속·마감 준수", value: sel.criteriaScores.deadline },
                      { label: "의사소통", value: sel.criteriaScores.communication },
                      { label: "협업 태도", value: sel.criteriaScores.collaboration },
                      { label: "결과물 품질", value: sel.criteriaScores.quality },
                    ]}
                  />
                </div>
              ) : (
                <div className="text-xs p-3" style={{ background: "var(--muted)", borderRadius: "10px", color: "var(--muted-foreground)" }}>
                  공개 대기
                </div>
              )}
            </WindowPanel>
          </div>
        </div>
      </div>

      {pendingTransfer && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="w-96 p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
            <div className="w-10 h-10 flex items-center justify-center text-lg mb-3" style={{ background: "#f59e0b18", borderRadius: "12px" }}>🧭</div>
            <h3 className="font-700 mb-1">팀장 권한을 위임할까요?</h3>
            <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
              <strong>{pendingTransfer.name}</strong>님에게 팀장 권한이 넘어가고, 나는 팀원으로 전환됩니다. 이 작업은 즉시 적용됩니다.
            </p>
            {actionError && <p role="alert" className="mb-3 text-sm text-red-600">{actionError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setPendingTransfer(null); setActionError(null); }}
                className="flex-1 py-2.5 text-sm font-600"
                style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
              >
                취소
              </button>
              <button
                disabled={busy}
                onClick={() => runAction(() => transferLeadership(pendingTransfer.id), () => setPendingTransfer(null))}
                className="flex-1 py-2.5 text-sm font-700 transition-all disabled:opacity-60"
                style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px var(--primary-glow)" }}
              >
                위임하기
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingVice && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="w-96 p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
            <div className="w-10 h-10 flex items-center justify-center text-lg mb-3" style={{ background: "#4a74b518", borderRadius: "12px" }}>🚩</div>
            <h3 className="font-700 mb-1">{pendingVice.appoint ? "부팀장으로 임명할까요?" : "부팀장에서 해임할까요?"}</h3>
            <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
              <strong>{pendingVice.name}</strong>님이 과제·팀 일정·워크스페이스 정리 같은 운영 권한을 {pendingVice.appoint ? "갖게 됩니다" : "잃고 팀원으로 돌아갑니다"}.
            </p>
            {actionError && <p role="alert" className="mb-3 text-sm text-red-600">{actionError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setPendingVice(null)}
                className="flex-1 py-2.5 text-sm font-600"
                style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
              >
                취소
              </button>
              <button
                disabled={busy}
                onClick={() => runAction(() => setViceLeader(pendingVice.id, pendingVice.appoint), () => setPendingVice(null))}
                className="flex-1 py-2.5 text-sm font-700 transition-all"
                style={{ background: "#4a74b5", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(74,116,181,0.3)" }}
              >
                {pendingVice.appoint ? "임명하기" : "해임하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingKick && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="w-96 p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
            <div className="w-10 h-10 flex items-center justify-center text-lg mb-3" style={{ background: "#ef444418", borderRadius: "12px" }}>✕</div>
            <h3 className="font-700 mb-1">팀에서 제외할까요?</h3>
            <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
              <strong>{pendingKick.name}</strong>님이 이 프로젝트에서 제외됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            {actionError && <p role="alert" className="mb-3 text-sm text-red-600">{actionError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setPendingKick(null)}
                className="flex-1 py-2.5 text-sm font-600"
                style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
              >
                취소
              </button>
              <button
                disabled={busy}
                onClick={() => runAction(() => kickMember(pendingKick.id), () => { setSelectedId(null); setPendingKick(null); })}
                className="flex-1 py-2.5 text-sm font-700 transition-all"
                style={{ background: "#ef4444", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(239,68,68,0.3)" }}
              >
                제외하기
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingFinish && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}>
          <div className="w-96 p-6" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
            <div className="w-10 h-10 flex items-center justify-center text-lg mb-3" style={{ background: "#22c55e18", borderRadius: "12px" }}>✓</div>
            <h3 className="font-700 mb-1">프로젝트를 종료할까요?</h3>
            <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
              종료하면 프로젝트가 읽기 전용으로 전환되며 종료 평가를 작성할 수 있습니다.
            </p>
            {actionError && <p role="alert" className="mb-3 text-sm text-red-600">{actionError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setPendingFinish(false)}
                className="flex-1 py-2.5 text-sm font-600"
                style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
              >
                취소
              </button>
              <button
                disabled={busy}
                onClick={() => runAction(markProjectDone, () => setPendingFinish(false))}
                className="flex-1 py-2.5 text-sm font-700 transition-all"
                style={{ background: "#22c55e", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(34,197,94,0.3)" }}
              >
                종료하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
