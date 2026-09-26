import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsString, IsUUID, Length } from "class-validator";
import { AuthGuard, UserId } from "./auth.js";
import { Db } from "./db.js";

class CreateChatGroupDto {
  @IsString() @Length(1, 30) name!: string;
  @IsArray() @ArrayMaxSize(200) @IsUUID("all", { each: true }) memberIds!: string[];
}

class AddChatGroupMembersDto {
  @IsArray() @ArrayMaxSize(200) @IsUUID("all", { each: true }) memberIds!: string[];
}

// 읽기 권한(RLS)이 그대로 걸리므로, 볼 수 없는 채널·방은 빈 목록이 된다.
// 행은 DB에서 JSON으로 만들어 돌려준다 — 날짜 형식 등이 Supabase(PostgREST) 응답과 같아서
// 프론트의 기존 변환 함수(mapMessage)를 그대로 쓸 수 있다.
const MESSAGES_SQL = `
  select to_jsonb(m) || jsonb_build_object(
    'message_reads', coalesce((select jsonb_agg(jsonb_build_object('member_id', r.member_id))
      from public.message_reads r where r.message_id = m.id and r.project_id = m.project_id), '[]'::jsonb),
    'message_reactions', coalesce((select jsonb_agg(jsonb_build_object('member_id', x.member_id, 'emoji', x.emoji))
      from public.message_reactions x where x.message_id = m.id and x.project_id = m.project_id), '[]'::jsonb)
  ) as item
  from public.chat_messages m
  where m.project_id = $1 and m.channel_id = $2
  order by m.id`;

const CHAT_GROUPS_SQL = `
  select jsonb_build_object('id', g.id, 'name', g.name, 'memberIds',
    coalesce((select jsonb_agg(gm.member_id) from public.chat_group_members gm where gm.group_id = g.id), '[]'::jsonb)) as item
  from public.chat_groups g
  where g.project_id = $1
  order by g.created_at`;

@Controller()
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly db: Db) {}

  @Get("projects/:projectId/chat/:channelId/messages")
  listMessages(@UserId() userId: string, @Param("projectId") projectId: string, @Param("channelId") channelId: string) {
    return this.db.asUser(userId, async (query) => (await query<{ item: unknown }>(MESSAGES_SQL, [projectId, channelId])).map((row) => row.item));
  }

  @Get("projects/:projectId/chat-groups")
  listChatGroups(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, async (query) => (await query<{ item: unknown }>(CHAT_GROUPS_SQL, [projectId])).map((row) => row.item));
  }

  // 팀장·부팀장 여부, 인원, 같은 프로젝트 팀원인지는 create_chat_group 이 검사한다.
  @Post("projects/:projectId/chat-groups")
  createChatGroup(@UserId() userId: string, @Param("projectId") projectId: string, @Body() body: CreateChatGroupDto) {
    return this.db.asUser(userId, async (query) => {
      const [row] = await query<{ id: string }>("select public.create_chat_group($1, $2, $3::uuid[]) as id", [projectId, body.name, body.memberIds]);
      return { id: row.id };
    });
  }

  @Post("chat-groups/:groupId/members")
  @HttpCode(204)
  async addChatGroupMembers(@UserId() userId: string, @Param("groupId", ParseUUIDPipe) groupId: string, @Body() body: AddChatGroupMembersDto) {
    await this.db.asUser(userId, (query) => query("select public.add_chat_group_members($1::uuid, $2::uuid[])", [groupId, body.memberIds]));
  }
}
