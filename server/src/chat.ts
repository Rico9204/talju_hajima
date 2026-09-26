import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, MaxLength } from "class-validator";
import { myMember } from "./actor.js";
import { AuthGuard, UserId } from "./auth.js";
import { Db, scalarJson, selectJson, selectOneJson } from "./db.js";
import { mapMessage, mapToolEvent } from "./mappers.js";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅"];

class CreateChatGroupDto {
  @IsString() @Length(1, 30) name!: string;
  @IsArray() @ArrayMaxSize(200) @IsUUID("all", { each: true }) memberIds!: string[];
}

class AddChatGroupMembersDto {
  @IsArray() @ArrayMaxSize(200) @IsUUID("all", { each: true }) memberIds!: string[];
}

class SendMessageDto {
  @IsString() @MaxLength(5000) text!: string;
  @IsOptional() @IsInt() fileId?: number;
}

class ReadDto {
  @IsArray() @ArrayMaxSize(1000) @IsInt({ each: true }) messageIds!: number[];
}

class ReactionDto {
  @IsIn(EMOJIS) emoji!: string;
  @IsBoolean() active!: boolean;
}

class ToolCreateDto {
  @IsString() @MaxLength(5000) text!: string;
  @IsObject() config!: Record<string, unknown>;
}

class ToolActDto {
  @IsString() @MaxLength(50) action!: string;
  @IsOptional() @IsObject() args?: Record<string, unknown>;
}

// 메시지 + 읽음 + 반응. 읽기 권한(RLS)이 그대로 걸려, 볼 수 없는 채널(남의 1:1, 참여하지 않은 단체방)은 빈 목록이 된다.
const MESSAGES_SQL = `
  select m.*,
    coalesce((select jsonb_agg(jsonb_build_object('member_id', r.member_id))
      from public.message_reads r where r.message_id = m.id and r.project_id = m.project_id), '[]'::jsonb) as message_reads,
    coalesce((select jsonb_agg(jsonb_build_object('member_id', x.member_id, 'emoji', x.emoji))
      from public.message_reactions x where x.message_id = m.id and x.project_id = m.project_id), '[]'::jsonb) as message_reactions
  from public.chat_messages m
  where m.project_id = $1 and m.channel_id = $2
  order by m.id`;

const CHAT_GROUPS_SQL = `
  select g.id, g.name,
    coalesce((select jsonb_agg(gm.member_id) from public.chat_group_members gm where gm.group_id = g.id), '[]'::jsonb) as "memberIds"
  from public.chat_groups g
  where g.project_id = $1
  order by g.created_at`;

