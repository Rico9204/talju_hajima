import { useEffect, useState, useMemo } from "react";
import type { NoticeItem, NoticeCategory, ScrappedNotice } from "../lib/crawler/types";
import { SCHOOL_REGISTRY } from "../lib/crawler/schoolsRegistry";
import { NoticeSortOption, NOTICE_SORT_OPTIONS, sortNotices } from "../lib/crawler/noticeSort";
import { POSTER_WIDTH, needsPosterPlaceholder, optimizedPosterUrl } from "../lib/crawler/posterImage";
import { createNoticeCache } from "../lib/crawler/noticeCache";
import { useOptionalProject, useProjectManagement } from "../context/ProjectContext";
import SchoolSearchCombobox from "./SchoolSearchCombobox";
import WindowPanel from "./WindowPanel";

// 링크는 http(s)만 연다 — 스크랩은 DB에서 오고, 수집 결과도 외부 페이지에서 오므로 화면에서 한 번 더 막는다.
const safeLink = (link: string) => (/^https?:\/\//i.test(link) ? link : undefined);

const noticeCache = createNoticeCache();

// 줄인 이미지를 먼저 쓰고, 실패하면 원본으로 다시 받는다. 원본도 실패해야 이미지 칸을 숨긴다.
function PosterImage({ src, alt, width, className }: { src: string; alt: string; width: number; className: string }) {
  const [useOriginal, setUseOriginal] = useState(false);
  const optimized = optimizedPosterUrl(src, width);
  return (
    <img
      src={useOriginal ? src : optimized}
      alt={alt}
      loading="lazy"
      className={className}
      onError={(e) => {
        if (!useOriginal && optimized !== src) setUseOriginal(true);
        else (e.currentTarget.parentElement as HTMLElement)?.style.setProperty("display", "none");
      }}
    />
  );
}

// 카드 격자의 열 수. grid-cols-1 md:grid-cols-2 lg:grid-cols-3과 같은 기준이다.
function useCardColumns() {
  const [medium] = useState(() => window.matchMedia("(min-width: 48rem)"));
  const [large] = useState(() => window.matchMedia("(min-width: 64rem)"));
  const read = () => (large.matches ? 3 : medium.matches ? 2 : 1);
  const [columns, setColumns] = useState(read);
  useEffect(() => {
    const update = () => setColumns(read());
    update();
    medium.addEventListener("change", update);
    large.addEventListener("change", update);
    return () => {
      medium.removeEventListener("change", update);
      large.removeEventListener("change", update);
    };
  }, []);
  return columns;
}

const CATEGORY_TABS: { id: NoticeCategory | "scrapped"; label: string; icon: string }[] = [
  { id: "all", label: "전체 소식", icon: "🌐" },
  { id: "contest", label: "공모전·대외활동", icon: "💡" },
  { id: "job", label: "채용·취업", icon: "💼" },
  { id: "general", label: "학사·장학", icon: "🎓" },
  { id: "scrapped", label: "내 스크랩", icon: "⭐" },
];

export interface CampusNoticesViewProps {
  onRecruitFromNotice?: (notice: { title: string; link: string; schoolName: string; thumbnail?: string }) => void;
}

export default function CampusNoticesView({ onRecruitFromNotice }: CampusNoticesViewProps = {}) {
  // 프로젝트가 없어도(첫 화면) 볼 수 있다: 소식 함수는 늘 있는 관리 컨텍스트에서, 내 학교는 팀원 정보가 있을 때만.
  const { fetchCampusNotices, listScrappedNotices, toggleScrapNotice } = useProjectManagement();
  const currentMember = useOptionalProject()?.currentMember ?? null;

  // Selected school (defaults to member's school if available, otherwise "전국")
  const defaultSchool = currentMember?.school || "전국 공모전·취업 Pick";
  const [selectedSchool, setSelectedSchool] = useState<string>(defaultSchool);
  const [activeTab, setActiveTab] = useState<NoticeCategory | "scrapped">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<NoticeSortOption>("latest");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const cardColumns = useCardColumns();

  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [scrappedList, setScrappedList] = useState<ScrappedNotice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPoster, setPreviewPoster] = useState<{ src: string; title: string; link: string } | null>(null);

  // Load scrapped notices
  async function loadScrapped() {
    try {
      const data = await listScrappedNotices();
      setScrappedList(data);
    } catch {
      // Ignored if user not logged in
    }
  }

  useEffect(() => {
    void loadScrapped();
  }, []);

  // Fetch notices when school or category changes
  useEffect(() => {
    if (activeTab === "scrapped") {
      // 수집 중에 스크랩 탭으로 오면 앞선 요청이 취소되어 로딩 표시가 남는다.
      setLoading(false);
      return;
    }

    const cached = noticeCache.get(selectedSchool, activeTab);
    if (cached) {
      setNotices(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCampusNotices({
      school: selectedSchool,
      category: activeTab,
    })
      .then((items) => {
        noticeCache.set(selectedSchool, activeTab, items);
        if (!cancelled) {
          if (items.length === 0 && activeTab !== "all") {
            // 선택된 카테고리의 소식이 0개인 경우 전체 탭으로 자동 전환하여 빈 화면 방지
            fetchCampusNotices({ school: selectedSchool, category: "all" })
              .then((allItems) => {
                if (!cancelled) {
                  setNotices(allItems);
                  setActiveTab("all");
                }
              })
              .catch(() => setNotices([]));
          } else {
            setNotices(items);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "소식을 불러오는데 실패했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSchool, activeTab]);

  // Handle scrap toggle
  async function handleToggleScrap(notice: NoticeItem) {
    try {
      await toggleScrapNotice(notice);
      await loadScrapped();
    } catch {
      alert("로그인이 필요하거나 스크랩 처리에 실패했습니다.");
    }
  }

  // Check if a notice is scrapped
  const scrappedLinks = useMemo(() => new Set(scrappedList.map((s) => s.link)), [scrappedList]);

  // Filtered list (search query + category)
  const displayedNotices = useMemo(() => {
    let list: NoticeItem[] = [];

    if (activeTab === "scrapped") {
      list = scrappedList.map((s) => ({
        id: s.id,
        schoolCode: s.schoolCode,
        schoolName: s.schoolName,
        category: s.category,
        title: s.title,
        author: s.author,
        postDate: s.postDate,
        link: s.link,
        thumbnail: s.thumbnail,
      }));
    } else {
      list = notices;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.author.toLowerCase().includes(q) ||
          n.schoolName.toLowerCase().includes(q)
      );
    }

    return sortNotices(list, sortBy);
  }, [notices, scrappedList, activeTab, searchQuery, sortBy]);

  const cardStyle = { background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" } as const;
  const chipOff = { background: "rgba(15,18,53,.05)", color: "var(--foreground)" } as const;
  const lightBtn = { background: "rgba(15,18,53,.06)", color: "var(--foreground)", borderRadius: "20px" } as const;
  const dDayChip = { background: "rgba(201,98,91,.12)", color: "#8f3a35", borderRadius: "10px" } as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-800 flex items-center gap-2"><span>🎓</span> 캠퍼스 소식 · 공모전·취업</h1>
          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
            대학교 공지사항과 전국의 알짜 공모전·채용 소식을 한곳에서 모아보고, 공모전에 함께할 팀원을 모집해보세요.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            id="campus-notices-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as NoticeSortOption)}
            aria-label="소식 정렬 순서"
            className="text-xs px-3 py-2 outline-none cursor-pointer font-700"
            style={{ ...chipOff, borderRadius: "20px" }}
          >
            {NOTICE_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ background: "var(--card)", color: "var(--foreground)" }}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            {([["card", "카드 보기", "▦"], ["list", "목록 보기", "≡"]] as const).map(([mode, label, glyph]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                aria-label={label}
                aria-pressed={viewMode === mode}
                className="w-8 h-8 text-xs font-700 cursor-pointer"
                style={{ ...(viewMode === mode ? { background: "var(--primary)", color: "#fff" } : chipOff), borderRadius: "20px" }}
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 출처 선택 · 분류 칩 · 검색 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="shrink-0">
          <SchoolSearchCombobox
            selectedSchool={selectedSchool}
            onSelectSchool={(school) => {
              setSelectedSchool(school);
              setSearchQuery("");
            }}
            mySchool={currentMember?.school}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-3.5 py-2 text-xs font-700 whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5"
                style={{ ...(isActive ? { background: "var(--primary)", color: "#fff" } : chipOff), borderRadius: "20px" }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}{tab.id === "scrapped" ? ` ${scrappedList.length}` : ""}</span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-60 sm:ml-auto shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 작성부서 검색…"
            aria-label="소식 검색"
            className="w-full pl-8 pr-3.5 py-2 text-xs outline-none"
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "20px", color: "var(--foreground)" }}
          />
          <span className="absolute left-3 top-2 text-xs opacity-50">🔍</span>
        </div>
      </div>

      {/* Main Notice Feed */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-5 space-y-3 animate-pulse" style={cardStyle}>
              <div className="h-4 w-24 bg-current opacity-10 rounded" />
              <div className="h-5 w-3/4 bg-current opacity-15 rounded" />
              <div className="h-3 w-1/2 bg-current opacity-10 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center space-y-3" style={cardStyle}>
          <div className="text-2xl">⚠️</div>
          <div className="text-sm font-700" style={{ color: "#8f3a35" }}>{error}</div>
          <button
            onClick={() => setSelectedSchool((prev) => prev)}
            className="px-4 py-1.5 text-xs font-700"
            style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}
          >
            다시 시도
          </button>
        </div>
      ) : displayedNotices.length === 0 ? (
        <div className="p-12 text-center space-y-2" style={cardStyle}>
          <div className="text-3xl">📭</div>
          <div className="text-sm font-700">해당 조건의 소식이 없습니다.</div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            다른 카테고리를 선택하거나 검색어를 변경해 보세요.
          </p>
        </div>
      ) : viewMode === "card" ? (
        /* Card Grid View: 소식 하나가 창 하나 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedNotices.map((notice, idx) => {
            const isScrapped = scrappedLinks.has(notice.link);
            return (
              <WindowPanel
                key={`${notice.id || notice.link}-${idx}`}
                id={`campus-notice-${idx}`}
                title={`${notice.categoryLabel || notice.category} · ${notice.schoolName}`}
                className="flex flex-col"
                bodyClassName="flex flex-col flex-1"
                style={cardStyle}
              >
                {/* 포스터 */}
                {notice.thumbnail && (
                  <div
                    className="relative w-full h-44 overflow-hidden bg-black/5 dark:bg-white/5 cursor-pointer group/img"
                    onClick={() => setPreviewPoster({ src: notice.thumbnail!, title: notice.title, link: notice.link })}
                    title="포스터 크게 보기"
                  >
                    <PosterImage
                      key={notice.thumbnail}
                      src={notice.thumbnail}
                      alt={notice.title}
                      width={POSTER_WIDTH.card}
                      className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-700 backdrop-blur-[1px]">
                      <span>🔍 포스터 크게 보기</span>
                    </div>
                  </div>
                )}
                {needsPosterPlaceholder(displayedNotices, idx, cardColumns) && (
                  <div aria-hidden="true" className="w-full h-44 flex items-center justify-center text-4xl bg-black/5 dark:bg-white/5">
                    <span className="opacity-40">{CATEGORY_TABS.find((tab) => tab.id === notice.category)?.icon ?? "🌐"}</span>
                  </div>
                )}
                <div className="p-4 flex flex-col flex-1 min-h-[150px]">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-700 leading-snug line-clamp-2">{notice.title}</h3>
                    <button
                      onClick={() => void handleToggleScrap(notice)}
                      title={isScrapped ? "스크랩 취소" : "스크랩하기"}
                      aria-label={isScrapped ? "스크랩 취소" : "스크랩하기"}
                      className="text-base leading-none transition-transform active:scale-90 cursor-pointer shrink-0"
                    >
                      {isScrapped ? "⭐" : "☆"}
                    </button>
                  </div>
                  {(notice.dDay || notice.isPinned) && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {notice.dDay && <span className="text-[11px] font-700 px-2 py-0.5" style={dDayChip}>{notice.dDay}</span>}
                      {notice.isPinned && <span className="text-[11px] font-700 px-2 py-0.5" style={{ background: "rgba(214,154,78,.16)", color: "#7a4f12", borderRadius: "10px" }}>📌 공지</span>}
                    </div>
                  )}
                  {notice.summary && (
                    <p className="text-xs line-clamp-2 leading-relaxed mt-2" style={{ color: "var(--muted-foreground)" }}>
                      {notice.summary}
                    </p>
                  )}
                  <div className="text-[11px] mt-2 mb-auto" style={{ color: "var(--muted-foreground)" }}>
                    <span className="truncate">{notice.author}</span> · {notice.postDate}
                  </div>
                  <div className="flex items-center gap-2 pt-3">
                    <a
                      href={safeLink(notice.link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-3.5 text-xs font-700 transition-all hover:opacity-80"
                      style={lightBtn}
                    >
                      원문 보기 ↗
                    </a>
                    {/* 공모전 카테고리인 경우에만 게시판 팀원 모집 연동 버튼 노출 */}
                    {notice.category === "contest" && onRecruitFromNotice && (
                      <button
                        onClick={() => onRecruitFromNotice(notice)}
                        title="이 공모전으로 게시판에서 팀원 모집하기"
                        className="py-1.5 px-3.5 text-xs font-700 transition-all flex items-center gap-1 cursor-pointer hover:opacity-90 active:scale-95"
                        style={{ background: "var(--primary)", color: "#ffffff", borderRadius: "20px" }}
                      >
                        <span>🚀</span>
                        <span>팀원 모집</span>
                      </button>
                    )}
                  </div>
                </div>
              </WindowPanel>
            );
          })}
        </div>
      ) : (
        /* Compact List View */
        <WindowPanel id="campus-notices-list" title={`소식 ${displayedNotices.length}`} style={cardStyle}>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {displayedNotices.map((notice, idx) => {
              const isScrapped = scrappedLinks.has(notice.link);
              return (
                <div
                  key={`${notice.id || notice.link}-${idx}`}
                  className="p-3.5 sm:px-5 flex items-center justify-between gap-4 transition-colors hover:bg-[rgba(74,116,181,.06)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => void handleToggleScrap(notice)}
                      className="text-base shrink-0 cursor-pointer leading-none"
                      title={isScrapped ? "스크랩 취소" : "스크랩"}
                      aria-label={isScrapped ? "스크랩 취소" : "스크랩"}
                    >
                      {isScrapped ? "⭐" : "☆"}
                    </button>
                    {notice.thumbnail && (
                      <div
                        className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border bg-black/5 dark:bg-white/5 cursor-pointer hover:opacity-85 transition-opacity"
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => setPreviewPoster({ src: notice.thumbnail!, title: notice.title, link: notice.link })}
                        title="포스터 크게 보기"
                      >
                        <PosterImage
                          key={notice.thumbnail}
                          src={notice.thumbnail}
                          alt={notice.title}
                          width={POSTER_WIDTH.list}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-700 px-2 py-0.5" style={{ background: "rgba(15,18,53,.06)", color: "var(--muted-foreground)", borderRadius: "10px" }}>
                          {notice.categoryLabel || notice.category}
                        </span>
                        <span className="text-[10px] truncate" style={{ color: "var(--muted-foreground)" }}>{notice.schoolName}</span>
                      </div>
                      <a
                        href={safeLink(notice.link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm font-700 truncate block hover:underline"
                      >
                        {notice.title}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs hidden sm:inline" style={{ color: "var(--muted-foreground)" }}>{notice.postDate}</span>
                    {/* 공모전 카테고리인 경우에만 게시판 팀원 모집 연동 버튼 노출 */}
                    {notice.category === "contest" && onRecruitFromNotice && (
                      <button
                        onClick={() => onRecruitFromNotice(notice)}
                        title="게시판에서 팀원 모집하기"
                        className="px-3 py-1 text-xs font-700 transition-all flex items-center gap-1 cursor-pointer hover:opacity-90 active:scale-95"
                        style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}
                      >
                        <span>🚀</span>
                        <span className="hidden sm:inline">팀원 모집</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </WindowPanel>
      )}

    {/* Poster Preview Modal */}
    {previewPoster && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={() => setPreviewPoster(null)}
      >
        <div
          className="relative max-w-2xl w-full max-h-[90vh] flex flex-col p-4 space-y-3"
          style={{
            background: "var(--card)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-sm font-800 line-clamp-1">{previewPoster.title}</h3>
            <button
              onClick={() => setPreviewPoster(null)}
              className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-sm font-700 cursor-pointer"
              title="닫기"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-auto flex items-center justify-center rounded-lg bg-black/5 dark:bg-white/5 min-h-[250px] max-h-[65vh]">
            <PosterImage
              key={previewPoster.src}
              src={previewPoster.src}
              alt={previewPoster.title}
              width={POSTER_WIDTH.preview}
              className="max-h-[65vh] w-auto object-contain rounded-md shadow-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              💡 포스터 이미지 미리보기
            </span>
            <div className="flex items-center gap-2">
              <a
                href={safeLink(previewPoster.link)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-700 rounded-lg border transition-all hover:bg-black/5 dark:hover:bg-white/5"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                공지 원문 보기 ↗
              </a>
              <button
                onClick={() => setPreviewPoster(null)}
                className="px-4 py-1.5 text-xs font-700 rounded-lg cursor-pointer"
                style={{ background: "var(--primary)", color: "#ffffff" }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
