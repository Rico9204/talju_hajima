import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { AuthGuard, UserId } from "./auth.js";
import { Db, selectJson } from "./db.js";

// 캠퍼스 소식 스크랩(북마크). 소식 목록 자체는 로그인 없이 쓰는 수집기(api/campus-notices.js, Vercel 함수)가 준다.
// 본인 것만 읽고·쓰고·지우는 것은 권한 규칙(RLS)이 정한다.

const CATEGORIES = ["all", "contest", "job", "general", "internship"];

class NoticeDto {
  @IsString() @MaxLength(100) schoolCode!: string;
  @IsString() @MaxLength(100) schoolName!: string;
  @IsIn(CATEGORIES) category!: string;
  @IsString() @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(100) author?: string;
  @IsOptional() @IsString() @MaxLength(30) postDate?: string;
  // 화면이 링크로 여는 주소라 http(s)만(javascript: 등 차단).
  @IsString() @MaxLength(2000) @Matches(/^https?:\/\//i) link!: string;
  // 화면이 보내는 나머지 칸(id·요약 등)은 저장하지 않는다.
  @IsOptional() @IsString() @MaxLength(2000) id?: string;
  @IsOptional() @IsString() @MaxLength(100) categoryLabel?: string;
  @IsOptional() views?: number;
  @IsOptional() @IsString() @MaxLength(2000) thumbnail?: string;
  @IsOptional() isPinned?: boolean;
  @IsOptional() @IsString() @MaxLength(30) dDay?: string;
  @IsOptional() @IsString() @MaxLength(2000) summary?: string;
}

const mapScrap = (row: Record<string, any>) => ({
  id: row.id,
  userId: row.user_id,
  schoolCode: row.school_code,
  schoolName: row.school_name,
  category: row.category,
  title: row.title,
  author: row.author || "",
  postDate: row.post_date || "",
  link: row.link,
  createdAt: row.created_at,
});

@Controller("me/scrapped-notices")
@UseGuards(AuthGuard)
export class CampusController {
  constructor(private readonly db: Db) {}

  @Get()
  list(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) =>
      (await selectJson(query, "select * from public.campus_scrapped_notices where user_id = auth.uid() order by created_at desc")).map(mapScrap));
  }

  // 이미 스크랩했으면 해제(false), 아니면 스크랩(true).
  @Post("toggle")
  toggle(@UserId() userId: string, @Body() notice: NoticeDto) {
    return this.db.asUser(userId, async (query) => {
      const removed = await query("delete from public.campus_scrapped_notices where user_id = auth.uid() and link = $1 returning id", [notice.link]);
      if (removed.length) return { scrapped: false };
      await query(
        `insert into public.campus_scrapped_notices(user_id, school_code, school_name, category, title, author, post_date, link)
         values (auth.uid(), $1, $2, $3, $4, $5, $6, $7)`,
        [notice.schoolCode, notice.schoolName, notice.category, notice.title, notice.author ?? null, notice.postDate ?? null, notice.link]);
      return { scrapped: true };
    });
  }
}
