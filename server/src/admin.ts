import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query as QueryParam, UseGuards } from "@nestjs/common";
import { IsBoolean, IsString, MaxLength } from "class-validator";
import { AuthGuard, UserId } from "./auth.js";
import { Db, scalarJson, selectJson, selectOneJson } from "./db.js";
import { mapAdminAccount, mapAdminApplicationRecord, mapMyAdminApplication } from "./mappers.js";

class ReviewApplicationDto {
  @IsBoolean() approve!: boolean;
  @IsString() @MaxLength(500) note!: string;
}

// 관리자(교수·교원) 찾기·신청과 운영자 기능. 운영자 여부 등 모든 권한 검사는 DB 함수가 한다.
// 증명서 PDF 업로드·열람·삭제는 파일 저장소 단계(다음 단계 2)에서 옮긴다.
@Controller()
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly db: Db) {}

  // 프로젝트 승인 요청을 보낼 관리자 검색(이름·소속·이메일).
  @Get("admins/search")
  searchAdmins(@UserId() userId: string, @QueryParam("q") q = "") {
    const trimmed = q.trim().slice(0, 100);
    if (!trimmed) return [];
    return this.db.asUser(userId, async (query) =>
      (await selectJson(query, "select * from public.search_admin_profiles($1)", [trimmed]))
        .map((r) => ({ id: r.id, displayName: r.display_name, org: r.org, email: r.email })));
  }

  // 확인에 실패하면(예: DB 함수가 아직 없음) 운영자가 아닌 것으로 본다 — 화면이 멈추지 않게.
  @Get("me/is-operator")
  isOperator(@UserId() userId: string) {
    return this.db.asUser(userId, (query) => scalarJson<boolean>(query, "public.is_operator()")).then((v) => v === true, () => false);
  }

  @Get("me/admin-application")
  myApplication(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) => {
      const row = await selectOneJson(query, `
        select id, status, org, job_title, doc_type, doc_name, submitted_at, reviewed_at, review_note
        from public.admin_applications where user_id = auth.uid() order by submitted_at desc limit 1`);
      return row ? mapMyAdminApplication(row) : null;
    });
  }

  @Get("admin/applications")
  listApplications(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) => (await selectJson(query, "select * from public.list_admin_applications()")).map(mapAdminApplicationRecord));
  }

  @Post("admin/applications/:id/review")
  @HttpCode(204)
  async reviewApplication(@UserId() userId: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: ReviewApplicationDto) {
    await this.db.asUser(userId, (query) =>
      query("select public.review_admin_application($1::uuid, $2, $3)", [id, body.approve, body.note.trim() || null]));
  }

  @Get("admin/accounts")
  listAccounts(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) => (await selectJson(query, "select * from public.list_admins()")).map(mapAdminAccount));
  }

  @Delete("admin/accounts/:userId")
  @HttpCode(204)
  async revokeAdmin(@UserId() userId: string, @Param("userId", ParseUUIDPipe) targetUserId: string) {
    await this.db.asUser(userId, (query) => query("select public.revoke_admin($1::uuid)", [targetUserId]));
  }
}
