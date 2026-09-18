import { apiClient } from "./client";
import type { ProfileLink, ProfileLinkType } from "../types";

// 내 프로필 링크(GitHub/Instagram/노션 등) CRUD — 백엔드 GET/POST/DELETE /users/me/links.
// talju_hajima-main2는 Supabase 멤버 row의 links 컬럼을 한 번에 통째로 갱신했지만, 우리
// 백엔드는 링크 단위 CRUD라 추가/삭제를 각각 즉시 반영한다(추가한 뒤 "저장" 버튼을 누를 필요 없음).
export function addProfileLink(input: { url: string; type: ProfileLinkType; label: string }) {
  return apiClient.post<ProfileLink>("/users/me/links", input);
}

export function deleteProfileLink(linkId: string) {
  return apiClient.delete(`/users/me/links/${linkId}`);
}
