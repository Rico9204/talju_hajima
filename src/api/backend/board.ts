import { apiClient } from "./client";

// "메인화면" 게시판(팀원 모집 공고 + 일반 글) 전용 API. DataRepository 인터페이스 밖 —
// Workspace/FolderSync/평가와 같은 패턴으로 useProject() 컨텍스트를 거치지 않고 직접 호출한다.

export interface BoardPost {
  id: string;
  authorId: string;
  author: { id: string; name: string } | null;
  title: string;
  content: string;
  projectId: string | null;
  project: { id: string; name: string } | null;
  recruiting: boolean;
  tags: string[];
  createdAt: string;
}

export type BoardApplicationStatus = "pending" | "accepted" | "rejected";

export interface BoardApplication {
  id: string;
  postId: string;
  applicantId: string;
  applicant: { id: string; name: string } | null;
  message: string;
  status: BoardApplicationStatus;
  createdAt: string;
}

export function listBoardPosts(filter?: { tag?: string; q?: string }) {
  return apiClient.get<BoardPost[]>("/board/posts", { params: filter });
}

export function createBoardPost(input: { title: string; content: string; projectId?: string; tags?: string[] }) {
  return apiClient.post<BoardPost>("/board/posts", input);
}

export function deleteBoardPost(postId: string) {
  return apiClient.delete<void>(`/board/posts/${postId}`);
}

export function setBoardPostRecruiting(postId: string, recruiting: boolean) {
  return apiClient.patch<BoardPost>(`/board/posts/${postId}/recruiting`, { recruiting });
}

export function applyToBoardPost(postId: string, message?: string) {
  return apiClient.post<BoardApplication>(`/board/posts/${postId}/apply`, { message });
}

export function listBoardApplications(postId: string) {
  return apiClient.get<BoardApplication[]>(`/board/posts/${postId}/applications`);
}

export function acceptBoardApplication(applicationId: string) {
  return apiClient.post<BoardApplication>(`/board/applications/${applicationId}/accept`);
}

export function rejectBoardApplication(applicationId: string) {
  return apiClient.post<BoardApplication>(`/board/applications/${applicationId}/reject`);
}
