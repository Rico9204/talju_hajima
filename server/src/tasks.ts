import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from "@nestjs/common";
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf,
} from "class-validator";
import { TODAY_SQL, myMember } from "./actor.js";
import { AuthGuard, UserId } from "./auth.js";
import { Db, selectJson, selectOneJson, type Query } from "./db.js";
import { mapChecklistItem, mapScheduleEvent, mapTask, mapTaskComment } from "./mappers.js";

const STATUSES = ["todo", "inprogress", "review", "done"];
const PRIORITIES = ["high", "mid", "low"];
const EVENT_TYPES = ["deadline", "meeting", "presentation", "other"];
const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class CreateTaskDto {
  @IsString() @MaxLength(200) title!: string;
  @IsArray() @ArrayMinSize(1, { message: "담당자를 한 명 이상 선택해주세요." }) @ArrayMaxSize(50) @IsUUID("all", { each: true }) assigneeIds!: string[];
  @IsIn(STATUSES) status!: string;
}

class TaskStatusDto {
  @IsIn(STATUSES) status!: string;
}

class TaskPatchDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1, { message: "담당자는 한 명 이상이어야 합니다." }) @ArrayMaxSize(50) @IsUUID("all", { each: true }) assigneeIds?: string[];
  @IsOptional() @IsIn(PRIORITIES) priority?: string;
  @IsOptional() @IsString() @MaxLength(30) due?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
}

class TextDto {
  @IsString() @MaxLength(2000) text!: string;
}

class DoneDto {
  @IsBoolean() done!: boolean;
}

class ReactionDto {
  @IsIn(EMOJIS) emoji!: string;
  @IsBoolean() active!: boolean;
}

class ScheduleLinkDto {
  @IsIn(["team", "personal"]) field!: "team" | "personal";
  @ValidateIf((dto: ScheduleLinkDto) => dto.eventId !== null) @IsInt() eventId!: number | null;
}

class CreateEventDto {
  @IsString() @MaxLength(200) title!: string;
  @Matches(DATE) date!: string;
  @IsOptional() @ValidateIf((dto: CreateEventDto) => dto.endDate !== null && dto.endDate !== "") @Matches(DATE) endDate?: string | null;
  @IsIn(EVENT_TYPES) type!: string;
  @IsIn(["personal", "team"]) scope!: "personal" | "team";
  @IsOptional() @IsIn(["private", "shared"]) visibility?: "private" | "shared";
  @IsOptional() @IsBoolean() hideTitle?: boolean;
}

class EventPatchDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @Matches(DATE) date?: string;
  @IsOptional() @ValidateIf((dto: EventPatchDto) => dto.endDate !== null && dto.endDate !== "") @Matches(DATE) endDate?: string | null;
  @IsOptional() @IsIn(EVENT_TYPES) type?: string;
  @IsOptional() @IsIn(["private", "shared"]) visibility?: string;
  @IsOptional() @IsBoolean() hideTitle?: boolean;
}

// 과제 + 담당자 + 체크리스트 + 댓글(+반응). 읽기 권한(RLS)이 그대로 걸린다.
const TASKS_SQL = `
  select t.*,
    coalesce((select jsonb_agg(jsonb_build_object('member_id', a.member_id)) from public.task_assignees a where a.task_id = t.id), '[]'::jsonb) as task_assignees,
    coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.task_checklist_items c where c.task_id = t.id), '[]'::jsonb) as task_checklist_items,
    coalesce((select jsonb_agg(to_jsonb(cm) || jsonb_build_object('task_comment_reactions',
      coalesce((select jsonb_agg(jsonb_build_object('member_id', r.member_id, 'emoji', r.emoji))
        from public.task_comment_reactions r where r.comment_id = cm.id), '[]'::jsonb)) order by cm.id)
      from public.task_comments cm where cm.task_id = t.id), '[]'::jsonb) as task_comments
  from public.tasks t where t.project_id = $1 order by t.id`;

async function projectOfTask(query: Query, taskId: number): Promise<string> {
  const row = await selectOneJson(query, "select project_id from public.tasks where id = $1", [taskId]);
  if (!row) throw new BadRequestException("과제를 찾을 수 없습니다.");
  return row.project_id;
}

// 첫 담당자의 이름·아바타·색을 과제 카드에 적는다(화면 쪽과 같은 규칙).
async function firstAssignee(query: Query, memberId: string) {
  const member = await selectOneJson(query, "select name, avatar, color from public.members where id = $1", [memberId]);
  if (!member) throw new BadRequestException("담당자를 찾을 수 없습니다.");
  return member;
}

