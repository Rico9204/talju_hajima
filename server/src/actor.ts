import { ForbiddenException } from "@nestjs/common";
import { selectOneJson, type Query } from "./db.js";

// 작성자·팀원 신원은 브라우저가 보내는 값을 믿지 않고 로그인한 사용자 기준으로 서버가 정한다
// (예전에는 화면이 이름·아바타·팀원 id를 함께 보냈다). 모두 asUser 트랜잭션 안에서 쓰므로 auth.uid() = 요청자.

// 한국 시간 기준 오늘(댓글·폴더 등의 date 칸). 예전에는 사용자 기기 시간대의 오늘을 썼다.
export const TODAY_SQL = "(now() at time zone 'Asia/Seoul')::date";

export async function myProfile(query: Query): Promise<{ name: string; avatar: string }> {
  const profile = await selectOneJson<{ display_name: string | null; avatar_initial: string | null }>(
    query, "select display_name, avatar_initial from public.profiles where id = auth.uid()");
  const name = profile?.display_name?.trim() || "사용자";
  return { name, avatar: profile?.avatar_initial?.trim() || name.slice(0, 1) };
}

// 이 프로젝트에서의 내 팀원 행(이름·아바타는 계정 프로필 우선 — 화면의 currentMember와 같은 값).
export async function myMember(query: Query, projectId: string): Promise<{ id: string; name: string; avatar: string }> {
  const member = await selectOneJson<{ id: string; name: string; avatar: string }>(query, `
    select m.id, coalesce(nullif(p.display_name, ''), m.name) as name, coalesce(nullif(p.avatar_initial, ''), m.avatar) as avatar
    from public.members m left join public.profiles p on p.id = m.user_id
    where m.project_id = $1 and m.user_id = auth.uid()`, [projectId]);
  if (!member) throw new ForbiddenException("이 프로젝트의 참여자만 할 수 있습니다.");
  return member;
}
