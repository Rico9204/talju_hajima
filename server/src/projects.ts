import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query as QueryParam, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf, ValidateNested,
} from "class-validator";
import { randomBytes } from "node:crypto";
import { myProfile } from "./actor.js";
import { AuthGuard, UserId } from "./auth.js";
import { Db, scalarJson, selectJson, selectOneJson, type Query } from "./db.js";
import { mapMember, mapProject, summarizeEvaluations } from "./mappers.js";

// 배포 확인용. 로그인 없이 부를 수 있는 유일한 경로이며 DB에 닿지 않는다.
@Controller("health")
export class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHASES = ["midterm", "final"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 프로젝트 id: 이름을 읽을 수 있는 조각 + 시각 + 임의 4자(같은 이름을 같은 순간에 만들어도 겹치지 않게).
function projectIdFor(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, "");
  return `${base || "project"}-${Date.now().toString(36)}-${randomBytes(3).toString("hex").slice(0, 4)}`;
}

class CreateProjectDto {
  @IsString() @MaxLength(100) name!: string;
  @IsString() @MaxLength(100) org!: string;
  @IsString() @MaxLength(100) period!: string;
  @IsOptional() @Matches(DATE) startDate?: string;
  @IsOptional() @Matches(DATE) endDate?: string;
  @IsOptional() @IsUUID() requestedAdminId?: string;
}

class JoinProjectDto {
  @IsString() @MaxLength(100) code!: string; // 팀장에게 받은 참여 코드(6시간 유효)
  @IsString() @MaxLength(100) school!: string;
  @IsString() @MaxLength(100) major!: string;
  @IsString() @MaxLength(50) student!: string;
}

class ProfileLinkDto {
  @IsString() @MaxLength(100) id!: string;
  @IsString() @MaxLength(30) type!: string;
  @IsString() @MaxLength(2000) url!: string;
  @IsString() @MaxLength(100) label!: string;
}

// 보내지 않은 칸은 그대로 둔다. null을 보낼 수 있는 칸(연락처·배경 등)과 없는 칸(이름 등)을 구분한다.
class ProfilePatchDto {
  @ValidateIf((o) => o.name !== undefined) @IsString() @MaxLength(30) name?: string;
  @ValidateIf((o) => o.major !== undefined) @IsString() @MaxLength(100) major?: string;
  @ValidateIf((o) => o.student !== undefined) @IsString() @MaxLength(50) student?: string;
  @ValidateIf((o) => o.school !== undefined) @IsString() @MaxLength(100) school?: string;
  @IsOptional() @IsString() @MaxLength(2000) avatarUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(100) contact?: string | null;
  @IsOptional() @IsString() @MaxLength(100) org?: string | null;
  @IsOptional() @IsString() @MaxLength(50) bannerColor?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) bannerImageUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(50) backgroundColor?: string | null;
  @IsOptional() @IsString() @MaxLength(500) backgroundGradient?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) backgroundImageUrl?: string | null;
  @IsOptional() @IsNumber() glassOpacity?: number | null;
  @IsOptional() @IsNumber() glassBlur?: number | null;
  @ValidateIf((o) => o.links !== undefined) @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ProfileLinkDto) links?: ProfileLinkDto[];
}

class EnabledDto {
  @IsBoolean() enabled!: boolean;
}

// 대상은 팀원 id(targetMemberId)로 정한다. targetName(참여 당시 이름)은 예전 화면을 위해 남겨 둔 방식.
class TransferLeadershipDto {
  @IsOptional() @IsUUID() targetMemberId?: string;
  @ValidateIf((dto: TransferLeadershipDto) => !dto.targetMemberId) @IsString() @MaxLength(100) targetName?: string;
}

class EvaluationEntryDto {
  @IsUUID() recipient_id!: string;
  @IsNumber() role!: number;
  @IsNumber() deadline!: number;
  @IsNumber() communication!: number;
  @IsNumber() collaboration!: number;
  @IsNumber() quality!: number;
  @IsString() @MaxLength(2000) comment!: string;
}

class SubmitEvaluationsDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => EvaluationEntryDto) entries!: EvaluationEntryDto[];
}

function assertPhase(phase: string): string {
  if (!PHASES.includes(phase)) throw new BadRequestException("평가 단계는 midterm 또는 final 이어야 합니다.");
  return phase;
}

// 팀원 목록(평가 점수는 공개 규칙에 맞게 가려진 DB 함수 결과) + 계정 프로필을 합친다. 팀장 → 부팀장 순.
async function teamMembers(query: Query, projectId: string, adminView: boolean) {
  const fn = adminView ? "admin_project_members" : "visible_evaluation_members";
  const rows = await selectJson(query, `select * from public.${fn}(p_project_id => $1)`, [projectId]);
  const userIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean))];
  const profiles = userIds.length ? await selectJson(query, "select * from public.profiles where id = any($1::uuid[])", [userIds]) : [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  return rows
    .map((m) => mapMember(m, m.user_id ? profileById.get(m.user_id) : undefined))
    .sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || Number(b.isViceLeader) - Number(a.isViceLeader));
}

@Controller()
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly db: Db) {}

  // ── 내 계정 ──
  @Get("me/is-admin")
  isAdmin(@UserId() userId: string) {
    return this.db.asUser(userId, (query) => scalarJson<boolean>(query, "public.is_admin()"));
  }

  @Get("me/project-ids")
  myProjectIds(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) =>
      (await selectJson(query, "select project_id from public.members where user_id = auth.uid()")).map((r) => r.project_id));
  }

  // 메인 화면 프로젝트 카드의 알림 점: 확인하지 않은 것이 있는 내 프로젝트 id들.
  @Get("me/project-alerts")
  projectAlerts(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) =>
      (await selectJson(query, "select * from public.my_project_alerts()")).filter((r) => r.has_alert).map((r) => r.project_id));
  }

  // 업적 화면: 종료된 프로젝트 기준 참여 횟수·함께한 동료 수 + 공개된 평가 평균.
  @Get("me/evaluation-summary")
  evaluationSummary(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) => {
      const rows = await selectJson(query, "select * from public.visible_evaluation_members()");
      const allProjectIds = [...new Set(rows.map((r) => r.project_id))];
      const doneIds = allProjectIds.length
        ? (await selectJson(query, "select id from public.projects where status = 'done' and id = any($1::text[])", [allProjectIds])).map((p) => p.id)
        : [];
      let collaboratorCount = 0;
      if (doneIds.length) {
        const teammates = await selectJson(query, "select id, user_id from public.members where project_id = any($1::text[])", [doneIds]);
        // 계정 없는 팀원 행은 프로젝트를 넘어 같은 사람인지 알 수 없으므로 한 명으로 센다.
        collaboratorCount = new Set(teammates.filter((m) => m.user_id !== userId).map((m) => m.user_id ?? `row:${m.id}`)).size;
      }
      return summarizeEvaluations(rows.map((r) => mapMember(r)), doneIds.length, collaboratorCount);
    });
  }

  @Patch("me/profile")
  @HttpCode(204)
  async updateProfile(@UserId() userId: string, @Body() patch: ProfilePatchDto) {
    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.display_name = patch.name.trim();
    if (patch.major !== undefined) updates.major = patch.major.trim();
    if (patch.student !== undefined) updates.student = patch.student.trim();
    if (patch.school !== undefined) updates.school = patch.school.trim();
    if (patch.avatarUrl !== undefined) updates.avatar_url = patch.avatarUrl;
    if (patch.contact !== undefined) updates.contact = patch.contact?.trim() || null;
    if (patch.org !== undefined) updates.org = patch.org?.trim() || null;
    if (patch.bannerColor !== undefined) updates.banner_color = patch.bannerColor;
    if (patch.bannerImageUrl !== undefined) updates.banner_image_url = patch.bannerImageUrl;
    if (patch.backgroundColor !== undefined) updates.background_color = patch.backgroundColor;
    if (patch.backgroundGradient !== undefined) updates.background_gradient = patch.backgroundGradient;
    if (patch.backgroundImageUrl !== undefined) updates.background_image_url = patch.backgroundImageUrl;
    if (patch.glassOpacity !== undefined) updates.glass_opacity = patch.glassOpacity;
    if (patch.glassBlur !== undefined) updates.glass_blur = patch.glassBlur;
    if (patch.links !== undefined) updates.links = JSON.stringify(patch.links);
    const columns = Object.keys(updates);
    if (columns.length === 0) return;
    // 칸 이름은 위의 고정 목록에서만 온다(요청 값이 SQL에 들어가지 않음).
    const sets = columns.map((column, i) => `${column} = $${i + 1}${column === "links" ? "::jsonb" : ""}`).join(", ");
    await this.db.asUser(userId, (query) => query(`update public.profiles set ${sets} where id = auth.uid()`, columns.map((c) => updates[c])));
  }

  // 다른 팀원의 프로필 카드: 전체 프로젝트 참여 횟수·함께한 동료 수(같은 프로젝트를 한 적 있는 사람만 — DB 함수가 검사).
  // 평가 점수 상위 %(서비스 전체 사용자 기준). 대상 없이: 내 전체 평균. projectId+memberId: 그 프로젝트의 그 팀원 점수.
  @Get("me/evaluation-percentiles")
  evaluationPercentiles(@UserId() userId: string, @QueryParam("projectId") projectId?: string, @QueryParam("memberId") memberId?: string) {
    if (!!projectId !== !!memberId) throw new BadRequestException("projectId와 memberId를 함께 보내야 합니다.");
    if (memberId && !UUID.test(memberId)) throw new BadRequestException("memberId 형식이 올바르지 않습니다.");
    return this.db.asUser(userId, (query) =>
      scalarJson(query, "public.evaluation_percentiles($1::text, $2::uuid)", [projectId ?? null, memberId ?? null]));
  }

  @Get("users/:userId/participation-stats")
  participationStats(@UserId() userId: string, @Param("userId", ParseUUIDPipe) targetUserId: string) {
    return this.db.asUser(userId, async (query) => {
      const stats = await scalarJson<{ projectCount?: number; collaboratorCount?: number } | null>(query, "public.member_participation_stats($1::uuid)", [targetUserId]);
      return { projectCount: stats?.projectCount ?? 0, collaboratorCount: stats?.collaboratorCount ?? 0 };
    });
  }

  // ── 프로젝트 ──
  @Get("projects")
  listProjects(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) => (await selectJson(query, "select * from public.projects order by created_at")).map(mapProject));
  }

  @Get("projects/:projectId")
  getProject(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, async (query) => {
      const row = await selectOneJson(query, "select * from public.projects where id = $1", [projectId]);
      return row ? mapProject(row) : null;
    });
  }

  // 프로젝트 + 팀 + 팀장(나) 한 번에. members.user_id는 DB 트리거가 채운다.
  @Post("projects")
  createProject(@UserId() userId: string, @Body() body: CreateProjectDto) {
    return this.db.asUser(userId, async (query) => {
      const actor = await myProfile(query);
      const id = projectIdFor(body.name);
      await query(
        `insert into public.projects(id, name, org, period, status, start_date, end_date, requested_admin_id)
         values ($1, $2, $3, $4, 'active', $5, $6, $7)`,
        [id, body.name.trim() || "새 프로젝트", body.org.trim() || "소속 미지정", body.period.trim() || "진행 중",
          body.startDate ?? null, body.endDate ?? null, body.requestedAdminId ?? null]);
      const project = (await selectOneJson(query, "select * from public.projects where id = $1", [id]))!;
      await query("insert into public.teams(project_id, team_label, team_sub) values ($1, $2, $3)",
        [id, `${project.name} 팀`, `${project.org} · 팀원을 초대해보세요`]);
      await query(
        `insert into public.members(project_id, name, role, major, student, avatar, tasks_done, tasks_total, activities, score, eval_count,
           online, responsibilities, color, criteria_role, criteria_deadline, criteria_communication, criteria_collaboration, criteria_quality, is_leader)
         values ($1, $2, '팀장', '역사문화학과 3학년', '2021123456', $3, 0, 0, 0, 0, 0, true, '{}', '#2563eb', 0, 0, 0, 0, 0, true)`,
        [id, actor.name, actor.avatar]);
      await query("select public.get_or_rotate_join_code($1)", [id]); // 첫 참여 코드
      return mapProject(project);
    });
  }

  @Delete("projects/:projectId")
  @HttpCode(204)
  async deleteProject(@UserId() userId: string, @Param("projectId") projectId: string) {
    await this.db.asUser(userId, (query) => query("select public.delete_managed_project($1)", [projectId]));
  }

  @Post("projects/:projectId/approve")
  @HttpCode(204)
  async approve(@UserId() userId: string, @Param("projectId") projectId: string) {
    await this.db.asUser(userId, (query) => query("select public.review_project($1, 'approved')", [projectId]));
  }

  @Post("projects/:projectId/reject")
  @HttpCode(204)
  async reject(@UserId() userId: string, @Param("projectId") projectId: string) {
    await this.db.asUser(userId, (query) => query("select public.review_project($1, 'rejected')", [projectId]));
  }

  @Post("projects/:projectId/complete")
  completeProject(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, async (query) => {
      await query("select public.complete_evaluation_project($1)", [projectId]);
      const row = await selectOneJson(query, "select * from public.projects where id = $1", [projectId]);
      if (row?.status !== "done") throw new BadRequestException("프로젝트 종료가 저장되지 않았습니다.");
      return mapProject(row);
    });
  }

  // 참여: 팀원 행을 만들고 학교·전공·학번을 계정 프로필에도 반영한 뒤, 만들어진 내 팀원 정보를 돌려준다.
  // (INSERT에 RETURNING을 붙이지 않는다 — 팀원 읽기 규칙이 "이미 팀원인가"를 보므로 같은 문장 안에서는 자기 행이 안 보인다.)
  // 참여 코드로 참여(코드 검사·팀원 행 추가는 DB 함수 join_project_with_code). 주소의 프로젝트와 코드의 프로젝트가 같아야 한다.
  @Post("projects/:projectId/join")
  joinProject(@UserId() userId: string, @Param("projectId") projectId: string, @Body() body: JoinProjectDto) {
    return this.db.asUser(userId, async (query) => {
      const joinedId = await scalarJson<string>(query, "public.join_project_with_code($1, $2, $3)", [body.code, body.major, body.student]);
      if (joinedId !== projectId) throw new BadRequestException("이 프로젝트의 참여 코드가 아닙니다."); // 트랜잭션이 취소되어 참여도 취소된다
      await query("update public.profiles set school = $1, major = $2, student = $3 where id = auth.uid()",
        [body.school.trim() || null, body.major.trim() || null, body.student.trim() || null]);
      const member = await selectOneJson(query, "select * from public.visible_evaluation_members(p_project_id => $1) where user_id = auth.uid()", [projectId]);
      const profile = await selectOneJson(query, "select * from public.profiles where id = auth.uid()");
      return mapMember(member, profile);
    });
  }

  // 참여 전 확인: 유효한 코드의 프로젝트(없으면 null). 프로젝트 id로는 찾지 않는다.
  @Get("join-codes/:code")
  lookupJoinCode(@UserId() userId: string, @Param("code") code: string) {
    return this.db.asUser(userId, async (query) => {
      const row = await scalarJson<Record<string, unknown> | null>(query, "public.lookup_project_by_join_code($1)", [code]);
      return row ? mapProject(row) : null;
    });
  }

  // 지금 쓸 수 있는 참여 코드(팀원만). 6시간이 지났으면 새로 만든다.
  @Get("projects/:projectId/join-code")
  joinCode(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, (query) => scalarJson(query, "public.get_or_rotate_join_code($1)", [projectId]));
  }

  // 팀장·부팀장이 지금 바로 새 코드로(이전 코드는 즉시 무효).
  @Post("projects/:projectId/join-code/rotate")
  @HttpCode(200)
  rotateJoinCode(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, (query) => scalarJson(query, "public.rotate_project_join_code($1)", [projectId]));
  }



  @Get("projects/:projectId/team")
  getTeam(@UserId() userId: string, @Param("projectId") projectId: string, @QueryParam("admin") admin?: string) {
    return this.db.asUser(userId, async (query) => {
      const team = await selectOneJson(query, "select * from public.teams where project_id = $1", [projectId]);
      return { teamLabel: team?.team_label ?? "팀", teamSub: team?.team_sub ?? "", members: await teamMembers(query, projectId, admin === "true") };
    });
  }

  // 팀장 확인과 "기존 팀장 내리기 + 새 팀장 올리기"는 DB 함수가 한 번에 한다.
  @Post("projects/:projectId/transfer-leadership")
  @HttpCode(204)
  async transferLeadership(@UserId() userId: string, @Param("projectId") projectId: string, @Body() body: TransferLeadershipDto) {
    await this.db.asUser(userId, (query) => body.targetMemberId
      ? query("select public.transfer_leadership_to_member($1, $2::uuid)", [projectId, body.targetMemberId])
      : query("select public.transfer_leadership($1, $2)", [projectId, body.targetName]));
  }

  @Put("members/:memberId/vice-leader")
  @HttpCode(204)
  async setViceLeader(@UserId() userId: string, @Param("memberId", ParseUUIDPipe) memberId: string, @Body() body: EnabledDto) {
    await this.db.asUser(userId, (query) => query("select public.set_vice_leader($1::uuid, $2)", [memberId, body.enabled]));
  }

  @Delete("members/:memberId")
  @HttpCode(204)
  async kickMember(@UserId() userId: string, @Param("memberId", ParseUUIDPipe) memberId: string) {
    await this.db.asUser(userId, (query) => query("select public.kick_project_member($1::uuid)", [memberId]));
  }

  // 과제·일정·워크스페이스 화면을 본 시각 기록(섹션 이름 검사는 DB 함수가 한다).
  @Post("projects/:projectId/sections/:section/viewed")
  @HttpCode(204)
  async markSectionViewed(@UserId() userId: string, @Param("projectId") projectId: string, @Param("section") section: string) {
    await this.db.asUser(userId, (query) => query("select public.mark_section_viewed($1, $2)", [projectId, section]));
  }

  // ── 동료 평가 ──
  @Get("evaluation-mode")
  evaluationMode(@UserId() userId: string) {
    return this.db.asUser(userId, (query) => scalarJson<boolean>(query, "public.evaluation_prototype_enabled()"));
  }

  @Put("evaluation-mode")
  @HttpCode(204)
  async setEvaluationMode(@UserId() userId: string, @Body() body: EnabledDto) {
    await this.db.asUser(userId, (query) => query("select public.set_evaluation_prototype_enabled($1)", [body.enabled]));
  }

  @Get("projects/:projectId/evaluations/:phase")
  getEvaluations(@UserId() userId: string, @Param("projectId") projectId: string, @Param("phase") phase: string) {
    assertPhase(phase);
    return this.db.asUser(userId, async (query) => {
      const records = await selectJson(query, "select * from public.peer_evaluations where project_id = $1 and phase = $2 order by created_at", [projectId, phase]);
      const submissions = await selectJson(query, "select id from public.peer_evaluation_submissions where project_id = $1 and phase = $2", [projectId, phase]);
      const average = await scalarJson(query, "public.my_evaluation_average($1, $2)", [projectId, phase]);
      return { records, submitted: submissions.length > 0, average };
    });
  }

  @Post("projects/:projectId/evaluations/:phase")
  @HttpCode(204)
  async submitEvaluations(@UserId() userId: string, @Param("projectId") projectId: string, @Param("phase") phase: string, @Body() body: SubmitEvaluationsDto) {
    assertPhase(phase);
    await this.db.asUser(userId, (query) =>
      query("select public.submit_peer_evaluations($1, $2, $3::jsonb)", [projectId, phase, JSON.stringify(body.entries)]));
  }
}
