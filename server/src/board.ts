import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, ValidateIf, ValidateNested,
} from "class-validator";
import { AuthGuard, UserId } from "./auth.js";
import { Db, selectJson, selectOneJson, type Query } from "./db.js";
import { mapBoardPost } from "./mappers.js";

const CATEGORIES = ["notice", "free", "recruit"];
const REASONS = ["spam", "abuse", "sexual", "privacy", "other"];

class AttachmentDto {
  @IsString() @MaxLength(100) id!: string;
  @IsString() @MaxLength(255) name!: string;
  @IsString() @MaxLength(30) size!: string;
  @IsIn(["image", "file"]) kind!: "image" | "file";
  @IsString() @MaxLength(2000) url!: string;
  @IsOptional() @IsString() @MaxLength(255) mimeType?: string;
}

class PollInputDto {
  @IsString() @MaxLength(200) question!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(100, { each: true }) options!: string[];
  @IsBoolean() allowMultiple!: boolean;
  @IsBoolean() isAnonymous!: boolean;
  @IsOptional() @ValidateIf((dto: PollInputDto) => dto.closesAt !== null && dto.closesAt !== "") @IsISO8601() closesAt?: string | null;
}

class CreatePostDto {
  @IsIn(CATEGORIES) category!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsString() @MaxLength(100_000) content!: string;
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AttachmentDto) attachments!: AttachmentDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
  @IsOptional() @IsBoolean() hideImagePreview?: boolean;
  @IsOptional() @ValidateNested() @Type(() => PollInputDto) poll?: PollInputDto | null;
}

class PostPatchDto {
  @IsOptional() @IsIn(CATEGORIES) category?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(100_000) content?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AttachmentDto) attachments?: AttachmentDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
  @IsOptional() @IsBoolean() hideImagePreview?: boolean;
}

class ActiveDto {
  @IsBoolean() active!: boolean;
}

class CommentDto {
  @IsString() @MaxLength(2000) content!: string;
  @IsOptional() @IsInt() parentCommentId?: number;
}

class VoteDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsInt({ each: true }) optionIds!: number[];
}

class ReportDto {
  @IsIn(REASONS) reason!: string;
  @IsString() @MaxLength(1000) detail!: string;
}

class ReviewReportDto {
  @IsIn(["resolved", "dismissed"]) status!: "resolved" | "dismissed";
}

async function profilesById(query: Query, userIds: string[]): Promise<Map<string, any>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  return new Map((await selectJson(query, "select id, display_name, avatar_url from public.profiles where id = any($1::uuid[])", [ids])).map((p) => [p.id, p]));
}

// 투표 + 항목 + 투표 기록(board_poll_votes_view) → 게시글 id별 투표. 익명 투표는 DB 함수가 다른 사람의 user_id를 주지 않는다.
async function buildPolls(query: Query, pollRows: any[], myId: string): Promise<Map<number, any>> {
  const result = new Map<number, any>();
  if (!pollRows.length) return result;
  const pollIds = pollRows.map((p) => p.id);
  const options = await selectJson(query, "select * from public.board_poll_options where poll_id = any($1::bigint[]) order by sort_order", [pollIds]);
  const votes = await selectJson(query, "select * from public.board_poll_votes_view($1::bigint[])", [pollIds]);
  const votesByPoll = new Map<number, any[]>();
  for (const vote of votes) votesByPoll.set(vote.poll_id, [...(votesByPoll.get(vote.poll_id) ?? []), vote]);
  const voterIds = pollRows.filter((p) => !p.is_anonymous).flatMap((p) => (votesByPoll.get(p.id) ?? []).map((v) => v.user_id)).filter(Boolean);
  const voterProfiles = await profilesById(query, voterIds);
  for (const pollRow of pollRows) {
    const pollVotes = votesByPoll.get(pollRow.id) ?? [];
    const myOptionIds = pollVotes.filter((v) => v.user_id === myId).map((v) => v.option_id);
    const pollOptions = options.filter((o) => o.poll_id === pollRow.id).map((o) => {
      const optionVotes = pollVotes.filter((v) => v.option_id === o.id);
      const voters = pollRow.is_anonymous ? [] : optionVotes.filter((v) => v.user_id).map((v) => ({
        userId: v.user_id, name: voterProfiles.get(v.user_id)?.display_name || "참여자", avatarUrl: voterProfiles.get(v.user_id)?.avatar_url ?? null,
      }));
      return { id: o.id, pollId: o.poll_id, text: o.text, votesCount: optionVotes.length, sortOrder: o.sort_order, voters };
    });
    const expired = pollRow.closes_at ? new Date(pollRow.closes_at).getTime() <= Date.now() : false;
    result.set(pollRow.post_id, {
      id: pollRow.id, postId: pollRow.post_id, question: pollRow.question, allowMultiple: pollRow.allow_multiple,
      isAnonymous: pollRow.is_anonymous, closed: pollRow.closed || expired, closesAt: pollRow.closes_at, createdAt: pollRow.created_at,
      options: pollOptions, totalVotes: new Set(pollVotes.map((v) => v.voter_ref)).size, hasVoted: myOptionIds.length > 0, myOptionIds,
    });
  }
  return result;
}

