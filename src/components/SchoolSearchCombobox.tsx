import { useState, useRef, useEffect } from "react";
import { searchUniversities, UniversityItem, isContestPlatform } from "../lib/constants/koreanUniversities";

interface SchoolSearchComboboxProps {
  selectedSchool: string;
  onSelectSchool: (school: string) => void;
  mySchool?: string | null;
}

export default function SchoolSearchCombobox({
  selectedSchool,
  onSelectSchool,
  mySchool,
}: SchoolSearchComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter universities based on search term
  // When searchTerm is empty, returns contest platforms first. When searched, contest platforms are prioritized and matching universities are returned.
  const results = searchUniversities(searchTerm);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset active index when search term changes
  useEffect(() => {
    setActiveIndex(0);
  }, [searchTerm]);

  function handleSelect(schoolName: string) {
    onSelectSchool(schoolName);
    setSearchTerm("");
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % (results.length + (searchTerm.trim() ? 1 : 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev <= 0 ? (results.length + (searchTerm.trim() ? 1 : 0)) - 1 : prev - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (searchTerm.trim() && activeIndex === results.length) {
        // Custom typed school option
        handleSelect(searchTerm.trim());
      } else if (results[activeIndex]) {
        handleSelect(results[activeIndex].name);
      } else if (searchTerm.trim()) {
        handleSelect(searchTerm.trim());
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full sm:w-72">
      {/* Combobox Trigger / Input */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 transition-all cursor-text"
        style={{
          background: "var(--card)",
          border: isOpen ? "1.5px solid var(--primary)" : "1px solid var(--border)",
          borderRadius: "12px",
          boxShadow: isOpen ? "0 0 0 3px rgba(99, 102, 241, 0.15)" : "none",
        }}
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      >
        <span className="text-sm shrink-0" role="img" aria-label="source">
          {isContestPlatform(selectedSchool) ? "🌐" : "🏫"}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : selectedSchool}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setSearchTerm("");
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="대학교 검색 또는 공모전 사이트 선택..."
          className="w-full text-xs font-700 outline-none bg-transparent placeholder:text-muted-foreground"
          style={{ color: "var(--foreground)" }}
        />
        <div className="flex items-center gap-1 shrink-0">
          {isOpen && searchTerm && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSearchTerm("");
                inputRef.current?.focus();
              }}
              className="text-xs px-1 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              ✕
            </button>
          )}
          <span
            className="text-xs text-muted-foreground transition-transform"
            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-1.5 py-1.5 shadow-xl border overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
            borderRadius: "14px",
            maxHeight: "420px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
          }}
        >
          {/* Quick Shortcuts: My School */}
          {mySchool && (
            <div className="px-2 pb-1.5 mb-1 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="text-[10px] font-700 text-muted-foreground px-2 py-0.5">내 학교 바로가기</div>
              <button
                type="button"
                onClick={() => handleSelect(mySchool)}
                className="w-full text-left px-2.5 py-1.5 text-xs font-700 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
                style={{
                  background: selectedSchool === mySchool ? "rgba(99, 102, 241, 0.12)" : "transparent",
                  color: selectedSchool === mySchool ? "var(--primary)" : "var(--foreground)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--muted)")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    selectedSchool === mySchool ? "rgba(99, 102, 241, 0.12)" : "transparent")
                }
              >
                <div className="flex items-center gap-1.5">
                  <span>⭐</span>
                  <span>{mySchool}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">소속</span>
              </button>
            </div>
          )}

          {/* Header indicator */}
          <div className="px-3 py-1 flex items-center justify-between text-[11px] font-700 text-muted-foreground border-b mb-1" style={{ borderColor: "var(--border)" }}>
            <span>
              {searchTerm.trim()
                ? `검색 결과 (${results.length}개)`
                : `공모전·대외활동 사이트 (${results.length}개)`}
            </span>
            <span className="text-[10px]">{searchTerm.trim() ? "검색" : "추천"}</span>
          </div>

          {/* Results List */}
          <div className="overflow-y-auto max-h-[300px] px-1 space-y-0.5">
            {results.length > 0 ? (
              results.map((univ: UniversityItem, idx: number) => {
                const isSelected = selectedSchool === univ.name;
                const isFocused = activeIndex === idx;
                const isPlatform = isContestPlatform(univ);

                return (
                  <button
                    key={univ.name}
                    type="button"
                    onClick={() => handleSelect(univ.name)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className="w-full text-left px-2.5 py-2 text-xs rounded-lg flex items-center justify-between cursor-pointer transition-all"
                    style={{
                      background: isFocused
                        ? "var(--muted)"
                        : isSelected
                        ? "rgba(99, 102, 241, 0.1)"
                        : "transparent",
                      color: isSelected ? "var(--primary)" : "var(--foreground)",
                      fontWeight: isSelected ? 700 : 500,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{isPlatform ? "🌐" : "🏫"}</span>
                      <span>{univ.name}</span>
                      {(() => {
                        // 영문 약칭(SNU, KU, PNU 등)은 검색 인덱스로만 동작하고 화면 UI에는 표시하지 않음
                        const koreanAliases = univ.aliases?.filter((a) => !/^[A-Za-z\s]+$/.test(a));
                        return koreanAliases && koreanAliases.length > 0 ? (
                          <span className="text-[10px] text-muted-foreground">
                            ({koreanAliases.slice(0, 2).join(", ")})
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          background: isPlatform ? "rgba(99, 102, 241, 0.1)" : "var(--muted)",
                          color: isPlatform ? "var(--primary)" : "var(--muted-foreground)",
                          fontWeight: isPlatform ? 700 : 500,
                        }}
                      >
                        {univ.region}
                      </span>
                      {isSelected && <span className="text-primary text-xs">✓</span>}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-3 text-center text-xs text-muted-foreground">
                일치하는 대학교 또는 공모전 사이트가 없습니다.
              </div>
            )}

            {/* University Search Guide Banner (Shown when no search term is entered) */}
            {!searchTerm.trim() && (
              <div
                className="mt-2 mx-1 p-2.5 rounded-lg border text-xs"
                style={{
                  background: "rgba(99, 102, 241, 0.05)",
                  borderColor: "rgba(99, 102, 241, 0.2)",
                }}
              >
                <div className="flex items-center gap-1.5 font-bold text-primary mb-1">
                  <span>🏫</span>
                  <span>대학교 공지 검색 안내</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  대학교 소식은 상단 검색창에 학교명(예: 서울대, 부산대, 연세대 등)을 입력하시면 바로 검색하여 확인하실 수 있습니다.
                </p>
              </div>
            )}

            {/* Custom search option if user typed something */}
            {searchTerm.trim() && (
              <button
                type="button"
                onClick={() => handleSelect(searchTerm.trim())}
                onMouseEnter={() => setActiveIndex(results.length)}
                className="w-full text-left px-2.5 py-2 text-xs rounded-lg flex items-center gap-2 cursor-pointer transition-all border-t mt-1"
                style={{
                  borderColor: "var(--border)",
                  background: activeIndex === results.length ? "var(--muted)" : "transparent",
                  color: "var(--primary)",
                  fontWeight: 700,
                }}
              >
                <span>🔍</span>
                <span>‘{searchTerm.trim()}’(으)로 전국 공지/소식 검색</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

