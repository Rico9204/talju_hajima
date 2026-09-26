import { useEffect, useState, useMemo } from "react";
import type { NoticeItem, NoticeCategory, ScrappedNotice } from "../lib/crawler/types";
import { SCHOOL_REGISTRY } from "../lib/crawler/schoolsRegistry";
import { useProject } from "../context/ProjectContext";
import SchoolSearchCombobox from "./SchoolSearchCombobox";

const CATEGORY_TABS: { id: NoticeCategory | "scrapped"; label: string; icon: string }[] = [
  { id: "all", label: "전체 소식", icon: "🌐" },
  { id: "contest", label: "공모전·대외활동", icon: "💡" },
  { id: "job", label: "채용·취업", icon: "💼" },
  { id: "general", label: "학사·장학", icon: "🎓" },
  { id: "scrapped", label: "내 스크랩", icon: "⭐" },
];

export interface CampusNoticesViewProps {
  onRecruitFromNotice?: (notice: { title: string; link: string; schoolName: string }) => void;
}

export default function CampusNoticesView({ onRecruitFromNotice }: CampusNoticesViewProps = {}) {
  const { currentMember, fetchCampusNotices, listScrappedNotices, toggleScrapNotice } = useProject();

  // Selected school (defaults to member's school if available, otherwise "전국")
  const defaultSchool = currentMember?.school || "전국 공모전·취업 Pick";
  const [selectedSchool, setSelectedSchool] = useState<string>(defaultSchool);
  const [activeTab, setActiveTab] = useState<NoticeCategory | "scrapped">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");

  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [scrappedList, setScrappedList] = useState<ScrappedNotice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (activeTab === "scrapped") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCampusNotices({
      school: selectedSchool,
      category: activeTab,
    })
      .then((items) => {
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
      }));
    } else {
      list = notices;
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.author.toLowerCase().includes(q) ||
        n.schoolName.toLowerCase().includes(q)
    );
  }, [notices, scrappedList, activeTab, searchQuery]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header Card */}
      <div
        className="p-6 md:p-8 space-y-4"
        style={{
          background: "var(--card-glass)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card)",
          backdropFilter: "var(--panel-blur)",
          WebkitBackdropFilter: "var(--panel-blur)",
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🎓</span>
              <h1 className="text-xl md:text-2xl font-800 tracking-tight">캠퍼스 소식 & 공모전·취업</h1>
            </div>
            <p className="text-xs md:text-sm" style={{ color: "var(--muted-foreground)" }}>
              대학교 공지사항과 전국의 알짜 공모전·채용 소식을 한곳에서 모아보고, 공모전에 함께할 팀원을 모집해보세요.
            </p>
          </div>

          {/* School & Platform Selector Combobox */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 self-start md:self-auto shrink-0 w-full sm:w-auto">
            <span className="text-xs font-700 shrink-0" style={{ color: "var(--muted-foreground)" }}>
              소식 출처:
            </span>
            <SchoolSearchCombobox
              selectedSchool={selectedSchool}
              onSelectSchool={(school) => {
                setSelectedSchool(school);
                setSearchQuery("");
              }}
              mySchool={currentMember?.school}
            />
          </div>
        </div>

        {/* Category Tabs & Controls */}

        {/* Category Tabs & Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {CATEGORY_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const countBadge = tab.id === "scrapped" ? scrappedList.length : undefined;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-3 py-1.5 text-xs font-700 whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer"
                  style={{
                    background: isActive ? "var(--primary)" : "var(--muted)",
                    color: isActive ? "#ffffff" : "var(--foreground)",
                    borderRadius: "20px",
                    boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
                  }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {countBadge !== undefined && (
                    <span
                      className="px-1.5 py-0.2 text-[10px] rounded-full font-800"
                      style={{
                        background: isActive ? "rgba(255,255,255,0.25)" : "var(--border)",
                        color: isActive ? "#ffffff" : "var(--foreground)",
                      }}
                    >
                      {countBadge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search bar & View mode toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="제목, 작성부서 검색…"
                className="w-full pl-8 pr-3 py-1.5 text-xs outline-none"
                style={{
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "20px",
                  color: "var(--foreground)",
                }}
              />
              <span className="absolute left-2.5 top-2 text-xs opacity-50">🔍</span>
            </div>

            <div className="flex items-center bg-black/5 dark:bg-white/5 p-0.5 rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <button
                onClick={() => setViewMode("card")}
                title="카드 보기"
                className="p-1.5 text-xs rounded transition-all cursor-pointer"
                style={{
                  background: viewMode === "card" ? "var(--card)" : "transparent",
                  color: "var(--foreground)",
                }}
              >
                ▦
              </button>
              <button
                onClick={() => setViewMode("list")}
                title="목록 보기"
                className="p-1.5 text-xs rounded transition-all cursor-pointer"
                style={{
                  background: viewMode === "list" ? "var(--card)" : "transparent",
                  color: "var(--foreground)",
                }}
              >
                ≡
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Notice Feed */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="p-5 space-y-3 animate-pulse"
              style={{
                background: "var(--card)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="h-4 w-24 bg-current opacity-10 rounded" />
              <div className="h-5 w-3/4 bg-current opacity-15 rounded" />
              <div className="h-3 w-1/2 bg-current opacity-10 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          className="p-8 text-center space-y-3"
          style={{ background: "var(--card)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
        >
          <div className="text-2xl">⚠️</div>
          <div className="text-sm font-700" style={{ color: "#ef4444" }}>
            {error}
          </div>
          <button
            onClick={() => setSelectedSchool((prev) => prev)}
            className="px-4 py-1.5 text-xs font-700"
            style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}
          >
            다시 시도
          </button>
        </div>
      ) : displayedNotices.length === 0 ? (
        <div
          className="p-12 text-center space-y-3"
          style={{ background: "var(--card)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
        >
          <div className="text-3xl">📭</div>
          <div className="text-sm font-700">해당 조건의 소식이 없습니다.</div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            다른 카테고리를 선택하거나 검색어를 변경해 보세요.
          </p>
        </div>
      ) : viewMode === "card" ? (
        /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedNotices.map((notice, idx) => {
            const isScrapped = scrappedLinks.has(notice.link);

            return (
              <div
                key={`${notice.id || notice.link}-${idx}`}
                className="flex flex-col justify-between p-5 transition-all hover:translate-y-[-2px] hover:shadow-md border group"
                style={{
                  background: "var(--card)",
                  borderRadius: "var(--radius)",
                  borderColor: notice.isPinned ? "var(--primary)" : "var(--border)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div className="space-y-3">
                  {/* Card Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-[11px] font-800 px-2 py-0.5 rounded-full"
                        style={{
                          background:
                            notice.category === "contest"
                              ? "#f59e0b18"
                              : notice.category === "job"
                              ? "#22c55e18"
                              : "var(--muted)",
                          color:
                            notice.category === "contest"
                              ? "#f59e0b"
                              : notice.category === "job"
                              ? "#22c55e"
                              : "var(--foreground)",
                        }}
                      >
                        {notice.categoryLabel || notice.category}
                      </span>
                      <span
                        className="text-[11px] font-700 px-2 py-0.5 rounded-full"
                        style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                      >
                        {notice.schoolName}
                      </span>
                      {notice.dDay && (
                        <span className="text-[11px] font-800 px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">
                          {notice.dDay}
                        </span>
                      )}
                      {notice.isPinned && (
                        <span className="text-[10px] font-800 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">
                          📌 공지
                        </span>
                      )}
                    </div>

                    {/* Scrap Star Button */}
                    <button
                      onClick={() => void handleToggleScrap(notice)}
                      title={isScrapped ? "스크랩 취소" : "스크랩하기"}
                      className="p-1 text-base transition-transform active:scale-90 cursor-pointer"
                    >
                      {isScrapped ? "⭐" : "☆"}
                    </button>
                  </div>

                  {/* Card Title */}
                  <h3 className="text-sm font-700 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {notice.title}
                  </h3>

                  {/* Summary (if available) */}
                  {notice.summary && (
                    <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                      {notice.summary}
                    </p>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="pt-4 mt-4 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                    <span className="truncate max-w-[120px]">{notice.author}</span>
                    <span>{notice.postDate}</span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href={notice.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-1.5 px-3 text-center text-xs font-700 transition-all border hover:bg-black/5 dark:hover:bg-white/5"
                      style={{
                        borderColor: "var(--border)",
                        borderRadius: "8px",
                        color: "var(--foreground)",
                      }}
                    >
                      원문 보기 ↗
                    </a>

                    {/* 공모전 카테고리인 경우에만 게시판 팀원 모집 연동 버튼 노출 */}
                    {notice.category === "contest" && onRecruitFromNotice && (
                      <button
                        onClick={() => onRecruitFromNotice(notice)}
                        title="이 공모전으로 게시판에서 팀원 모집하기"
                        className="py-1.5 px-3 text-xs font-700 transition-all flex items-center justify-center gap-1 cursor-pointer hover:opacity-90 active:scale-95"
                        style={{
                          background: "var(--primary)",
                          color: "#ffffff",
                          borderRadius: "8px",
                        }}
                      >
                        <span>🚀</span>
                        <span>팀원 모집</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Compact List View */
        <div
          className="border divide-y overflow-hidden"
          style={{ background: "var(--card)", borderRadius: "var(--radius)", borderColor: "var(--border)" }}
        >
          {displayedNotices.map((notice, idx) => {
            const isScrapped = scrappedLinks.has(notice.link);

            return (
              <div
                key={`${notice.id || notice.link}-${idx}`}
                className="p-3.5 sm:px-5 flex items-center justify-between gap-4 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => void handleToggleScrap(notice)}
                    className="text-base shrink-0 cursor-pointer"
                    title={isScrapped ? "스크랩 취소" : "스크랩"}
                  >
                    {isScrapped ? "⭐" : "☆"}
                  </button>

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-800 px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10" style={{ color: "var(--muted-foreground)" }}>
                        {notice.categoryLabel || notice.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">{notice.schoolName}</span>
                    </div>
                    <a
                      href={notice.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs sm:text-sm font-700 truncate block hover:underline"
                    >
                      {notice.title}
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs hidden sm:inline" style={{ color: "var(--muted-foreground)" }}>
                    {notice.postDate}
                  </span>
                  {/* 공모전 카테고리인 경우에만 게시판 팀원 모집 연동 버튼 노출 */}
                  {notice.category === "contest" && onRecruitFromNotice && (
                    <button
                      onClick={() => onRecruitFromNotice(notice)}
                      title="게시판에서 팀원 모집하기"
                      className="px-2.5 py-1 text-xs font-700 transition-all flex items-center gap-1 cursor-pointer hover:opacity-90 active:scale-95"
                      style={{ background: "var(--primary)", color: "#fff", borderRadius: "6px" }}
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
      )}
    </div>
  );
}