async function singlePoll(query: Query, pollId: number, myId: string) {
  const row = await selectOneJson(query, "select * from public.board_polls where id = $1", [pollId]);
  const poll = row ? (await buildPolls(query, [row], myId)).get(row.post_id) : null;
  if (!poll) throw new BadRequestException("투표를 찾을 수 없습니다.");
  return poll;
}

async function mapReports(query: Query, rows: any[]) {
  const profiles = await profilesById(query, rows.flatMap((r) => [r.reporter_user_id, r.post_author_user_id]));
  return rows.map((r) => ({
    id: r.id, postId: r.post_id, postTitle: r.post_title, postExcerpt: r.post_excerpt,
    postAuthorName: profiles.get(r.post_author_user_id)?.display_name || "알 수 없음",
    reporterUserId: r.reporter_user_id, reporterName: profiles.get(r.reporter_user_id)?.display_name || "알 수 없음",
    reason: r.reason, detail: r.detail, status: r.status, createdAt: r.created_at,
  }));
}

// 메인 화면 게시판(프로젝트와 무관). 글쓴이는 로그인한 사용자, 수정·삭제·공지·신고 처리 권한은 권한 규칙과 DB 함수가 정한다.
@Controller("board")
@UseGuards(AuthGuard)
export class BoardController {
  constructor(private readonly db: Db) {}

