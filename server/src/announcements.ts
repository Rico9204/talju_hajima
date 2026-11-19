import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { TODAY_SQL } from "./actor.js";
import { AuthGuard, UserId } from "./auth.js";
import { Db, scalarJson, selectJson } from "./db.js";
import { RealtimeHub } from "./realtime.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class CreateAnnouncementDto {
  @IsString() @MaxLength(100) title!: string;
  @IsString() @MaxLength(2000) body!: string;
  @Matches(DATE) startDate!: string;
  @Matches(DATE) endDate!: string;
  @IsBoolean() targetAll!: boolean;
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(100, { each: true }) projectIds!: string[];
  @IsOptional() @IsIn(["normal", "important", "urgent"]) priority?: string;
}

type Row = Record<string, unknown>;
const mapAnnouncement = (row: Row) => ({
  id: row.id, title: row.title, body: row.body, startDate: row.start_date, endDate: row.end_date,
  targetAll: row.target_all, projectIds: row.project_ids, createdAt: row.created_at,
  priority: row.priority ?? "normal", authorName: row.author_name ?? "",
  ...(row.read !== undefined ? { read: Boolean(row.read) } : {}),
  ...(row.recipients !== undefined ? { recipientCount: row.recipients ?? null, readCount: row.reads ?? null } : {}),
});

// 공지. 시스템 공지(전체 대상)는 운영자가, 프로젝트 공지는 그 프로젝트의 승인 담당 관리자(교수 등)가 보낸다.
// 만들기·지우기·확인·"다시 보지 않기"의 권한·검증은 DB 함수(create_announcement 등)와 권한 규칙이 한다.
// 바뀔 때마다 접속 중인 모두에게 "바뀌었다"만 알리고(RealtimeHub), 받은 화면이 아래 active 목록을 다시 읽는다(대상·기간·숨김은 서버가 걸러 준다).
@Controller()
@UseGuards(AuthGuard)
export class AnnouncementsController {
  constructor(private readonly db: Db, private readonly hub: RealtimeHub) {}

  // 지금 내가 받는 공지: 오늘(한국 시간)이 기간 안이고, 전체이거나 내가 참여한 프로젝트가 대상이며, "다시 보지 않기"를 누르지 않은 것.
  // read = 내가 "확인했어요"를 눌렀는지. 화면이 나눠 쓴다: 시스템 공지는 메인 화면 띠, 프로젝트 공지는 그 프로젝트 대시보드,
  // 중요·긴급이면서 확인 전인 것은 팝업. 관리자라도 대상이 아니면 받지 않는다(관리 목록은 아래 announcements).
  @Get("announcements/active")
  active(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) => (await selectJson(query, `
      select a.*, exists (select 1 from public.announcement_reads r where r.announcement_id = a.id and r.user_id = auth.uid()) as read
      from public.announcements a
      where a.start_date <= ${TODAY_SQL} and a.end_date >= ${TODAY_SQL}
        and (a.target_all or exists (select 1 from public.members m where m.user_id = auth.uid() and m.project_id = any (a.project_ids)))
        and not exists (select 1 from public.announcement_dismissals d where d.announcement_id = a.id and d.user_id = auth.uid())
      order by a.id desc limit 50`)).map(mapAnnouncement));
  }

  // 관리 화면용 목록: 운영자는 모든 공지, 관리자는 자기가 보낸 공지만. 프로젝트 공지에는 확인 인원 수(대상 팀원 수·확인한 수)가 붙는다.
  @Get("announcements")
  list(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) => (await selectJson(query, `
      select a.*, c.recipients, c.reads from public.announcements a
      left join public.announcement_read_counts() c on c.announcement_id = a.id
      where public.is_operator() or a.created_by = auth.uid()
      order by a.id desc limit 200`)).map(mapAnnouncement));
  }

  @Post("announcements")
  async create(@UserId() userId: string, @Body() body: CreateAnnouncementDto) {
    const id = await this.db.asUser(userId, (query) => scalarJson<number>(
      query, "public.create_announcement($1, $2, $3::date, $4::date, $5, $6::text[], $7)",
      [body.title, body.body, body.startDate, body.endDate, body.targetAll, body.projectIds, body.priority ?? "normal"]));
    this.hub.notifyAnnouncementsChanged();
    return { id };
  }

  @Delete("announcements/:id")
  @HttpCode(204)
  async remove(@UserId() userId: string, @Param("id", ParseIntPipe) id: number) {
    await this.db.asUser(userId, (query) => query("select public.delete_announcement($1::bigint)", [id]));
    this.hub.notifyAnnouncementsChanged();
  }

  // "확인했어요"(본인 기록). 내 화면들만 다시 읽으면 되므로 실시간 알림은 보내지 않는다.
  @Post("announcements/:id/read")
  @HttpCode(204)
  async markRead(@UserId() userId: string, @Param("id", ParseIntPipe) id: number) {
    await this.db.asUser(userId, (query) => query("select public.mark_announcement_read($1::bigint)", [id]));
  }

  @Post("announcements/:id/dismiss")
  @HttpCode(204)
  async dismiss(@UserId() userId: string, @Param("id", ParseIntPipe) id: number) {
    await this.db.asUser(userId, (query) => query("select public.dismiss_announcement($1::bigint)", [id]));
  }
}
