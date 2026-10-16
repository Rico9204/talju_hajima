export type NoticeCategory = "all" | "contest" | "job" | "general" | "internship";

export interface NoticeItem {
  id: string;
  schoolCode: string;
  schoolName: string;
  category: NoticeCategory;
  categoryLabel?: string;
  title: string;
  author: string;
  postDate: string; // YYYY-MM-DD
  link: string;
  views?: number;
  thumbnail?: string;
  isPinned?: boolean;
  dDay?: string; // e.g. "D-3", "마감"
  summary?: string;
}

export type CmsType =
  | "egov_table"     // 전자정부/공공 CMS 표준 테이블형 (tbl_board, bbs_list 등)
  | "artcl_table"    // 전자정부 artclTable 형 (boardView.do, artclList.do)
  | "card_list"      // 카드/썸네일 그리드형 목록 (board_list li, card_item 등)
  | "gnuboard"       // 그누보드/오픈 CMS 계열 (td.td_subject)
  | "rss"            // RSS / XML 피드
  | "yonsei_news"    // 연세대학교 연세소식/학술행사 통합 파서
  | "linkareer"      // 링커리어 Next.js SSR 데이터 파서
  | "campuspick"     // 캠퍼스픽 공모전/대외활동 파서
  | "allcon"         // 올콘 공모전/대외활동 JSON 파서
  | "generic";       // 범용 휴리스틱 자동 감지 파서

export interface UnivBoardConfig {
  schoolCode: string;
  schoolName: string;
  category: NoticeCategory;
  categoryLabel: string;
  cmsType: CmsType;
  listUrl: string;
  baseUrl: string;
  linkPrefix?: string;
  noticeIdRegex?: string;
  urlTemplate?: string;
  selectors?: {
    row?: string;
    title?: string;
    author?: string;
    date?: string;
    views?: string;
    link?: string;
    thumbnail?: string;
    pinned?: string;
  };
}

export interface ScrappedNotice {
  id: string;
  userId: string;
  schoolCode: string;
  schoolName: string;
  category: NoticeCategory;
  title: string;
  author: string;
  postDate: string;
  link: string;
  createdAt: string;
}
