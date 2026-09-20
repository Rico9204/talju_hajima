import { useEffect, useState, type ChangeEvent } from "react";
import { useProject, useProjectManagement } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import { isValidDepartmentName } from "../lib/validators";
import { detectLink } from "../lib/links";
import Avatar from "./Avatar";
import BrandIcon, { type KnownLinkType } from "./BrandIcon";
import MyEvaluationSummary from "./MyEvaluationSummary";
import PentagonChart from "./PentagonChart";

const BANNER_COLOR_PALETTE = ["#2563eb", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#64748b"];

// Shared "view any member's profile" modal — driven entirely by the global
// viewedMemberId/openMemberProfile/closeMemberProfile context state, so any
// avatar anywhere in the app (Sidebar, Home, chat, comments, team view…) can
// open it, and it renders itself wherever it's mounted with zero props.
export default function ProfileModal() {
  const { currentMember, team, viewedMemberId, closeMemberProfile, updateMyProfile } = useProject();
  const { user, updatePassword } = useAuth();
  const { isAdmin } = useProjectManagement();

  const myAvatar = currentMember?.avatar ?? "?";
  const myName = currentMember?.name ?? "참여자";

  // viewedMemberId is set from anywhere a member's avatar is clickable, and
  // the edit affordances only render when it's the signed-in user's own id.
  const isSelfProfile = viewedMemberId !== null && viewedMemberId === currentMember?.id;
  const viewedMember = viewedMemberId === currentMember?.id ? currentMember : team.members.find((m) => m.id === viewedMemberId) ?? null;

  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileSchool, setProfileSchool] = useState("");
  const [profileMajor, setProfileMajor] = useState("");
  const [profileStudent, setProfileStudent] = useState("");
  const [profileContact, setProfileContact] = useState("");
  const [profileOrg, setProfileOrg] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerColor, setBannerColor] = useState("#2563eb");
  const [bannerImageFile, setBannerImageFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerCleared, setBannerCleared] = useState(false);
  const [profileLinks, setProfileLinks] = useState<{ id: string; type: "github" | "instagram" | "notion" | "x" | "linkedin" | "behance" | "other"; url: string; label: string }[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ next: "", confirm: "" });
  const [passwordNotice, setPasswordNotice] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    };
  }, [avatarPreview, bannerPreview]);

  // The edit-draft state below (banner color, name fields, links…) has to
  // stay in sync with `currentMember` no matter which of the many avatars
  // across the app opened this modal for "myself" — re-sync every time the
  // modal opens on the signed-in user's own id instead of relying on a
  // single entry point.
  useEffect(() => {
    if (viewedMemberId !== currentMember?.id || !currentMember) return;
    setProfileEditOpen(false);
    setProfileName(currentMember.name ?? "");
    setProfileSchool(currentMember.school ?? "");
    setProfileMajor(currentMember.major ?? "");
    setProfileStudent(currentMember.student ?? "");
    setProfileContact(currentMember.contact ?? "");
    setProfileOrg(currentMember.org ?? "");
    setAvatarFile(null);
    setAvatarPreview(null);
    setBannerColor(currentMember.bannerColor ?? currentMember.color ?? "#2563eb");
    setBannerImageFile(null);
    setBannerPreview(null);
    setBannerCleared(false);
    setProfileLinks(currentMember.links ?? []);
    setNewLinkUrl("");
    setProfileError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedMemberId, currentMember?.id]);

  function handleAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function handleBannerPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setBannerImageFile(file);
    setBannerPreview(URL.createObjectURL(file));
    setBannerCleared(false);
  }

  function addProfileLink() {
    const raw = newLinkUrl.trim();
    if (!raw) return;
    const detected = detectLink(raw);
    setProfileLinks((links) => [...links, {
      id: crypto.randomUUID(), type: detected.type, label: detected.label,
      url: raw.includes("://") ? raw : `https://${raw}`,
    }]);
    setNewLinkUrl("");
  }

  async function saveProfile() {
    const majorTrimmed = profileMajor.trim();
    if (majorTrimmed && !isValidDepartmentName(majorTrimmed)) {
      setProfileError("학과 · 학년은 한글/영문으로 입력해주세요. (예: 컴퓨터공학과 3학년)");
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    try {
      await updateMyProfile({
        name: profileName.trim() || undefined,
        school: profileSchool.trim() || undefined,
        major: majorTrimmed || undefined,
        student: profileStudent.trim() || undefined,
        avatarFile: avatarFile ?? undefined,
        contact: profileContact.trim() || null,
        org: isAdmin ? profileOrg.trim() || null : undefined,
        bannerColor,
        bannerImageFile: bannerImageFile ?? undefined,
        bannerImageUrl: bannerCleared ? null : undefined,
        links: profileLinks,
      });
      // Keep the card open so the member can immediately verify the saved
      // profile. Only leave edit mode and show the refreshed read view.
      setProfileEditOpen(false);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPasswordChange() {
    if (passwordForm.next.length < 6) {
      setPasswordNotice("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordNotice("새 비밀번호와 확인이 일치하지 않습니다.");
      return;
    }
    setChangingPassword(true);
    const result = await updatePassword(passwordForm.next);
    setChangingPassword(false);
    if (result.error) {
      setPasswordNotice(result.error);
      return;
    }
    setPasswordNotice("비밀번호가 변경되었습니다.");
    setPasswordForm({ next: "", confirm: "" });
    setTimeout(() => {
      setPasswordOpen(false);
      setPasswordNotice("");
    }, 1200);
  }

  return (
    <>
      {viewedMember && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.42)", backdropFilter: "blur(4px)" }} onClick={closeMemberProfile}>
          <div className="w-[660px] max-w-[95vw] overflow-hidden" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.22)" }} onClick={(e) => e.stopPropagation()}>
            <div
              className="relative h-28"
              style={
                isSelfProfile
                  ? bannerPreview || (!bannerCleared && currentMember?.bannerImageUrl)
                    ? { backgroundImage: `url(${bannerPreview ?? currentMember?.bannerImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { background: `linear-gradient(135deg, ${bannerColor}, ${bannerColor}88)` }
                  : viewedMember.bannerImageUrl
                    ? { backgroundImage: `url(${viewedMember.bannerImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { background: `linear-gradient(135deg, ${viewedMember.bannerColor ?? viewedMember.color}, ${viewedMember.bannerColor ?? viewedMember.color}88)` }
              }
            >
              <div className="absolute top-3 right-3 flex items-center gap-2">
                {isSelfProfile && profileEditOpen && <div className="flex items-center gap-1.5 p-1.5" style={{ background: "rgba(255,255,255,.94)", borderRadius: "12px", boxShadow: "0 4px 12px rgba(15,18,53,.16)" }}>
                  {BANNER_COLOR_PALETTE.map((color) => <button key={color} type="button" onClick={() => { setBannerColor(color); setBannerImageFile(null); setBannerPreview(null); setBannerCleared(true); }} className="w-4 h-4" title={`${color} 배경`} style={{ background: color, borderRadius: "999px", border: bannerColor === color ? "2px solid #111827" : "1px solid rgba(255,255,255,.7)" }} />)}
                  <label title="배너 사진 선택" className="w-6 h-6 flex items-center justify-center cursor-pointer text-sm" style={{ background: "var(--muted)", borderRadius: "8px" }}>🖼️<input type="file" accept="image/*" onChange={handleBannerPick} className="hidden" /></label>
                  {(bannerPreview || currentMember?.bannerImageUrl) && <button type="button" onClick={() => { setBannerImageFile(null); setBannerPreview(null); setBannerCleared(true); }} title="배너 사진 제거" className="w-6 h-6 text-xs" style={{ background: "var(--muted)", borderRadius: "8px" }}>🗑️</button>}
                </div>}
                {isSelfProfile && <button type="button" onClick={() => setProfileEditOpen((open) => !open)} className="w-8 h-8 text-sm" style={{ background: "#fff", color: "#111827", borderRadius: "999px", boxShadow: "0 2px 8px rgba(15,18,53,.18)" }} title="프로필 편집">✎</button>}
                <button type="button" onClick={closeMemberProfile} className="w-8 h-8 text-lg" style={{ background: "rgba(15,18,53,.35)", color: "#fff", borderRadius: "999px" }}>×</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1.08fr_.92fr]">
              <section className="relative z-10 px-5 pb-5">
                <div className="flex items-end -mt-9 mb-4">
                  <div className="relative z-20">
                    <div className="p-1" style={{ background: "var(--card)", borderRadius: "999px", boxShadow: "0 4px 12px rgba(15,18,53,.18)" }}>
                      <Avatar
                        url={isSelfProfile ? avatarPreview ?? currentMember?.avatarUrl : viewedMember.avatarUrl}
                        initial={isSelfProfile ? myAvatar : viewedMember.avatar}
                        color={(isSelfProfile ? currentMember?.color : viewedMember.color) ?? "#f59e0b"}
                        size={70}
                      />
                    </div>
                    {isSelfProfile && profileEditOpen && <label title="프로필 사진 변경" className="absolute -right-1 -bottom-1 z-30 w-7 h-7 flex items-center justify-center cursor-pointer text-sm" style={{ background: "#fff", color: "#111827", border: "1px solid rgba(15,18,53,.18)", borderRadius: "999px", boxShadow: "0 2px 8px rgba(15,18,53,.18)" }}>📷<input type="file" accept="image/*" onChange={handleAvatarPick} className="hidden" /></label>}
                  </div>
                </div>
                <h2 className="text-xl font-800 mb-3">{isSelfProfile ? profileName || myName : viewedMember.name}</h2>
                <div className="h-px mb-3" style={{ background: "var(--border)" }} />
                {isSelfProfile && profileEditOpen ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">{[["이름", profileName, setProfileName], ["학과 · 학년", profileMajor, setProfileMajor], ["학번", profileStudent, setProfileStudent], ["연락처", profileContact, setProfileContact], ...(isAdmin ? [["소속(관리자 검색용)", profileOrg, setProfileOrg]] : [])].map(([label, value, setter]) => <label key={label as string} className="text-[11px] font-700" style={{ color: "var(--muted-foreground)" }}>{label as string}<input value={value as string} onChange={(e) => (setter as (value: string) => void)(e.target.value)} className="w-full mt-1 px-2 py-1.5 text-xs outline-none" style={{ background: "var(--muted)", borderRadius: "8px", color: "var(--foreground)" }} /></label>)}</div>
                  </>
                ) : <div className="space-y-3 text-sm">{(isSelfProfile
                    ? [["학과 · 학년", profileMajor || currentMember?.major], ["학번", profileStudent || currentMember?.student], ["연락처", profileContact || currentMember?.contact || "미입력"], ["이메일", user?.email], ...(isAdmin ? [["소속", profileOrg || currentMember?.org || "미입력 — 조장이 승인 요청 시 검색할 수 없어요"]] : [])]
                    : [["역할", viewedMember.role], ["학과 · 학년", viewedMember.major || "미입력"], ["학번", viewedMember.student || "미입력"], ["연락처", viewedMember.contact || "미입력"]]
                  ).map(([label, value]) => <div key={label as string}><div className="text-[11px] font-700 mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label as string}</div><div className="font-600" style={{ color: "var(--foreground)" }}>{value as string}</div></div>)}
                  </div>}
                <div className="mt-4"><div className="text-[11px] font-700 mb-1" style={{ color: "var(--muted-foreground)" }}>링크</div><div className="flex flex-wrap gap-1">{(isSelfProfile ? profileLinks : viewedMember.links).map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 text-xs" style={{ background: "var(--muted)", borderRadius: "999px" }}>{link.type !== "other" && <BrandIcon type={link.type as KnownLinkType} size={12} />}{link.label}{isSelfProfile && profileEditOpen && <button type="button" onClick={(e) => { e.preventDefault(); setProfileLinks((links) => links.filter((item) => item.id !== link.id)); }}>×</button>}</a>)}{isSelfProfile && profileEditOpen && <><input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addProfileLink()} placeholder="링크" className="w-20 px-2 text-xs outline-none" style={{ background: "var(--muted)", borderRadius: "999px" }} /><button type="button" onClick={addProfileLink} className="text-xs">＋</button></>}</div></div>
                {isSelfProfile && profileEditOpen && <div className="flex gap-2 mt-4"><button type="button" onClick={() => { closeMemberProfile(); setPasswordOpen(true); }} className="px-3 py-2 text-xs font-700" style={{ background: "var(--muted)", borderRadius: "10px" }}>비밀번호 변경</button><button type="button" onClick={saveProfile} disabled={savingProfile} className="px-3 py-2 text-xs font-700" style={{ background: "var(--primary)", color: "#fff", borderRadius: "10px" }}>{savingProfile ? "저장 중…" : "저장"}</button></div>}
                {profileError && <p className="text-xs mt-2" style={{ color: "#ef4444" }}>{profileError}</p>}
              </section>
              {isSelfProfile ? (
                <MyEvaluationSummary chart />
              ) : (
                <section aria-label={`${viewedMember.name} 평가 요약`} className="p-4 mb-5" style={{ background: "var(--card)", borderRadius: "var(--radius)" }}>
                  <h2 className="text-sm font-700 mb-3">협업 평판</h2>
                  {viewedMember.evalCount > 0 ? (
                    <>
                      <div className="flex items-baseline gap-1.5 mb-3">
                        <strong className="text-xl" style={{ color: "var(--primary)" }}>{viewedMember.score.toFixed(1)}</strong>
                        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>/ 10 · 최종 평가 {viewedMember.evalCount}건</span>
                      </div>
                      <div className="flex justify-center">
                        <PentagonChart
                          size={230}
                          data={[
                            { label: "역할 이행", value: viewedMember.criteriaScores.role },
                            { label: "약속·마감 준수", value: viewedMember.criteriaScores.deadline },
                            { label: "의사소통", value: viewedMember.criteriaScores.communication },
                            { label: "협업 태도", value: viewedMember.criteriaScores.collaboration },
                            { label: "결과물 품질", value: viewedMember.criteriaScores.quality },
                          ]}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      평균 공개 대기 중입니다. 동료 2명 이상이 모두 제출하면 확인할 수 있습니다.
                    </p>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
      {passwordOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(15,18,53,0.42)", backdropFilter: "blur(4px)" }} onClick={() => setPasswordOpen(false)}>
          <div className="w-[380px] max-w-[92vw] p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.22)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-700">비밀번호 변경</h3>
              <button
                type="button"
                onClick={() => { setPasswordOpen(false); setPasswordNotice(""); }}
                className="w-8 h-8 flex items-center justify-center text-lg"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>새 비밀번호</label>
                <input
                  type="password"
                  value={passwordForm.next}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, next: e.target.value }))}
                  placeholder="6자 이상"
                  className="w-full px-3 py-2.5 text-sm outline-none"
                  style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--foreground)" }}
                />
              </div>
              <div>
                <label className="block text-xs font-600 mb-1" style={{ color: "var(--muted-foreground)" }}>새 비밀번호 확인</label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && submitPasswordChange()}
                  className="w-full px-3 py-2.5 text-sm outline-none"
                  style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--foreground)" }}
                />
              </div>
            </div>

            {passwordNotice && (
              <div className="mt-3 text-xs font-600" style={{ color: passwordNotice.includes("변경되었습니다") ? "#22c55e" : "#ef4444" }}>
                {passwordNotice}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => { setPasswordOpen(false); setPasswordNotice(""); }}
                className="flex-1 py-2.5 text-sm font-600"
                style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitPasswordChange}
                disabled={changingPassword}
                className="flex-1 py-2.5 text-sm font-700"
                style={{ background: "var(--primary)", borderRadius: "40px", color: "#fff" }}
              >
                {changingPassword ? "변경 중…" : "변경하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