  @Get("posts")
  listPosts(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) => {
      const rows = await selectJson(query, "select * from public.board_posts order by pinned desc, created_at desc");
      const liked = new Set((await selectJson(query, "select post_id from public.board_likes where user_id = auth.uid()")).map((r) => r.post_id));
      const reported = new Set((await selectJson(query, "select post_id from public.board_post_reports where reporter_user_id = auth.uid()")).map((r) => r.post_id));
      const profiles = await profilesById(query, rows.map((r) => r.author_user_id));
      const polls = rows.length
        ? await buildPolls(query, await selectJson(query, "select * from public.board_polls where post_id = any($1::bigint[])", [rows.map((r) => r.id)]), userId)
        : new Map();
      return rows.map((row) => ({ ...mapBoardPost(row, profiles.get(row.author_user_id), liked.has(row.id), polls.get(row.id)), reportedByMe: reported.has(row.id) }));
    });
  }

  // 글 + (있으면) 투표를 한 트랜잭션으로. 투표를 만들지 못하면 글도 남지 않는다(예전에는 글만 남았다).
  @Post("posts")
  createPost(@UserId() userId: string, @Body() body: CreatePostDto) {
    const tags = [...(body.tags ?? [])];
    if (body.hideImagePreview && !tags.includes("hide_image_preview")) tags.push("hide_image_preview");
    return this.db.asUser(userId, async (query) => {
      const [row] = await query<{ id: number }>(
        "insert into public.board_posts(category, title, content, author_user_id, attachments, tags) values ($1, $2, $3, auth.uid(), $4::jsonb, $5::text[]) returning id",
        [body.category, body.title.trim(), body.content, JSON.stringify(body.attachments), tags]);
      let poll = null;
      if (body.poll && body.poll.question.trim() && body.poll.options.length >= 2) {
        const [{ id: pollId }] = await query<{ id: number }>(
          "select public.create_board_poll($1::bigint, $2, $3::text[], $4, $5, $6::timestamptz) as id",
          [row.id, body.poll.question, body.poll.options, body.poll.allowMultiple, body.poll.isAnonymous, body.poll.closesAt || null]);
        poll = await singlePoll(query, Number(pollId), userId);
      }
      const post = await selectOneJson(query, "select * from public.board_posts where id = $1", [row.id]);
      return mapBoardPost(post, (await profilesById(query, [userId])).get(userId), false, poll);
    });
  }

  @Patch("posts/:postId")
  @HttpCode(204)
  async updatePost(@UserId() userId: string, @Param("postId", ParseIntPipe) postId: number, @Body() patch: PostPatchDto) {
    await this.db.asUser(userId, async (query) => {
      const updates: Record<string, unknown> = {};
      if (patch.category !== undefined) updates.category = patch.category;
      if (patch.title !== undefined) updates.title = patch.title.trim();
      if (patch.content !== undefined) updates.content = patch.content;
      if (patch.attachments !== undefined) updates.attachments = JSON.stringify(patch.attachments);
      if (patch.hideImagePreview !== undefined || patch.tags !== undefined) {
        let tags = patch.tags ? [...patch.tags] : [];
        if (!patch.tags) tags = (await selectOneJson(query, "select tags from public.board_posts where id = $1", [postId]))?.tags ?? [];
        if (patch.hideImagePreview === true && !tags.includes("hide_image_preview")) tags.push("hide_image_preview");
        if (patch.hideImagePreview === false) tags = tags.filter((t) => t !== "hide_image_preview" && t !== "no_preview");
        updates.tags = tags;
      }
      const columns = Object.keys(updates);
      if (!columns.length) return;
      const cast: Record<string, string> = { attachments: "::jsonb", tags: "::text[]" };
      // 칸 이름은 위의 고정 목록에서만 온다(요청 값이 SQL에 들어가지 않음).
      const sets = [...columns.map((c, i) => `${c} = $${i + 2}${cast[c] ?? ""}`), "updated_at = now()"].join(", ");
      await query(`update public.board_posts set ${sets} where id = $1`, [postId, ...columns.map((c) => updates[c])]);
    });
  }

  @Delete("posts/:postId")
  @HttpCode(204)
  async deletePost(@UserId() userId: string, @Param("postId", ParseIntPipe) postId: number) {
    await this.db.asUser(userId, (query) => query("delete from public.board_posts where id = $1", [postId]));
  }

  @Post("posts/:postId/views")
  @HttpCode(204)
  async view(@UserId() userId: string, @Param("postId", ParseIntPipe) postId: number) {
    await this.db.asUser(userId, (query) => query("select public.increment_board_post_views($1::bigint)", [postId]));
  }

  @Put("posts/:postId/like")
  @HttpCode(204)
  async like(@UserId() userId: string, @Param("postId", ParseIntPipe) postId: number, @Body() body: ActiveDto) {
    await this.db.asUser(userId, (query) => body.active
      ? query("insert into public.board_likes(post_id, user_id) values ($1, auth.uid()) on conflict do nothing", [postId])
      : query("delete from public.board_likes where post_id = $1 and user_id = auth.uid()", [postId]));
  }

  // 원문(HTML)은 화면에서 sanitizeBoardHtml을 거쳐 보여 준다. 지워진 글이면 null.
  @Get("posts/:postId/content")
  content(@UserId() userId: string, @Param("postId", ParseIntPipe) postId: number) {
    return this.db.asUser(userId, async (query) => ({ content: (await selectOneJson(query, "select content from public.board_posts where id = $1", [postId]))?.content ?? null }));
  }

  @Get("posts/:postId/comments")
  comments(@UserId() userId: string, @Param("postId", ParseIntPipe) postId: number) {
    return this.db.asUser(userId, async (query) => {
      const rows = await selectJson(query, "select * from public.board_comments where post_id = $1 order by created_at, id", [postId]);
      const profiles = await profilesById(query, rows.map((r) => r.author_user_id));
      const author = (r: any) => ({
        id: r.id, authorUserId: r.author_user_id, author: profiles.get(r.author_user_id)?.display_name || "탈퇴한 사용자",
        authorAvatarUrl: profiles.get(r.author_user_id)?.avatar_url ?? null, createdAt: r.created_at, content: r.content,
      });
      return rows.filter((r) => r.parent_comment_id === null)
        .map((r) => ({ ...author(r), replies: rows.filter((reply) => reply.parent_comment_id === r.id).map(author) }));
    });
  }

  @Post("posts/:postId/comments")
  @HttpCode(204)
  async addComment(@UserId() userId: string, @Param("postId", ParseIntPipe) postId: number, @Body() body: CommentDto) {
    const content = body.content.trim();
    if (!content) throw new BadRequestException("댓글 내용을 입력해 주세요.");
    await this.db.asUser(userId, (query) =>
      query("insert into public.board_comments(post_id, parent_comment_id, author_user_id, content) values ($1, $2, auth.uid(), $3)",
        [postId, body.parentCommentId ?? null, content]));
  }

  @Delete("comments/:commentId")
  @HttpCode(204)
  async deleteComment(@UserId() userId: string, @Param("commentId", ParseIntPipe) commentId: number) {
    await this.db.asUser(userId, (query) => query("delete from public.board_comments where id = $1", [commentId]));
  }

  @Post("polls/:pollId/votes")
  vote(@UserId() userId: string, @Param("pollId", ParseIntPipe) pollId: number, @Body() body: VoteDto) {
    return this.db.asUser(userId, async (query) => {
      await query("select public.cast_board_poll_vote($1::bigint, $2::bigint[])", [pollId, body.optionIds]);
      return singlePoll(query, pollId, userId);
    });
  }

  @Post("polls/:pollId/close")
  @HttpCode(204)
  async closePoll(@UserId() userId: string, @Param("pollId", ParseIntPipe) pollId: number) {
    await this.db.asUser(userId, (query) => query("select public.close_board_poll($1::bigint)", [pollId]));
  }

  @Post("posts/:postId/reports")
  @HttpCode(204)
  async report(@UserId() userId: string, @Param("postId", ParseIntPipe) postId: number, @Body() body: ReportDto) {
    await this.db.asUser(userId, (query) => query("select public.report_board_post($1::bigint, $2, $3)", [postId, body.reason, body.detail]));
  }

  // 신고 내역은 권한 규칙상 운영자만 읽을 수 있다 — 다른 사람에게는 빈 목록.
  @Get("posts/:postId/reports")
  postReports(@UserId() userId: string, @Param("postId", ParseIntPipe) postId: number) {
    return this.db.asUser(userId, async (query) =>
      mapReports(query, await selectJson(query, "select * from public.board_post_reports where post_id = $1 order by created_at desc", [postId])));
  }

  @Get("reports")
  allReports(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) =>
      mapReports(query, await selectJson(query, "select * from public.board_post_reports order by created_at desc limit 500")));
  }

  @Post("reports/:reportId/review")
  @HttpCode(204)
  async reviewReport(@UserId() userId: string, @Param("reportId", ParseIntPipe) reportId: number, @Body() body: ReviewReportDto) {
    await this.db.asUser(userId, (query) => query("select public.review_board_report($1::bigint, $2)", [reportId, body.status]));
  }
}
