import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsBoolean, IsString, Matches, MaxLength } from "class-validator";
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
}

type Row = Record<string, unknown>;
const mapAnnouncement = (row: Row) => ({
  id: row.id, title: row.title, body: row.body, startDate: row.start_date, endDate: row.end_date,
  targetAll: row.target_all, projectIds: row.project_ids, createdAt: row.created_at,
});

// 관리자 공지. 만들기·지우기·"다시 보지 않기"의 권한·검증은 DB 함수(create_announcement 등)와 권한 규칙이 한다.
// 바뀔 때마다 접속 중인 모두에게 "바뀌었다"만 알리고(RealtimeHub), 받은 화면이 아래 active 목록을 다시 읽는다(대상·기간·숨김은 서버가 걸러 준다).
@Controller()
@UseGuards(AuthGuard)
export class AnnouncementsController {
  constructor(private readonly db: Db, private readonly hub: RealtimeHub) {}

  // 지금 내가 볼 공지: 오늘(한국 시간)이 기간 안이고, 전체이거나 내가 참여한 프로젝트가 대상이며, "다시 보지 않기"를 누르지 않은 것.
  // 관리자라도 대상이 아니면 팝업으로 받지 않는다(관리 목록은 아래 announcements).
  @Get("announcements/active")
  active(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) => (await selectJson(query, `
      select a.* from public.announcements a
      where a.start_date <= ${TODAY_SQL} and a.end_date >= ${TODAY_SQL}
        and (a.target_all or exists (select 1 from public.members m where m.user_id = auth.uid() and m.project_id = any (a.project_ids)))
        and not exists (select 1 from public.announcement_dismissals d where d.announcement_id = a.id and d.user_id = auth.uid())
      order by a.id desc limit 10`)).map(mapAnnouncement));
  }

  // 관리 화면용 전체 목록(관리자만 모두 보인다. 그 밖의 사람은 자기 대상 공지만).
  @Get("announcements")
  list(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) =>
      (await selectJson(query, "select * from public.announcements order by id desc limit 200")).map(mapAnnouncement));
  }

  @Post("announcements")
  async create(@UserId() userId: string, @Body() body: CreateAnnouncementDto) {
    const id = await this.db.asUser(userId, (query) => scalarJson<number>(
      query, "public.create_announcement($1, $2, $3::date, $4::date, $5, $6::text[])",
      [body.title, body.body, body.startDate, body.endDate, body.targetAll, body.projectIds]));
    this.hub.notifyAnnouncementsChanged();
    return { id };
  }

  @Delete("announcements/:id")
  @HttpCode(204)
  async remove(@UserId() userId: string, @Param("id", ParseIntPipe) id: number) {
    await this.db.asUser(userId, (query) => query("select public.delete_announcement($1::bigint)", [id]));
    this.hub.notifyAnnouncementsChanged();
  }

  @Post("announcements/:id/dismiss")
  @HttpCode(204)
  async dismiss(@UserId() userId: string, @Param("id", ParseIntPipe) id: number) {
    await this.db.asUser(userId, (query) => query("select public.dismiss_announcement($1::bigint)", [id]));
  }
}
