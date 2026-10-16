import { useEffect, useState } from "react";
import { useProject } from "../context/ProjectContext";
import type { MyEvaluationSummary as Summary } from "../lib/evaluationSummary";
import { ACHIEVEMENTS, TIERS, achievementProgress, bestEarnedAchievement, formatAchievementValue, subTierIndex, tierFor, tierUpperBound } from "../lib/achievements";
import { PROFILE_CARD_THEMES } from "../lib/profileThemes";
import MedalIcon from "./MedalIcon";
import AchievementBadge from "./AchievementBadge";

const cardStyle = {
  background: "var(--card-glass)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow-card)",
  backdropFilter: "var(--panel-blur)",
  WebkitBackdropFilter: "var(--panel-blur)",
} as const;

export default function Achievements() {
  const { getMyEvaluationSummary, currentMember, projects } = useProject();
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const projectKey = projects.map((p) => p.id + p.status).join(",");

  useEffect(() => {
    let active = true;
    setResult(null); setError(false);
    getMyEvaluationSummary().then((value) => { if (active) setResult(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [currentMember?.userId, currentMember?.evalCount, currentMember?.score, projectKey, retry]);

  const tier = result ? tierFor(result.score) : null;
  const tierIndex = tier ? TIERS.findIndex((t) => t.id === tier.id) : -1;
  const shownId = result ? bestEarnedAchievement(result)?.achievement.id : null;
  // How far through the current tier's whole span (not just the current
  // sub-stage) the score sits — the "where am I right now" indicator.
  const tierSpanPct =
    tier && result?.score != null
      ? Math.max(0, Math.min(100, ((result.score - tier.min) / (tierUpperBound(tierIndex) - tier.min)) * 100))
      : null;

  return (
    <div>
      <h1 className="text-xl font-800 mb-1">업적</h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>내 평판 등급과 도전과제를 확인해요. 100%를 채우면 뱃지를 획득하고, 가장 돋보이는 뱃지가 프로필에 자동으로 표시돼요.</p>

      {error ? <p role="alert" className="text-sm">업적 정보를 불러오지 못했습니다. <button onClick={() => setRetry((n) => n + 1)}>다시 시도</button></p>
        : !result ? <p role="status" className="text-sm">불러오는 중…</p>
        : <>
          <section className="p-5 mb-6" style={cardStyle}>
            <div className="text-sm font-700 mb-4">
              내 등급: <span style={{ color: tier?.color ?? "var(--foreground)" }}>{tier ? tier.label : "평가 공개 대기"}</span>
            </div>
            <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
              {TIERS.map((t, i) => {
                const reached = tierIndex >= i;
                const isCurrent = tierIndex === i;
                const currentSub = isCurrent && result.score !== null ? subTierIndex(result.score, i) : -1;
                const showPips = i < TIERS.length - 1;
                return (
                  <div key={t.id} className="flex items-center shrink-0">
                    <div className="flex flex-col items-center gap-1 px-1">
                      <div style={{ opacity: reached ? 1 : 0.35, transform: isCurrent ? "scale(1.3)" : "scale(1)", transition: "transform .2s" }}>
                        <MedalIcon shape={t.shape} colors={t.colors} size={isCurrent ? 36 : 26} />
                      </div>
                      <span className="text-[10px] font-700 whitespace-nowrap" style={{ color: isCurrent ? t.color : "var(--muted-foreground)" }}>{t.label}</span>
                    </div>
                    {showPips && (
                      <div className="flex items-center gap-1 mx-1">
                        {[0, 1, 2].map((subIdx) => {
                          const filled = tierIndex > i || (isCurrent && currentSub >= subIdx);
                          const isCurrentSub = isCurrent && currentSub === subIdx;
                          return (
                            <span
                              key={subIdx}
                              className="rounded-full shrink-0"
                              style={{
                                width: isCurrentSub ? 9 : 6,
                                height: isCurrentSub ? 9 : 6,
                                background: filled ? t.color : "var(--border)",
                                boxShadow: isCurrentSub ? `0 0 0 2px ${t.color}44` : undefined,
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {tierSpanPct !== null && tier && (
              <div className="relative mt-3 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${tierSpanPct}%`, background: `linear-gradient(90deg, ${tier.colors[0]}, ${tier.colors[1]})`, transition: "width .3s" }}
                />
                {/* Sub-stage boundaries, so the fill's position within the
                    tier reads against the same 3 checkpoints as the pips
                    above. */}
                {[33.333, 66.666].map((mark) => (
                  <span key={mark} className="absolute top-0 bottom-0" style={{ left: `${mark}%`, width: 1, background: "rgba(255,255,255,0.55)" }} />
                ))}
                {/* "You are here" handle. */}
                <span
                  className="absolute top-1/2 rounded-full"
                  style={{
                    left: `${tierSpanPct}%`,
                    width: 10,
                    height: 10,
                    background: "#fff",
                    border: `2px solid ${tier.color}`,
                    transform: "translate(-50%, -50%)",
                    boxShadow: "0 1px 3px rgba(15,18,53,.4)",
                    transition: "left .3s",
                  }}
                />
              </div>
            )}
            {tier && result.score !== null ? (
              <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>
                {(() => {
                  const nextThreshold = tier.min + ((tierUpperBound(tierIndex) - tier.min) / 3) * (subTierIndex(result.score!, tierIndex) + 1);
                  const remaining = Math.max(0, nextThreshold - result.score!);
                  return remaining > 0
                    ? `다음 단계까지 ${remaining.toFixed(1)}점 (평가 평균 ${result.score!.toFixed(1)} / 10 기준)`
                    : `최고 단계 달성 (평가 평균 ${result.score!.toFixed(1)} / 10 기준)`;
                })()}
              </p>
            ) : (
              <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>최종 평가 평균이 공개되면 등급이 매겨져요</p>
            )}
          </section>

          <h2 className="text-sm font-700 mb-3">도전과제</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ACHIEVEMENTS.map((achievement) => {
              const { value, pct, earned } = achievementProgress(achievement, result);
              const shown = shownId === achievement.id;
              return (
                <div
                  key={achievement.id}
                  className="p-4 flex flex-col items-center text-center"
                  style={{ ...cardStyle, outline: shown ? `2px solid ${achievement.colors[1]}` : undefined, outlineOffset: shown ? -2 : undefined }}
                >
                  <AchievementBadge achievement={achievement} earned={earned} label={achievement.label} size={76} />
                  <div className="w-full mt-4">
                    <div className="flex items-center justify-between text-xs font-800 mb-1">
                      <span style={{ color: earned ? achievement.colors[1] : "var(--muted-foreground)" }}>{pct}%</span>
                      <span style={{ color: "var(--muted-foreground)" }}>{formatAchievementValue(value)}{achievement.unit} / {formatAchievementValue(achievement.threshold)}{achievement.unit}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: earned ? achievement.colors[1] : "var(--muted-foreground)" }} />
                    </div>
                  </div>
                  <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>{achievement.description}</p>
                  {shown && <p className="text-xs font-700 mt-2" style={{ color: achievement.colors[1] }}>프로필에 표시 중</p>}
                  {PROFILE_CARD_THEMES.filter((theme) => theme.unlockedBy === achievement.id).map((theme) => (
                    <p key={theme.id} className="text-xs font-700 mt-2" style={{ color: earned ? achievement.colors[1] : "var(--muted-foreground)" }}>
                      {earned ? "🎁 보상 획득" : "🔒 보상"} · 프로필 카드 효과 &ldquo;{theme.label}&rdquo;
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </>}
    </div>
  );
}