// 누가 과제를 만들고 고칠 수 있는지(팀장·부팀장·담당자 등), 개인 일정을 누가 보는지는 권한 규칙(RLS)과 DB 함수가 정한다.
// 권한이 없으면 수정·삭제는 아무 행도 바꾸지 않는다(Supabase 직접 호출 때와 같음).
@Controller()
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly db: Db) {}

  @Get("projects/:projectId/tasks")
  listTasks(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, async (query) => (await selectJson(query, TASKS_SQL, [projectId])).map(mapTask));
  }

  @Post("projects/:projectId/tasks")
  createTask(@UserId() userId: string, @Param("projectId") projectId: string, @Body() body: CreateTaskDto) {
    return this.db.asUser(userId, async (query) => {
      const first = await firstAssignee(query, body.assigneeIds[0]);
      const [row] = await query<{ id: number }>(
        `insert into public.tasks(project_id, title, assignee, avatar, priority, due, tags, status, color)
         values ($1, $2, $3, $4, 'mid', '', '{}', $5, $6) returning id`,
        [projectId, body.title.trim(), first.name, first.avatar, body.status, first.color]);
      await query("insert into public.task_assignees(task_id, member_id) select $1, unnest($2::uuid[])", [row.id, body.assigneeIds]);
      const task = (await selectJson(query, `select * from (${TASKS_SQL}) all_tasks where id = $2`, [projectId, row.id]))[0];
      return mapTask(task);
    });
  }

  @Put("tasks/:taskId/status")
  @HttpCode(204)
  async updateStatus(@UserId() userId: string, @Param("taskId", ParseIntPipe) taskId: number, @Body() body: TaskStatusDto) {
    await this.db.asUser(userId, (query) => query("update public.tasks set status = $2 where id = $1", [taskId, body.status]));
  }

  @Patch("tasks/:taskId")
  @HttpCode(204)
  async updateDetails(@UserId() userId: string, @Param("taskId", ParseIntPipe) taskId: number, @Body() patch: TaskPatchDto) {
    await this.db.asUser(userId, async (query) => {
      const updates: Record<string, unknown> = {};
      if (patch.title !== undefined) updates.title = patch.title.trim();
      if (patch.priority !== undefined) updates.priority = patch.priority;
      if (patch.due !== undefined) updates.due = patch.due;
      if (patch.tags !== undefined) updates.tags = patch.tags;
      if (patch.assigneeIds !== undefined) {
        const first = await firstAssignee(query, patch.assigneeIds[0]);
        updates.assignee = first.name;
        updates.avatar = first.avatar;
      }
      const columns = Object.keys(updates);
      if (columns.length > 0) {
        // 칸 이름은 위의 고정 목록에서만 온다(요청 값이 SQL에 들어가지 않음).
        const sets = columns.map((column, i) => `${column} = $${i + 2}${column === "tags" ? "::text[]" : ""}`).join(", ");
        await query(`update public.tasks set ${sets} where id = $1`, [taskId, ...columns.map((c) => updates[c])]);
      }
      if (patch.assigneeIds !== undefined) {
        await query("delete from public.task_assignees where task_id = $1", [taskId]);
        await query("insert into public.task_assignees(task_id, member_id) select $1, unnest($2::uuid[])", [taskId, patch.assigneeIds]);
      }
    });
  }

  // 과제에 연결된 팀·개인 일정도 함께 지운다(연결은 ON DELETE SET NULL이라 과제만 지우면 일정이 남는다).
  @Delete("tasks/:taskId")
  @HttpCode(204)
  async deleteTask(@UserId() userId: string, @Param("taskId", ParseIntPipe) taskId: number) {
    await this.db.asUser(userId, async (query) => {
      const task = await selectOneJson(query, "select team_schedule_event_id, personal_schedule_event_id from public.tasks where id = $1", [taskId]);
      if (!task) throw new BadRequestException("과제를 찾을 수 없습니다.");
      await query("delete from public.tasks where id = $1", [taskId]);
      const eventIds = [task.team_schedule_event_id, task.personal_schedule_event_id].filter((id) => id !== null);
      if (eventIds.length) await query("delete from public.schedule_events where id = any($1::bigint[])", [eventIds]);
    });
  }

  @Put("tasks/:taskId/schedule-link")
  @HttpCode(204)
  async setScheduleLink(@UserId() userId: string, @Param("taskId", ParseIntPipe) taskId: number, @Body() body: ScheduleLinkDto) {
    const column = body.field === "team" ? "team_schedule_event_id" : "personal_schedule_event_id";
    await this.db.asUser(userId, (query) => query(`update public.tasks set ${column} = $2 where id = $1`, [taskId, body.eventId]));
  }

  @Post("tasks/:taskId/checklist")
  addChecklistItem(@UserId() userId: string, @Param("taskId", ParseIntPipe) taskId: number, @Body() body: TextDto) {
    const text = body.text.trim();
    if (!text) throw new BadRequestException("체크리스트 내용을 입력해주세요.");
    return this.db.asUser(userId, async (query) => {
      const [row] = await query<{ id: number }>("insert into public.task_checklist_items(task_id, text) values ($1, $2) returning id", [taskId, text]);
      return mapChecklistItem(await selectOneJson(query, "select * from public.task_checklist_items where id = $1", [row.id]));
    });
  }

  @Put("checklist/:itemId")
  @HttpCode(204)
  async toggleChecklistItem(@UserId() userId: string, @Param("itemId", ParseIntPipe) itemId: number, @Body() body: DoneDto) {
    await this.db.asUser(userId, (query) => query("update public.task_checklist_items set done = $2 where id = $1", [itemId, body.done]));
  }

  @Post("tasks/:taskId/comments")
  addComment(@UserId() userId: string, @Param("taskId", ParseIntPipe) taskId: number, @Body() body: TextDto) {
    const text = body.text.trim();
    if (!text) throw new BadRequestException("댓글 내용을 입력해주세요.");
    return this.db.asUser(userId, async (query) => {
      const me = await myMember(query, await projectOfTask(query, taskId));
      const [row] = await query<{ id: number }>(
        `insert into public.task_comments(task_id, member_id, author, avatar, date, text) values ($1, $2, $3, $4, ${TODAY_SQL}, $5) returning id`,
        [taskId, me.id, me.name, me.avatar, text]);
      return mapTaskComment(await selectOneJson(query, "select * from public.task_comments where id = $1", [row.id]));
    });
  }

  @Put("task-comments/:commentId/reaction")
  @HttpCode(204)
  async setCommentReaction(@UserId() userId: string, @Param("commentId", ParseIntPipe) commentId: number, @Body() body: ReactionDto) {
    await this.db.asUser(userId, async (query) => {
      const comment = await selectOneJson(query, "select t.project_id from public.task_comments c join public.tasks t on t.id = c.task_id where c.id = $1", [commentId]);
      if (!comment) throw new BadRequestException("댓글을 찾을 수 없습니다.");
      const me = await myMember(query, comment.project_id);
      if (body.active) {
        await query("insert into public.task_comment_reactions(comment_id, member_id, emoji) values ($1, $2, $3) on conflict do nothing", [commentId, me.id, body.emoji]);
      } else {
        await query("delete from public.task_comment_reactions where comment_id = $1 and member_id = $2 and emoji = $3", [commentId, me.id, body.emoji]);
      }
    });
  }

  // ── 일정 ──
  @Get("projects/:projectId/schedule")
  listEvents(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, async (query) =>
      (await selectJson(query, "select * from public.schedule_events where project_id = $1 order by date, id", [projectId])).map(mapScheduleEvent));
  }

  // 개인 일정의 주인은 로그인한 사용자의 팀원 행(화면이 보낸 값이 아님). 공개 범위 기본값은 나만 보기.
  @Post("projects/:projectId/schedule")
  addEvent(@UserId() userId: string, @Param("projectId") projectId: string, @Body() body: CreateEventDto) {
    return this.db.asUser(userId, async (query) => {
      const personal = body.scope === "personal";
      const ownerId = personal ? (await myMember(query, projectId)).id : null;
      const visibility = personal ? body.visibility ?? "private" : null;
      const [row] = await query<{ id: number }>(
        `insert into public.schedule_events(project_id, title, date, end_date, type, scope, owner_member_id, visibility, hide_title)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [projectId, body.title.trim(), body.date, body.endDate || null, body.type, body.scope, ownerId, visibility,
          personal && visibility === "shared" ? !!body.hideTitle : false]);
      return mapScheduleEvent(await selectOneJson(query, "select * from public.schedule_events where id = $1", [row.id]));
    });
  }

  @Patch("schedule/:eventId")
  @HttpCode(204)
  async updateEvent(@UserId() userId: string, @Param("eventId", ParseIntPipe) eventId: number, @Body() patch: EventPatchDto) {
    const updates: Record<string, unknown> = {};
    if (patch.title !== undefined) updates.title = patch.title.trim();
    if (patch.date !== undefined) updates.date = patch.date;
    if (patch.endDate !== undefined) updates.end_date = patch.endDate || null;
    if (patch.type !== undefined) updates.type = patch.type;
    if (patch.visibility !== undefined) updates.visibility = patch.visibility;
    if (patch.hideTitle !== undefined) updates.hide_title = patch.hideTitle;
    const columns = Object.keys(updates);
    if (columns.length === 0) return;
    const sets = columns.map((column, i) => `${column} = $${i + 2}`).join(", ");
    await this.db.asUser(userId, (query) => query(`update public.schedule_events set ${sets} where id = $1`, [eventId, ...columns.map((c) => updates[c])]));
  }

  @Delete("schedule/:eventId")
  @HttpCode(204)
  async removeEvent(@UserId() userId: string, @Param("eventId", ParseIntPipe) eventId: number) {
    await this.db.asUser(userId, (query) => query("delete from public.schedule_events where id = $1", [eventId]));
  }
}
