import { useEffect, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { dataRepository } from "../api";
import { useProject, useProjectManagement } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import { isValidDepartmentName } from "../lib/validators";
import { collaborationTrust } from "../lib/collaborationTrust";
import { detectLink } from "../lib/links";
import Avatar from "./Avatar";
import BrandIcon, { type KnownLinkType } from "./BrandIcon";
import MyEvaluationSummary from "./MyEvaluationSummary";
import PentagonChart from "./PentagonChart";
import MedalIcon from "./MedalIcon";
import AchievementBadge from "./AchievementBadge";
import TierParticles from "./TierParticles";
import TierFlame from "./TierFlame";
import EdgeAura from "./EdgeAura";
import CardDecoration from "./CardDecoration";
import AvatarFrame from "./AvatarFrame";
import {
  BACKGROUND_PRESETS,
  MAX_CUSTOM_UI_THEMES,
  UI_THEMES,
  loadCustomUiThemes,
  makeCustomUiTheme,
  matchUiTheme,
  saveCustomUiThemes,
  type UiTheme,
  type UiThemeState,
} from "../lib/uiThemes";
import { canUseTheme, PROFILE_CARD_THEMES } from "../lib/profileThemes";
import { ACHIEVEMENTS } from "../lib/achievements";
import { useMyProfileTheme } from "../lib/useMyProfileTheme";
import { useStillUrl } from "../lib/useStillUrl";
import { PROFILE_IMAGE_MIME_TYPES, validateProfileImage } from "../lib/profileImages";

const BANNER_COLOR_PALETTE = ["#2563eb", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#64748b"];

// Small dark tooltip that appears below the trigger on hover/focus — used
// to explain the tier medal and best-badge icons next to the avatar, since
// a bare emoji + native `title` isn't enough to convey what unlocked it.
function HoverTip({ children, label, detail }: { children: ReactNode; label: string; detail: string }) {
  return (
    <span className="relative inline-flex group focus-within:z-50 hover:z-50">
      {children}
      <span
        className="pointer-events-none absolute left-1/2 top-full mt-2 w-52 -translate-x-1/2 rounded-lg p-2.5 text-left text-[11px] leading-snug opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
        style={{ background: "rgba(15,18,53,0.92)", color: "#fff" }}
      >
        <div className="font-700 mb-0.5">{label}</div>
        <div style={{ color: "rgba(255,255,255,0.75)" }}>{detail}</div>
      </span>
    </span>
  );
}

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
  const bannerUrl = useStillUrl(viewedMember?.bannerImageUrl, true); // 성능 우선 only freezes

  // 다른 팀원 프로필에는 "이 프로젝트만" 기준인 평가 점수 옆에, 그 사람이
  // 전체적으로 몇 개 프로젝트에 참여했고 몇 명과 함께했는지도 보여준다 —
  // shares_project_with 기준으로 접근 가능한 경우에만 조회된다.
  const [otherStats, setOtherStats] = useState<{ projectCount: number; collaboratorCount: number } | null>(null);
  useEffect(() => {
    setOtherStats(null);
    if (isSelfProfile || !viewedMember?.userId) return;
    let active = true;
    dataRepository.getMemberParticipationStats(viewedMember.userId)
      .then((stats) => { if (active) setOtherStats(stats); })
      .catch(() => { if (active) setOtherStats(null); });
    return () => { active = false; };
  }, [isSelfProfile, viewedMember?.userId]);

  const {
    myTier, myScore, myBadge, earnedIds, previewAll, themeViewer,
    profileThemeId, setProfileThemeId, profileTheme,
    cardTierId, cardHasEffects, cardC1, cardC2, cardGlow, avatarFrame,
  } = useMyProfileTheme();
  // Profile-card tier effect: escalates from a plain static ring (bronze)
  // to a shimmering border (silver) to a pulsing glow (gold) to a pulsing
  // glow + moving holographic sweep (platinum). See .tier-card-* in
  // index.css for the keyframes this animation name points at. The border
  // itself is a rotating conic-gradient ring (.tier-card-ring in index.css).
  // Which effects are on, the ring style/speed, and optionally a palette
  // come from the selected profile-card theme (src/lib/profileThemes.ts). A
  // reward theme whose achievement isn't earned falls back to the default
  // (handled inside useMyProfileTheme).
  const tierCardAnimation = profileTheme.glow ?? (
    myTier?.id === "silver" ? "tier-card-shimmer 3s ease-in-out infinite"
    : myTier?.id === "gold" ? "tier-card-pulse 2.4s ease-in-out infinite"
    : myTier?.id === "platinum" ? "tier-card-pulse 1.8s ease-in-out infinite"
    : undefined);
  const tierRingSpeed = cardHasEffects ? profileTheme.ring[cardTierId] ?? null : null;
  const tierCardStyle: CSSProperties = cardHasEffects && cardC1 && cardC2
    ? ({
        "--tier-glow": cardGlow,
        "--tier-c1": cardC1,
        "--tier-c2": cardC2,
        "--tier-ring-speed": tierRingSpeed ?? "0s",
        boxShadow: "0 24px 64px rgba(15,18,53,0.22), 0 0 16px 2px var(--tier-glow)",
      } as CSSProperties)
    : { boxShadow: "0 24px 64px rgba(15,18,53,0.22)" };

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
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null);
  const [backgroundGradient, setBackgroundGradient] = useState<string | null>(null);
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [backgroundCleared, setBackgroundCleared] = useState(false);
  // A photo already in storage that a UI-theme preset asks for (applied on 저장); null = none chosen.
  const [presetImageUrl, setPresetImageUrl] = useState<string | null>(null);
  const [glassOpacity, setGlassOpacity] = useState(66);
  const [glassBlur, setGlassBlur] = useState(18);
  const [customUiThemes, setCustomUiThemes] = useState(loadCustomUiThemes);
  const [presetNaming, setPresetNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  // The photo the editor currently shows/would save: a preset's photo, else the saved one unless removed.
  // (A just-picked local file has no URL yet — that's `backgroundPreview`.)
  const editorImageUrl = backgroundPreview ? null : presetImageUrl ?? (!backgroundCleared ? currentMember?.backgroundImageUrl ?? null : null);
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
      if (backgroundPreview) URL.revokeObjectURL(backgroundPreview);
    };
  }, [avatarPreview, bannerPreview, backgroundPreview]);

  // The edit-draft state below (banner color, name fields, links…) has to
  // stay in sync with `currentMember` no matter which of the many avatars
  // across the app opened this modal for "myself" — re-sync every time the
  // modal opens on the signed-in user's own id instead of relying on a
  // single entry point.
  useEffect(() => {
    if (viewedMemberId !== currentMember?.id || !currentMember) return;
    setProfileEditOpen(false);
    setPresetNaming(false);
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
    setBackgroundColor(currentMember.backgroundColor ?? null);
    setBackgroundGradient(currentMember.backgroundGradient ?? null);
    setBackgroundImageFile(null);
    setBackgroundPreview(null);
    setBackgroundCleared(false);
    setPresetImageUrl(null);
    setGlassOpacity(currentMember.glassOpacity ?? 32);
    setGlassBlur(currentMember.glassBlur ?? 2);
    setProfileLinks(currentMember.links ?? []);
    setNewLinkUrl("");
    setProfileError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedMemberId, currentMember?.id]);

  async function selectProfileImage(e: ChangeEvent<HTMLInputElement>, apply: (file: File) => void) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await validateProfileImage(file);
      apply(file);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "이미지를 선택하지 못했습니다.");
    }
  }

  function handleAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    void selectProfileImage(e, (file) => {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    });
  }

  function handleBannerPick(e: ChangeEvent<HTMLInputElement>) {
    void selectProfileImage(e, (file) => {
      setBannerImageFile(file);
      setBannerPreview(URL.createObjectURL(file));
      setBannerCleared(false);
    });
  }

  function handleBackgroundPick(e: ChangeEvent<HTMLInputElement>) {
    void selectProfileImage(e, (file) => {
      setBackgroundImageFile(file);
      setBackgroundPreview(URL.createObjectURL(file));
      setBackgroundCleared(false);
      setPresetImageUrl(null);
      // A new photo needs a lighter touch than a flat color/gradient does —
      // land on the crisp, barely-there look rather than whatever intensity
      // was previously dialed in.
      setGlassOpacity(32);
      setGlassBlur(2);
    });
  }

  function pickBackgroundPreset(preset: { value: string; kind: "color" | "gradient" }) {
    if (preset.kind === "gradient") {
      setBackgroundGradient(preset.value);
      setBackgroundColor(null);
    } else {
      setBackgroundColor(preset.value);
      setBackgroundGradient(null);
    }
    setBackgroundImageFile(null);
    setBackgroundPreview(null);
    setBackgroundCleared(true);
    setPresetImageUrl(null);
  }

  // A UI theme is just the background/glass values at once (a photo preset brings its
  // photo along). It replaces the current photo, so the edit still has to be saved with 저장.
  function applyUiTheme(theme: UiTheme) {
    setBackgroundColor(theme.background?.kind === "color" ? theme.background.value : null);
    setBackgroundGradient(theme.background?.kind === "gradient" ? theme.background.value : null);
    setBackgroundImageFile(null);
    setBackgroundPreview(null);
    setBackgroundCleared(true);
    setPresetImageUrl(theme.imageUrl ?? null);
    setGlassOpacity(theme.glassOpacity);
    setGlassBlur(theme.glassBlur);
  }

  function saveCustomUiTheme(state: UiThemeState) {
    const next = [...customUiThemes, makeCustomUiTheme(presetName.trim() || `내 프리셋 ${customUiThemes.length + 1}`, state)].slice(0, MAX_CUSTOM_UI_THEMES);
    setCustomUiThemes(next);
    saveCustomUiThemes(next);
    setPresetNaming(false);
  }

  function deleteCustomUiTheme(id: string) {
    const next = customUiThemes.filter((theme) => theme.id !== id);
    setCustomUiThemes(next);
    saveCustomUiThemes(next);
  }

  function resetBackground() {
    setBackgroundColor(null);
    setBackgroundGradient(null);
    setBackgroundImageFile(null);
    setBackgroundPreview(null);
    setBackgroundCleared(true);
    setPresetImageUrl(null);
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
        backgroundColor,
        backgroundGradient,
        backgroundImageFile: backgroundImageFile ?? undefined,
        backgroundImageUrl: backgroundImageFile ? undefined : presetImageUrl ?? (backgroundCleared ? null : undefined),
        glassOpacity,
        glassBlur,
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
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4 z-50" style={{ background: "rgba(15,18,53,0.42)" }} onClick={closeMemberProfile}>
          {/* Wrapper exists so TierFlame can sit outside the card's overflow-hidden clip. */}
          <div className={`relative isolate w-[820px] max-w-full my-auto${profileEditOpen ? " profile-edit-static" : ""}`} onClick={(e) => e.stopPropagation()}>
          {isSelfProfile && cardHasEffects && tierCardAnimation && <div aria-hidden="true" className="tier-card-glow" style={{ ...tierCardStyle, boxShadow: "0 0 34px 6px var(--tier-glow)", animation: tierCardAnimation }} />}
          {isSelfProfile && profileTheme.flame && (profileTheme.flameColors || myTier) && <TierFlame tierId={profileTheme.flameColors ? "platinum" : myTier?.id ?? ""} colors={profileTheme.flameColors} scale={profileTheme.flameScale} />}
          {isSelfProfile && profileTheme.decoration && <CardDecoration kind={profileTheme.decoration} layer="back" />}
          {isSelfProfile && cardHasEffects && profileTheme.aura && cardC1 && cardC2 && <EdgeAura kind={profileTheme.aura} c1={cardC1} c2={cardC2} glow={cardGlow} />}
          <div
            className={`relative w-full overflow-hidden${isSelfProfile && cardHasEffects && profileTheme.ringStyle !== "none" ? ` tier-card-ring tier-card-ring-${profileTheme.ringStyle}` : ""}${isSelfProfile && tierRingSpeed === null ? " tier-card-ring-still" : ""}`}
            style={isSelfProfile ? {
              // The profile card carries personal info and form fields, so
              // it needs to read clearly regardless of how translucent the
              // account has dialed the rest of the glass UI down to — stay
              // near-opaque white here rather than following --card-glass.
              background: "var(--card)",
              borderRadius: "var(--radius)",
              maxHeight: "calc(100dvh - 2rem)",
              overflowY: "auto",
              overscrollBehavior: "contain",
              ...tierCardStyle,
            } : { background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.22)", maxHeight: "calc(100dvh - 2rem)", overflowY: "auto", overscrollBehavior: "contain" }}
            onClick={(e) => e.stopPropagation()}
          >
            {isSelfProfile && myTier?.id === "platinum" && profileTheme.shine && <div className="tier-card-shine" style={{ borderRadius: "var(--radius)", zIndex: 30 }} />}
            {isSelfProfile && cardHasEffects && profileTheme.particles && <TierParticles tierId={cardTierId} kind={profileTheme.particles} />}
            <div
              className="relative h-28"
              style={
                isSelfProfile
                  ? bannerPreview || (!bannerCleared && currentMember?.bannerImageUrl)
                    ? { backgroundImage: `url(${bannerPreview ?? bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { background: `linear-gradient(135deg, ${bannerColor}, ${bannerColor}88)` }
                  : viewedMember.bannerImageUrl
                    ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { background: `linear-gradient(135deg, ${viewedMember.bannerColor ?? viewedMember.color}, ${viewedMember.bannerColor ?? viewedMember.color}88)` }
              }
            >
              <div className="absolute top-3 right-3 flex items-center gap-2">
                {isSelfProfile && profileEditOpen && <div className="flex items-center gap-1.5 p-1.5" style={{ background: "rgba(255,255,255,.94)", borderRadius: "12px", boxShadow: "0 4px 12px rgba(15,18,53,.16)" }}>
                  {BANNER_COLOR_PALETTE.map((color) => <button key={color} type="button" onClick={() => { setBannerColor(color); setBannerImageFile(null); setBannerPreview(null); setBannerCleared(true); }} className="w-4 h-4" title={`${color} 배경`} style={{ background: color, borderRadius: "999px", border: bannerColor === color ? "2px solid #111827" : "1px solid rgba(255,255,255,.7)" }} />)}
              <label title="배너 사진 선택" className="w-6 h-6 flex items-center justify-center cursor-pointer text-sm" style={{ background: "var(--muted)", borderRadius: "8px" }}>🖼️<input type="file" accept={PROFILE_IMAGE_MIME_TYPES.join(",")} onChange={handleBannerPick} className="hidden" /></label>
                  {(bannerPreview || currentMember?.bannerImageUrl) && <button type="button" onClick={() => { setBannerImageFile(null); setBannerPreview(null); setBannerCleared(true); }} title="배너 사진 제거" className="w-6 h-6 text-xs" style={{ background: "var(--muted)", borderRadius: "8px" }}>🗑️</button>}
                </div>}
                {isSelfProfile && <button type="button" onClick={() => setProfileEditOpen((open) => !open)} className="w-8 h-8 text-sm" style={{ background: "#fff", color: "#111827", borderRadius: "999px", boxShadow: "0 2px 8px rgba(15,18,53,.18)" }} title="프로필 편집">✎</button>}
                <button type="button" onClick={closeMemberProfile} className="w-8 h-8 text-lg" style={{ background: "rgba(15,18,53,.35)", color: "#fff", borderRadius: "999px" }}>×</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[.85fr_1.15fr]">
              <section className="relative z-10 px-5 pb-5">
                <div className="flex items-end gap-2 -mt-9 mb-4">
                  <div className="relative z-20">
                    {(() => {
                      // 4px padding each side around the 70px photo makes the ring 78px.
                      const photo = (
                        <div className="p-1" style={{ background: "var(--card)", borderRadius: "999px", boxShadow: "0 4px 12px rgba(15,18,53,.18)" }}>
                          <Avatar
                            url={isSelfProfile ? avatarPreview ?? currentMember?.avatarUrl : viewedMember.avatarUrl}
                            initial={isSelfProfile ? myAvatar : viewedMember.avatar}
                            color={(isSelfProfile ? currentMember?.color : viewedMember.color) ?? "#f59e0b"}
                            size={70}
                            animate
                          />
                        </div>
                      );
                      return isSelfProfile && avatarFrame ? <AvatarFrame kind={avatarFrame} size={78} c1={cardC1} c2={cardC2}>{photo}</AvatarFrame> : photo;
                    })()}
                    {isSelfProfile && profileEditOpen && <label title="프로필 사진 변경" className="absolute -right-1 -bottom-1 z-30 w-7 h-7 flex items-center justify-center cursor-pointer text-sm" style={{ background: "#fff", color: "#111827", border: "1px solid rgba(15,18,53,.18)", borderRadius: "999px", boxShadow: "0 2px 8px rgba(15,18,53,.18)" }}>📷<input type="file" accept={PROFILE_IMAGE_MIME_TYPES.join(",")} onChange={handleAvatarPick} className="hidden" /></label>}
                  </div>
                  {isSelfProfile && myTier && (
                    <HoverTip
                      label={`${myTier.label} 등급`}
                      detail={myScore !== null ? `평가 평균 ${myScore.toFixed(1)} / 10 기준` : "최종 평가 평균이 공개되면 등급이 매겨져요"}
                    >
                      <span className="mb-1.5 flex"><MedalIcon shape={myTier.shape} colors={myTier.colors} size={26} /></span>
                    </HoverTip>
                  )}
                  {isSelfProfile && myBadge && (
                    <HoverTip
                      label={myBadge.achievement.label}
                      detail={`${myBadge.achievement.description} · 현재 ${myBadge.progress.value}${myBadge.achievement.unit}`}
                    >
                      <span className="flex"><AchievementBadge achievement={myBadge.achievement} earned label={myBadge.achievement.label} size={28} /></span>
                    </HoverTip>
                  )}
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
                <div className="mt-4"><div className="text-[11px] font-700 mb-1" style={{ color: "var(--muted-foreground)" }}>링크</div><div className="flex flex-wrap gap-1">{(isSelfProfile ? profileLinks : viewedMember.links).map((link) => <a key={link.id} href={/^https?:\/\//i.test(link.url) ? link.url : undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 text-xs" style={{ background: "var(--muted)", borderRadius: "999px" }}>{link.type !== "other" && <BrandIcon type={link.type as KnownLinkType} size={12} />}{link.label}{isSelfProfile && profileEditOpen && <button type="button" onClick={(e) => { e.preventDefault(); setProfileLinks((links) => links.filter((item) => item.id !== link.id)); }}>×</button>}</a>)}{isSelfProfile && profileEditOpen && <><input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && addProfileLink()} placeholder="링크" className="w-20 px-2 text-xs outline-none" style={{ background: "var(--muted)", borderRadius: "999px" }} /><button type="button" onClick={addProfileLink} className="text-xs">＋</button></>}</div></div>
                {isSelfProfile && profileEditOpen && (() => {
                  const uiThemeState = { backgroundColor, backgroundGradient, backgroundImageUrl: editorImageUrl, hasLocalImage: !!backgroundPreview, glassOpacity, glassBlur };
                  const activeUiTheme = matchUiTheme(uiThemeState, [...UI_THEMES, ...customUiThemes]);
                  // Saving needs something new to save: not a photo that isn't uploaded yet, not a limit hit, not a copy of an existing preset.
                  const presetSaveBlock = uiThemeState.hasLocalImage ? "새로 고른 사진은 프로필을 저장한 뒤 프리셋에 담을 수 있어요"
                    : activeUiTheme ? "이미 같은 프리셋이 있어요"
                    : customUiThemes.length >= MAX_CUSTOM_UI_THEMES ? `프리셋은 ${MAX_CUSTOM_UI_THEMES}개까지 저장할 수 있어요` : null;
                  const pillStyle = (selected: boolean): CSSProperties => ({ background: selected ? "var(--primary)" : "var(--muted)", color: selected ? "#fff" : "inherit", borderRadius: "999px" });
                  return <div className="mt-4">
                    <div className="text-xs font-700 mb-1.5" style={{ color: "var(--muted-foreground)" }}>UI 테마 <span className="font-500">· 배경·카드 투명도·블러를 한 번에 바꿔요 (저장해야 적용)</span></div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[...UI_THEMES, ...customUiThemes].map((theme) => {
                        const selected = activeUiTheme?.id === theme.id;
                        const isCustom = "custom" in theme;
                        return (
                          <span key={theme.id} className="inline-flex items-center" style={pillStyle(selected)}>
                            <button type="button" onClick={() => applyUiTheme(theme)} className={`${isCustom ? "pl-3 pr-1.5" : "px-3"} py-1.5 text-xs font-700 inline-flex items-center gap-1.5`}>
                              <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: theme.swatch, border: "1px solid rgba(0,0,0,0.15)" }} />
                              {theme.label}
                            </button>
                            {isCustom && <button type="button" onClick={() => deleteCustomUiTheme(theme.id)} title="이 프리셋 삭제" className="pr-2.5 pl-0.5 py-1.5 text-xs opacity-70">×</button>}
                          </span>
                        );
                      })}
                      {!presetNaming && <button
                        type="button"
                        disabled={!!presetSaveBlock}
                        title={presetSaveBlock ?? "지금 배경·투명도·블러를 내 프리셋으로 저장"}
                        onClick={() => { setPresetName(`내 프리셋 ${customUiThemes.length + 1}`); setPresetNaming(true); }}
                        className="px-3 py-1.5 text-xs font-700"
                        style={{ ...pillStyle(false), border: "1px dashed var(--border)", opacity: presetSaveBlock ? 0.5 : 1, cursor: presetSaveBlock ? "not-allowed" : "pointer" }}
                      >＋ 프리셋 저장</button>}
                      {presetNaming && <span className="inline-flex items-center gap-1">
                        <input
                          autoFocus
                          value={presetName}
                          maxLength={12}
                          onChange={(e) => setPresetName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); saveCustomUiTheme(uiThemeState); } if (e.key === "Escape") setPresetNaming(false); }}
                          placeholder="프리셋 이름"
                          className="w-28 px-3 py-1.5 text-xs outline-none"
                          style={{ background: "var(--muted)", borderRadius: "999px", color: "var(--foreground)" }}
                        />
                        <button type="button" onClick={() => saveCustomUiTheme(uiThemeState)} className="px-2.5 py-1.5 text-xs font-700" style={{ background: "var(--primary)", color: "#fff", borderRadius: "999px" }}>저장</button>
                        <button type="button" onClick={() => setPresetNaming(false)} className="px-2 py-1.5 text-xs" style={{ background: "var(--muted)", borderRadius: "999px" }}>취소</button>
                      </span>}
                      {!activeUiTheme && <span className="px-2 text-[11px] font-700" style={{ color: "var(--muted-foreground)" }}>직접 설정 중</span>}
                    </div>
                  </div>;
                })()}
                {isSelfProfile && profileEditOpen && <div className="mt-4">
                  <div className="text-[11px] font-700 mb-1" style={{ color: "var(--muted-foreground)" }}>배경화면 · 세부 조정</div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {BACKGROUND_PRESETS.map((preset) => {
                      const selected = preset.kind === "gradient" ? backgroundGradient === preset.value : backgroundColor === preset.value;
                      return <button key={preset.label} type="button" onClick={() => pickBackgroundPreset(preset)} title={preset.label} className="w-6 h-6 shrink-0" style={{ background: preset.value, borderRadius: "999px", border: selected ? "2px solid #111827" : "1px solid var(--border)" }} />;
                    })}
                    <label title="배경 사진 업로드" className="w-6 h-6 flex items-center justify-center cursor-pointer text-sm shrink-0" style={{ background: "var(--muted)", borderRadius: "999px" }}>
                      🖼️<input type="file" accept={PROFILE_IMAGE_MIME_TYPES.join(",")} onChange={handleBackgroundPick} className="hidden" />
                    </label>
                    <button type="button" onClick={resetBackground} title="기본값으로" className="w-6 h-6 text-xs shrink-0" style={{ background: "var(--muted)", borderRadius: "999px" }}>↺</button>
                  </div>
                  <div
                    className="w-full h-12"
                    style={
                      backgroundPreview || editorImageUrl
                        ? { backgroundImage: `url(${backgroundPreview ?? editorImageUrl})`, backgroundSize: "cover", backgroundPosition: "center", borderRadius: "10px" }
                        : { background: backgroundGradient ?? backgroundColor ?? "var(--background)", borderRadius: "10px", border: "1px solid var(--border)" }
                    }
                  />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-[11px] font-700" style={{ color: "var(--muted-foreground)" }}>
                      카드 반투명도 {glassOpacity}%
                      <input type="range" min={20} max={100} step={2} value={glassOpacity} onChange={(e) => setGlassOpacity(Number(e.target.value))} className="w-full mt-1" />
                    </label>
                    <label className="text-[11px] font-700" style={{ color: "var(--muted-foreground)" }}>
                      배경 블러 {glassBlur}px
                      <input type="range" min={0} max={40} step={2} value={glassBlur} onChange={(e) => setGlassBlur(Number(e.target.value))} className="w-full mt-1" />
                    </label>
                  </div>
                </div>}
                {isSelfProfile && profileEditOpen && <div className="mt-4">
                  <div className="text-xs font-700 mb-1.5" style={{ color: "var(--muted-foreground)" }}>카드 효과 테마</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PROFILE_CARD_THEMES.filter((theme) => canUseTheme(theme, themeViewer) || previewAll).map((theme) => {
                      const locked = !previewAll && !!theme.unlockedBy && !earnedIds?.has(theme.unlockedBy);
                      const requirement = theme.unlockedBy ? ACHIEVEMENTS.find((a) => a.id === theme.unlockedBy) : undefined;
                      const selected = profileThemeId === theme.id && !locked;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          disabled={locked}
                          title={locked && requirement ? `"${requirement.label}" 도전과제를 달성하면 열려요` : requirement ? `"${requirement.label}" 도전과제 보상` : undefined}
                          onClick={() => setProfileThemeId(theme.id)}
                          className="px-3 py-1.5 text-xs font-700 inline-flex items-center gap-1.5"
                          style={{ background: selected ? "var(--primary)" : "var(--muted)", color: selected ? "#fff" : "inherit", borderRadius: "999px", opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "pointer" }}
                        >
                          {theme.palette && <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: `linear-gradient(135deg, ${theme.palette.c1}, ${theme.palette.c2})` }} />}
                          {theme.label}{locked && " 🔒"}
                        </button>
                      );
                    })}
                  </div>
                </div>}
                {isSelfProfile && profileEditOpen && <div className="flex gap-2 mt-4"><button type="button" onClick={() => { closeMemberProfile(); setPasswordOpen(true); }} className="px-3 py-2 text-xs font-700" style={{ background: "var(--muted)", borderRadius: "10px" }}>비밀번호 변경</button><button type="button" onClick={saveProfile} disabled={savingProfile} className="px-3 py-2 text-xs font-700" style={{ background: "var(--primary)", color: "#fff", borderRadius: "10px" }}>{savingProfile ? "저장 중…" : "저장"}</button></div>}
                {profileError && <p className="text-xs mt-2" style={{ color: "#ef4444" }}>{profileError}</p>}
              </section>
              {isSelfProfile ? (
                <MyEvaluationSummary chart />
              ) : (
                <section aria-label={`${viewedMember.name} 평가 요약`} className="p-4 mb-5" style={{ background: "var(--card)", borderRadius: "var(--radius)" }}>
                  <h2 className="text-sm font-700 mb-3">협업 신뢰도</h2>
                  {otherStats && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>프로젝트 참여 횟수</div>
                        <strong className="text-base">{otherStats.projectCount}회</strong>
                      </div>
                      <div>
                        <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>함께한 동료</div>
                        <strong className="text-base">{otherStats.collaboratorCount}명</strong>
                      </div>
                    </div>
                  )}
                  {viewedMember.evalCount > 0 ? (
                    <>
                      <div className="flex items-baseline gap-1.5 mb-3">
                        <strong className="text-xl" style={{ color: "var(--primary)" }}>{viewedMember.score.toFixed(1)}</strong>
                        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>/ 10 · {collaborationTrust(viewedMember.score, viewedMember.evalCount).label}</span>
                      </div>
                      <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>{collaborationTrust(viewedMember.score, viewedMember.evalCount).evidence}</p>
                      <div className="flex justify-center">
                        <PentagonChart
                          size={290}
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
          {isSelfProfile && profileTheme.decoration && <CardDecoration kind={profileTheme.decoration} layer="front" />}
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
