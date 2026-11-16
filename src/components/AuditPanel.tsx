import { useCallback, useEffect, useRef, useState } from "react";
import { dataRepository } from "../api";
import type { AuditActivity, AuditIp, AuditUser } from "../api/types";

// 운영자 창의 "접속 감사": 사용자 이름 목록 → 사용자를 누르면 접속한 IP와 처음~마지막 접속 → IP마다 "상세 활동"(업로드·삭제 내역).
// 기록은 이 기능이 켜진 때부터 쌓이고 1년간 보관한다. 운영자만 볼 수 있다.
const pad = (n: number) => String(n).padStart(2, "0");
const formatTime = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const formatSize = (bytes: unknown) => {
  const n = typeof bytes === "number" ? bytes : NaN;
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
};
const TARGET_LABEL: Record<string, string> = {
  workspace_file: "워크스페이스 파일", workspace_folder: "워크스페이스 폴더", project: "프로젝트", member: "팀원", task: "과제", schedule_event: "일정",
  board_post: "게시글", board_comment: "댓글", announcement: "관리자 공지", profile_image: "프로필 이미지", board_attachment: "게시판 첨부", admin_document: "관리자 증명서",
};

const muted = { color: "var(--muted-foreground)" } as const;
const card = { background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" } as const;

export default function AuditPanel() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AuditUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuditUser | null>(null);
  const [ips, setIps] = useState<AuditIp[]>([]);
  const [loadingIps, setLoadingIps] = useState(false);
  const [openIp, setOpenIp] = useState<string | null>(null);
  const [activities, setActivities] = useState<AuditActivity[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const seq = useRef(0); // 늦게 도착한 응답이 최신 선택을 덮어쓰지 않게

  const loadUsers = useCallback(async (q: string, offset: number) => {
    setLoadingUsers(true);
    try {
      const page = await dataRepository.listAuditUsers(q, offset);
      setUsers((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
      setHasMore(page.hasMore);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // 검색어가 바뀌면 잠깐 기다렸다가(타이핑 중에는 요청하지 않는다) 처음부터 다시 읽는다.
  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(query.trim(), 0), query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [query, loadUsers]);

  async function pickUser(user: AuditUser) {
    const mine = ++seq.current;
    setSelected(user); setIps([]); setOpenIp(null); setActivities([]); setNextBefore(null); setLoadingIps(true); setError("");
    try {
      const list = await dataRepository.listAuditIps(user.userId);
      if (seq.current === mine) setIps(list);
    } catch (e) {
      if (seq.current === mine) setError(e instanceof Error ? e.message : "접속 기록을 불러오지 못했습니다.");
    } finally {
      if (seq.current === mine) setLoadingIps(false);
    }
  }

  async function toggleActivities(user: AuditUser, ip: string) {
    if (openIp === ip) { setOpenIp(null); return; }
    const mine = ++seq.current;
    setOpenIp(ip); setActivities([]); setNextBefore(null); setLoadingActivities(true);
    try {
      const page = await dataRepository.listAuditActivities(user.userId, ip);
      if (seq.current === mine) { setActivities(page.items); setNextBefore(page.nextBefore); }
    } catch (e) {
      if (seq.current === mine) setError(e instanceof Error ? e.message : "활동 내역을 불러오지 못했습니다.");
    } finally {
      if (seq.current === mine) setLoadingActivities(false);
    }
  }

  async function moreActivities(user: AuditUser, ip: string) {
    if (nextBefore === null) return;
    setLoadingActivities(true);
    try {
      const page = await dataRepository.listAuditActivities(user.userId, ip, nextBefore);
      setActivities((prev) => [...prev, ...page.items]);
      setNextBefore(page.nextBefore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "활동 내역을 불러오지 못했습니다.");
    } finally {
      setLoadingActivities(false);
    }
  }

  return (
    <section className="mb-8" aria-label="접속 감사">
      <div className="mb-4">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ ...muted, fontFamily: "var(--font-jetbrains)" }}>운영자</div>
        <h2 className="text-xl font-700">접속 감사</h2>
        <p className="text-sm mt-1" style={muted}>사용자를 누르면 접속한 IP와 처음~마지막 접속 시각이 나오고, IP마다 ‘상세 활동’으로 업로드·삭제 내역을 볼 수 있어요. 기록은 이 기능을 켠 때부터 쌓이고 1년간 보관돼요.</p>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-5 items-start">
        <div aria-label="사용자 목록">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름 또는 이메일 검색" aria-label="사용자 검색" className="w-full text-sm px-3 py-2.5 border outline-none mb-3" style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--muted)" }} />
          {users.length === 0 && !loadingUsers ? (
            <div className="p-5 border text-center text-sm" style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", ...muted }}>{query ? "검색 결과가 없어요." : "아직 쌓인 접속 기록이 없어요."}</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {users.map((u) => {
                const on = selected?.userId === u.userId;
                return (
                  <li key={u.userId}>
                    <button type="button" onClick={() => void pickUser(u)} aria-pressed={on} className="w-full text-left px-3.5 py-3" style={{ ...card, outline: on ? "2px solid var(--primary)" : "none" }}>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-700 break-words">{u.name || "(이름 없음)"}</span>
                        {!u.active && <span className="text-[10px] font-700 px-1.5 py-0.5 shrink-0" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}>삭제된 계정</span>}
                      </span>
                      <span className="block text-xs break-all" style={muted}>{u.email}</span>
                      <span className="block text-[11px] mt-1" style={muted}>마지막 접속 {formatTime(u.lastAt)} · IP {u.ipCount}개</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {loadingUsers && <p className="text-xs text-center py-3" style={muted}>불러오는 중…</p>}
          {hasMore && !loadingUsers && <button type="button" onClick={() => void loadUsers(query.trim(), users.length)} className="w-full mt-3 text-xs font-600 py-2" style={{ background: "var(--muted)", borderRadius: "20px" }}>더 보기</button>}
        </div>

        <div aria-label="접속 상세">
          {!selected ? (
            <div className="p-8 border text-center text-sm" style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", ...muted }}>왼쪽에서 사용자를 선택하세요.</div>
          ) : (
            <div className="p-4" style={card}>
              <div className="mb-3">
                <div className="text-base font-700 break-words">{selected.name || "(이름 없음)"}</div>
                <div className="text-xs break-all" style={muted}>{selected.email}{!selected.active ? " · 삭제된 계정(탈퇴 등)" : ""}</div>
                <div className="text-xs mt-1" style={muted}>처음 접속 {formatTime(selected.firstAt)} ~ 마지막 접속 {formatTime(selected.lastAt)} · 접속 {selected.logins}회 · 업로드 {selected.uploads}건 · 삭제 {selected.deletes}건</div>
              </div>
              <h3 className="text-sm font-700 mb-2">접속한 IP ({ips.length})</h3>
              {loadingIps ? <p className="text-xs" style={muted}>불러오는 중…</p> : ips.length === 0 ? <p className="text-xs" style={muted}>IP 기록이 없어요.</p> : (
                <ul className="flex flex-col gap-2">
                  {ips.map((row) => {
                    const open = openIp === row.ip;
                    return (
                      <li key={row.ip} className="p-3" style={{ background: "var(--muted)", borderRadius: "var(--radius-sm)" }}>
                        <div className="flex items-start gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-700 break-all" style={{ fontFamily: "var(--font-jetbrains)" }}>{row.ip || "(알 수 없음)"}</div>
                            <div className="text-xs mt-0.5" style={muted}>{formatTime(row.firstAt)} ~ {formatTime(row.lastAt)}</div>
                            <div className="text-[11px] mt-0.5" style={muted}>접속 {row.logins}회 · 업로드 {row.uploads}건 · 삭제 {row.deletes}건</div>
                          </div>
                          <button type="button" onClick={() => void toggleActivities(selected, row.ip)} aria-expanded={open} className="text-xs font-700 px-3 py-1.5 shrink-0" style={{ background: open ? "var(--primary)" : "var(--card)", color: open ? "#fff" : "var(--foreground)", borderRadius: "20px" }}>상세 활동</button>
                        </div>
                        {open && (
                          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }} aria-label={`${row.ip} 상세 활동`}>
                            {activities.length === 0 && !loadingActivities ? <p className="text-xs" style={muted}>이 IP에서 한 업로드·삭제가 없어요.</p> : (
                              <ul className="flex flex-col gap-1.5">
                                {activities.map((a) => (
                                  <li key={a.id} className="flex items-start gap-2 text-xs">
                                    <span className="shrink-0 w-28" style={muted}>{formatTime(a.at)}</span>
                                    <span className="shrink-0 font-700 px-1.5 py-0.5 text-[10px]" style={{ background: a.kind === "upload" ? "#22c55e22" : "#ef444422", color: a.kind === "upload" ? "#15803d" : "#b91c1c", borderRadius: "20px" }}>{a.kind === "upload" ? "업로드" : "삭제"}</span>
                                    <span className="flex-1 min-w-0 break-words">
                                      <span style={muted}>{TARGET_LABEL[a.targetType ?? ""] ?? a.targetType ?? "항목"}</span>{" "}
                                      <span className="font-600">{a.targetName || "(이름 없음)"}</span>
                                      {a.projectName && <span style={muted}> · {a.projectName}</span>}
                                      {a.kind === "upload" && (formatSize(a.detail.size) || a.detail.newVersion) ? <span style={muted}> · {formatSize(a.detail.size)}{a.detail.newVersion ? " · 새 버전" : ""}</span> : null}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {loadingActivities && <p className="text-xs mt-2" style={muted}>불러오는 중…</p>}
                            {nextBefore !== null && !loadingActivities && <button type="button" onClick={() => void moreActivities(selected, row.ip)} className="mt-3 text-xs font-600 px-3 py-1.5" style={{ background: "var(--card)", borderRadius: "20px" }}>더 보기</button>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
