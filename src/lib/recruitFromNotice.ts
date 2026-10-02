import type { BoardCategory } from "../api/types";

// 캠퍼스 소식(공모전 등)에서 "팀원 모집 글 쓰기"를 눌렀을 때 게시판 글쓰기 화면에 미리 채울 내용.
// 메인 화면(Home)과 프로젝트가 없는 첫 화면(NoProjectHome)이 함께 쓴다. 본문은 게시판이 sanitizeBoardHtml로 정리해 보여 준다.
export interface BoardInitialState {
  category?: "all" | BoardCategory;
  isCreating?: boolean;
  title?: string;
  content?: string;
}

export function recruitPostFromNotice(notice: { title: string; link: string; schoolName: string }): BoardInitialState {
  return {
    category: "recruit",
    isCreating: true,
    title: `[팀원 모집] ${notice.title}`,
    content: `<p><strong>[공모전 정보]</strong></p><p>• 주최/소속: ${notice.schoolName}</p><p>• 공모전 원문 링크: <a href="${notice.link}" target="_blank" rel="noopener noreferrer">${notice.link}</a></p><p><br></p><p><strong>[팀원 모집 내용]</strong></p><p>해당 공모전에 함께 도전할 팀원을 모집합니다!</p><p>• 모집 분야: 기획 / 디자인 / 개발</p><p>• 지원 방법: 댓글이나 메시지로 편하게 연락주세요.</p>`,
  };
}
