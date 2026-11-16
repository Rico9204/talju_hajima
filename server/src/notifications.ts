import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsIn, IsInt, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { TODAY_SQL } from "./actor.js";
import { AuthGuard, UserId } from "./auth.js";
import { Db, selectJson } from "./db.js";

// 전체 알림 목록: 관리자 공지(공지 기간 동안 계속)와 게시판 공지사항(최근 30일)을 한 목록으로.
// 관리자 공지는 "다시 보지 않기"로 팝업을 숨겨도 기간 동안 여기에 남는다. 읽음 표시는 사용자별(notification_reads).
// 게시판 공지사항은 관리자만 쓸 수 있고(DB 권한 규칙), 쓰는 순간 접속 중인 모두에게 알림이 간다(board.ts → RealtimeHub).
export const BOARD_NOTICE_DAYS = 30;

class ReadItemDto {
  @IsIn(["announcement", "board_notice"]) kind!: "announcement" | "board_notice";
  @IsInt() refId!: number;
}

class ReadDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ReadItemDto) items!: ReadItemDto[];
}

@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly db: Db) {}

  @Get()
  list(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) => {
      const rows = await selectJson(query, `
        (select 'announcement' as kind, a.id as ref_id, a.title, a.body, a.start_date::text as start_date, a.end_date::text as end_date,
                a.created_at, (r.user_id is not null) as read
         from public.announcements a
         left join public.notification_reads r on r.user_id = auth.uid() and r.kind = 'announcement' and r.ref_id = a.id
         where a.start_date <= ${TODAY_SQL} and a.end_date >= ${TODAY_SQL}
           and (a.target_all or exists (select 1 from public.members m where m.user_id = auth.uid() and m.project_id = any (a.project_ids))))
        union all
        (select 'board_notice', p.id, p.title, null, null, null, p.created_at, (r.user_id is not null)
         from public.board_posts p
         left join public.notification_reads r on r.user_id = auth.uid() and r.kind = 'board_notice' and r.ref_id = p.id
         where p.category = 'notice' and p.created_at > now() - make_interval(days => ${BOARD_NOTICE_DAYS}))
        order by created_at desc
        limit 60`);
      return {
        items: rows.map((r) => ({
          kind: r.kind, refId: Number(r.ref_id), title: r.title, body: r.body ?? null,
          startDate: r.start_date ?? null, endDate: r.end_date ?? null, createdAt: r.created_at, read: r.read === true,
        })),
      };
    });
  }

  @Post("read")
  @HttpCode(204)
  async read(@UserId() userId: string, @Body() body: ReadDto) {
    if (body.items.length === 0) return;
    await this.db.asUser(userId, (query) => query("select public.mark_notifications_read($1::text[], $2::bigint[])",
      [body.items.map((i) => i.kind), body.items.map((i) => i.refId)]));
  }
}