// 보내는 사람·읽은 사람·반응한 사람은 로그인한 사용자의 팀원 행으로 서버가 정한다(화면이 보낸 id를 쓰지 않음).
// 채널 접근(전체·1:1·단체방)과 전송 속도 제한은 DB의 권한 규칙과 트리거가 검사한다.
@Controller()
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly db: Db) {}

  @Get("projects/:projectId/chat/:channelId/messages")
  listMessages(@UserId() userId: string, @Param("projectId") projectId: string, @Param("channelId") channelId: string) {
    return this.db.asUser(userId, async (query) => (await selectJson(query, MESSAGES_SQL, [projectId, channelId])).map(mapMessage));
  }

  @Post("projects/:projectId/chat/:channelId/messages")
  sendMessage(@UserId() userId: string, @Param("projectId") projectId: string, @Param("channelId") channelId: string, @Body() body: SendMessageDto) {
    if (!body.text.trim() && body.fileId === undefined) throw new BadRequestException("메시지 내용이 비어 있습니다.");
    return this.db.asUser(userId, async (query) => {
      const me = await myMember(query, projectId);
      const [row] = await query<{ id: number }>(
        "insert into public.chat_messages(project_id, channel_id, sender_id, text, file_id) values ($1, $2, $3, $4, $5) returning id",
        [projectId, channelId, me.id, body.text, body.fileId ?? null]);
      return mapMessage({ ...(await selectOneJson(query, "select * from public.chat_messages where id = $1", [row.id])), message_reads: [], message_reactions: [] });
    });
  }

  // 화면에 보인 메시지들을 읽음으로. 이미 읽은 것은 건너뛴다.
  @Post("projects/:projectId/chat/read")
  @HttpCode(204)
  async markRead(@UserId() userId: string, @Param("projectId") projectId: string, @Body() body: ReadDto) {
    if (body.messageIds.length === 0) return;
    await this.db.asUser(userId, async (query) => {
      const me = await myMember(query, projectId);
      await query(
        "insert into public.message_reads(message_id, member_id, project_id) select unnest($1::bigint[]), $2, $3 on conflict do nothing",
        [body.messageIds, me.id, projectId]);
    });
  }

  @Put("projects/:projectId/chat/messages/:messageId/reaction")
  @HttpCode(204)
  async setReaction(@UserId() userId: string, @Param("projectId") projectId: string, @Param("messageId", ParseIntPipe) messageId: number, @Body() body: ReactionDto) {
    await this.db.asUser(userId, async (query) => {
      const me = await myMember(query, projectId);
      if (body.active) {
        await query("insert into public.message_reactions(message_id, member_id, project_id, emoji) values ($1, $2, $3, $4) on conflict do nothing",
          [messageId, me.id, projectId, body.emoji]);
      } else {
        await query("delete from public.message_reactions where message_id = $1 and member_id = $2 and emoji = $3", [messageId, me.id, body.emoji]);
      }
    });
  }

  // ── 단체방 ──
  @Get("projects/:projectId/chat-groups")
  listChatGroups(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, (query) => selectJson(query, CHAT_GROUPS_SQL, [projectId]));
  }

  // 팀장·부팀장 여부, 인원, 같은 프로젝트 팀원인지는 create_chat_group 이 검사한다.
  @Post("projects/:projectId/chat-groups")
  createChatGroup(@UserId() userId: string, @Param("projectId") projectId: string, @Body() body: CreateChatGroupDto) {
    return this.db.asUser(userId, async (query) => ({
      id: await scalarJson<string>(query, "public.create_chat_group($1, $2, $3::uuid[])", [projectId, body.name, body.memberIds]),
    }));
  }

  @Post("chat-groups/:groupId/members")
  @HttpCode(204)
  async addChatGroupMembers(@UserId() userId: string, @Param("groupId", ParseUUIDPipe) groupId: string, @Body() body: AddChatGroupMembersDto) {
    await this.db.asUser(userId, (query) => query("select public.add_chat_group_members($1::uuid, $2::uuid[])", [groupId, body.memberIds]));
  }

  // ── 채팅 도구(투표·제비뽑기·사다리·룰렛): 결과는 DB 함수가 정한다 ──
  @Post("projects/:projectId/chat/:channelId/tools")
  createTool(@UserId() userId: string, @Param("projectId") projectId: string, @Param("channelId") channelId: string, @Body() body: ToolCreateDto) {
    return this.db.asUser(userId, async (query) => {
      const result = await scalarJson<{ message: Record<string, unknown>; event: Record<string, unknown> }>(
        query, "public.chat_tool_create($1, $2, $3, $4::jsonb)", [projectId, channelId, body.text, JSON.stringify(body.config)]);
      return { message: mapMessage({ ...result.message, message_reads: [], message_reactions: [] }), event: mapToolEvent(result.event) };
    });
  }

  @Post("chat/messages/:messageId/tool-actions")
  actTool(@UserId() userId: string, @Param("messageId", ParseIntPipe) messageId: number, @Body() body: ToolActDto) {
    return this.db.asUser(userId, async (query) =>
      mapToolEvent(await scalarJson(query, "public.chat_tool_act($1::bigint, $2, $3::jsonb)", [messageId, body.action, JSON.stringify(body.args ?? {})])));
  }

  @Get("projects/:projectId/chat-tool-events")
  listToolEvents(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, async (query) =>
      (await selectJson(query, "select * from public.chat_tool_events where project_id = $1 order by id", [projectId])).map(mapToolEvent));
  }

  // 마지막 접속 시각 기록(오프라인 팀원의 "마지막 접속" 표시용). 본인 팀원 행만 — DB 함수가 검사한다.
  // 실패해도 화면에는 영향이 없으므로 오류를 돌려주지 않는다(Supabase 버전과 같음).
  @Post("members/:memberId/presence")
  @HttpCode(204)
  async touchPresence(@UserId() userId: string, @Param("memberId", ParseUUIDPipe) memberId: string) {
    await this.db.asUser(userId, (query) => query("select public.touch_member_presence($1::uuid)", [memberId])).catch(() => {});
  }
}
