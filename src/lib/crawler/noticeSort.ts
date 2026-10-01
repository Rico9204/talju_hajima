import type { NoticeItem } from "./types";

export type NoticeSortOption = "latest" | "title" | "category";

export interface NoticeSortOptionItem {
  value: NoticeSortOption;
  label: string;
}

export const NOTICE_SORT_OPTIONS: NoticeSortOptionItem[] = [
  { value: "latest", label: "최신순" },
  { value: "title", label: "가나다순" },
  { value: "category", label: "카테고리순" },
];

const CATEGORY_PRIORITY: Record<string, number> = {
  contest: 1,    // 공모전·대외활동
  job: 2,        // 채용·취업
  internship: 3, // 인턴십
  general: 4,    // 학사·장학
};

/**
 * 정렬 기준에 따라 공지사항 목록을 정렬합니다.
 * - latest: 최신 등록일 내림차순 (고정글 최우선)
 * - title: 제목 가나다순
 * - category: 카테고리 순서 (공모전 -> 채용 -> 인턴 -> 학사/일반) 및 카테고리 내 최신순
 */
export function sortNotices(items: NoticeItem[], sortOption: NoticeSortOption): NoticeItem[] {
  return [...items].sort((a, b) => {
    // 최신순에서는 상단 고정글(isPinned)을 최우선으로 배치
    if (sortOption === "latest") {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
    }

    switch (sortOption) {
      case "latest": {
        const dateA = a.postDate || "";
        const dateB = b.postDate || "";
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        return (b.id || "").localeCompare(a.id || "");
      }
      case "title": {
        return (a.title || "").localeCompare(b.title || "", "ko");
      }
      case "category": {
        const catA = a.category || "general";
        const catB = b.category || "general";
        const pA = CATEGORY_PRIORITY[catA] ?? 99;
        const pB = CATEGORY_PRIORITY[catB] ?? 99;
        if (pA !== pB) return pA - pB;
        // 같은 카테고리 내에서는 최신순
        const dateA = a.postDate || "";
        const dateB = b.postDate || "";
        return dateB.localeCompare(dateA);
      }
      default:
        return 0;
    }
  });
}
