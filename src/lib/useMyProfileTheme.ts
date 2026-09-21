import { useEffect, useState } from "react";
import { useProject, useProjectManagement } from "../context/ProjectContext";
import {
  ACHIEVEMENTS,
  achievementProgress,
  bestEarnedAchievement,
  tierFor,
  type Achievement,
  type AchievementProgress,
  type Tier,
} from "./achievements";
import {
  DEFAULT_PROFILE_THEME_ID,
  canUseTheme,
  getProfileCardTheme,
  loadProfileThemeId,
  previewAllThemes,
  saveProfileThemeId,
} from "./profileThemes";

// Shared by Sidebar (small nav avatar) and ProfileModal (full card) so both
// resolve the signed-in member's tier/theme/avatar-frame the same way,
// instead of each re-deriving it from a separately-fetched evaluation
// summary. `bestEarnedAchievement`/`earnedIds` need the full summary (not
// just score), so this fetches it once per mount and on score/evalCount
// change, same as the effect this was extracted from.
export function useMyProfileTheme() {
  const { currentMember, getMyEvaluationSummary } = useProject();
  const { isAdmin } = useProjectManagement();

  const [myTier, setMyTier] = useState<Tier | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [myBadge, setMyBadge] = useState<{ achievement: Achievement; progress: AchievementProgress } | null>(null);
  const [earnedIds, setEarnedIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let active = true;
    getMyEvaluationSummary().then((summary) => {
      if (!active) return;
      setMyTier(tierFor(summary.score));
      setMyScore(summary.score);
      setMyBadge(bestEarnedAchievement(summary));
      setEarnedIds(new Set(ACHIEVEMENTS.filter((a) => achievementProgress(a, summary).earned).map((a) => a.id)));
    }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMember?.userId, currentMember?.evalCount, currentMember?.score]);

  const [profileThemeId, setProfileThemeIdState] = useState(loadProfileThemeId);
  function setProfileThemeId(id: string) {
    setProfileThemeIdState(id);
    saveProfileThemeId(id);
  }
  const requestedTheme = getProfileCardTheme(profileThemeId);
  const [previewAll] = useState(previewAllThemes);
  const themeViewer = { isAdmin, userId: currentMember?.userId };
  const profileTheme = !previewAll && ((requestedTheme.unlockedBy && earnedIds && !earnedIds.has(requestedTheme.unlockedBy)) || !canUseTheme(requestedTheme, themeViewer))
    ? getProfileCardTheme(DEFAULT_PROFILE_THEME_ID)
    : requestedTheme;

  const cardTierId = myTier?.id ?? "bronze";
  const cardHasEffects = !!myTier || !!profileTheme.palette;
  const cardC1 = profileTheme.palette?.c1 ?? myTier?.colors[0];
  const cardC2 = profileTheme.palette?.c2 ?? myTier?.colors[1];
  const cardGlow = `${profileTheme.palette?.c2 ?? myTier?.color}aa`;
  const avatarFrame = cardHasEffects ? profileTheme.avatarFrame : undefined;

  return {
    myTier, myScore, myBadge, earnedIds, previewAll, themeViewer,
    profileThemeId, setProfileThemeId, profileTheme,
    cardTierId, cardHasEffects, cardC1, cardC2, cardGlow, avatarFrame,
  };
}
