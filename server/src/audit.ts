import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { AuthGuard, UserId } from "./auth.js";
import { Db, scalarJson, selectJson } from "./db.js";

// 운영자 창의 "접속 감사" 조회. 운영자만(DB 권한 규칙도 운영자만 읽게 한다).
//  1) 사용자 목록(이름·이메일, 처음~마지막 접속, IP 수, 업로드·삭제 횟수)
//  2) 한 사용자가 접속한 IP별 요약(처음~마지막 접속, 접속 횟수)
//  3) 한 사용자의 한 IP에서의 상세 활동(업로드·삭제 내역)
// 기록은 이 기능이 켜진 때부터 쌓이며 1년간 보관한다. 계정이 삭제돼도 그때의 이메일·이름으로 남는다.
const PAGE = 50;
const clamp = (value: string | undefined, fallback: number, max: number) => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
};

@Controller("admin/audit")
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly db: Db) {}

  private async assertOperator(userId: string) {
    const ok = await this.db.asUser(userId, (query) => scalarJson<boolean>(query, "public.is_operator()"));
    if (ok !== true) throw new ForbiddenException("운영자만 볼 수 있습니다.");
  }

  @Get("users")
  async users(@UserId() userId: string, @Query("q") q = "", @Query("limit") limit?: string, @Query("offset") offset?: string) {
    await this.assertOperator(userId);
    const size = clamp(limit, PAGE, 200);
    const skip = Math.max(0, Number.parseInt(offset ?? "0", 10) || 0);
    // 이름·이메일 검색: 사용자가 입력한 글자를 그대로 찾는다(%·_ 같은 문자가 특별하게 해석되지 않도록 position으로 비교).
    const rows = await this.db.asUser(userId, (query) => selectJson(query, `
      select a.user_id,
        (array_agg(a.user_email order by a.at desc))[1] as email,
        (array_agg(a.user_name order by a.at desc))[1] as name,
        min(a.at) as first_at, max(a.at) as last_at,
        count(distinct a.ip) as ip_count,
        count(*) filter (where a.kind = 'login') as logins,
        count(*) filter (where a.kind = 'upload') as uploads,
        count(*) filter (where a.kind = 'delete') as deletes,
        exists (select 1 from public.profiles p where p.id = a.user_id) as active
      from public.audit_log a
      where $1::text = '' or position(lower($1::text) in lower(a.user_email)) > 0 or position(lower($1::text) in lower(a.user_name)) > 0
      group by a.user_id
      order by max(a.at) desc, a.user_id
      limit $2 offset $3`, [q.trim().slice(0, 100), size + 1, skip]));
    const items = rows.slice(0, size).map((r) => ({
      userId: r.user_id, email: r.email, name: r.name, firstAt: r.first_at, lastAt: r.last_at, ipCount: Number(r.ip_count),
      logins: Number(r.logins), uploads: Number(r.uploads), deletes: Number(r.deletes), active: r.active === true,
    }));
    return { items, hasMore: rows.length > size };
  }

  @Get("users/:userId/ips")
  async ips(@UserId() operatorId: string, @Param("userId", ParseUUIDPipe) targetId: string) {
    await this.assertOperator(operatorId);
    const rows = await this.db.asUser(operatorId, (query) => selectJson(query, `
      select ip, min(at) as first_at, max(at) as last_at,
        count(*) filter (where kind = 'login') as logins,
        count(*) filter (where kind = 'upload') as uploads,
        count(*) filter (where kind = 'delete') as deletes
      from public.audit_log where user_id = $1 group by ip order by max(at) desc, ip limit 200`, [targetId]));
    return rows.map((r) => ({ ip: r.ip, firstAt: r.first_at, lastAt: r.last_at, logins: Number(r.logins), uploads: Number(r.uploads), deletes: Number(r.deletes) }));
  }

  // 한 IP에서 한 활동(업로드·삭제), 최신순. before(마지막으로 받은 기록 번호)로 이어서 받는다.
  @Get("users/:userId/activities")
  async activities(@UserId() operatorId: string, @Param("userId", ParseUUIDPipe) targetId: string,
    @Query("ip") ip = "", @Query("before") before?: string, @Query("limit") limit?: string) {
    await this.assertOperator(operatorId);
    const size = clamp(limit, PAGE, 200);
    const beforeId = Number.parseInt(before ?? "", 10);
    const rows = await this.db.asUser(operatorId, (query) => selectJson(query, `
      select id, at, kind, target_type, target_id, target_name, project_id, project_name, detail
      from public.audit_log
      where user_id = $1 and ip = $2 and kind in ('upload', 'delete') and ($3::bigint is null or id < $3::bigint)
      order by id desc limit $4`, [targetId, ip, Number.isFinite(beforeId) ? beforeId : null, size + 1]));
    const page = rows.slice(0, size);
    return {
      items: page.map((r) => ({
        id: Number(r.id), at: r.at, kind: r.kind, targetType: r.target_type, targetId: r.target_id, targetName: r.target_name,
        projectId: r.project_id, projectName: r.project_name, detail: r.detail ?? {},
      })),
      nextBefore: rows.length > size ? Number(page[page.length - 1].id) : null,
    };
  }
}
