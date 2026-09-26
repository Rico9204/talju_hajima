import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";
import { TODAY_SQL, myMember } from "./actor.js";
import { AuthGuard, UserId } from "./auth.js";
import { Db, selectJson, selectOneJson, type Query } from "./db.js";
import { mapComment, mapFile, mapFolder } from "./mappers.js";

const FOLDER_COLORS = ["#2563eb", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444", "#06b6d4"];
const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅"];

class MoveFileDto {
  // null = 워크스페이스 루트. 키를 빠뜨리면(undefined) 잘못된 요청으로 본다.
  @ValidateIf((dto: MoveFileDto) => dto.folderId !== null) @IsInt() folderId!: number | null;
}

class CreateFolderDto {
  @IsString() @MaxLength(100) name!: string;
  @ValidateIf((dto: CreateFolderDto) => dto.parentId !== null) @IsInt() parentId!: number | null;
}

class TagsDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(30, { each: true }) tags!: string[];
}

class PinnedDto {
  @IsBoolean() pinned!: boolean;
}

class VersionTextDto {
  @IsString() @MaxLength(2_000_000) text!: string;
  @IsString() @MaxLength(30) status!: string;
}

class FileCommentDto {
  @IsString() @MaxLength(2000) text!: string;
  @IsOptional() @IsInt() versionId?: number | null;
}

class ReactionDto {
  @IsIn(EMOJIS) emoji!: string;
  @IsBoolean() active!: boolean;
}

// 파일 + 버전 + 댓글(+반응). 읽기 권한(RLS)이 그대로 걸린다.
const FILES_SQL = `
  select f.*,
    coalesce((select jsonb_agg(to_jsonb(v)) from public.file_versions v where v.file_id = f.id), '[]'::jsonb) as file_versions,
    coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('file_comment_reactions',
      coalesce((select jsonb_agg(jsonb_build_object('member_id', r.member_id, 'emoji', r.emoji))
        from public.file_comment_reactions r where r.comment_id = c.id), '[]'::jsonb)))
      from public.file_comments c where c.file_id = f.id), '[]'::jsonb) as file_comments
  from public.files f where f.project_id = $1 order by f.id desc`;

async function projectOfFile(query: Query, fileId: number): Promise<string> {
  const row = await selectOneJson(query, "select project_id from public.files where id = $1", [fileId]);
  if (!row) throw new BadRequestException("파일을 찾을 수 없습니다.");
  return row.project_id;
}

// 권한(진행 중인 프로젝트의 참여자, 같은 프로젝트 폴더, 삭제는 팀장·부팀장·올린 사람 등)과
// 비어 있는지·태그 규칙 검사는 DB 함수와 권한 규칙이 한다. 원본 파일 업로드·다운로드·정리는 파일 저장소 단계에서 옮긴다.
@Controller()
@UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(private readonly db: Db) {}

  @Get("projects/:projectId/folders")
  listFolders(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, async (query) =>
      (await selectJson(query, "select * from public.folders where project_id = $1 order by id", [projectId])).map(mapFolder));
  }

  // 색은 프로젝트의 폴더 수에 따라 돌아가며 정한다(화면 쪽과 같은 규칙). 깊이 제한은 DB가 검사한다.
  @Post("projects/:projectId/folders")
  createFolder(@UserId() userId: string, @Param("projectId") projectId: string, @Body() body: CreateFolderDto) {
    const name = body.name.trim();
    if (!name) throw new BadRequestException("폴더 이름이 비어 있습니다.");
    return this.db.asUser(userId, async (query) => {
      const actor = await myMember(query, projectId);
      const [{ count }] = await selectJson(query, "select count(*)::int as count from public.folders where project_id = $1", [projectId]);
      const [row] = await query<{ id: number }>(
        `insert into public.folders(project_id, parent_id, name, color, created_by, date) values ($1, $2, $3, $4, $5, ${TODAY_SQL}) returning id`,
        [projectId, body.parentId, name, FOLDER_COLORS[count % FOLDER_COLORS.length], actor.name]);
      return mapFolder(await selectOneJson(query, "select * from public.folders where id = $1", [row.id]));
    });
  }

  @Delete("workspace/folders/:folderId")
  @HttpCode(204)
  async deleteFolder(@UserId() userId: string, @Param("folderId", ParseIntPipe) folderId: number) {
    await this.db.asUser(userId, (query) => query("select public.delete_workspace_folder($1::bigint)", [folderId]));
  }

  @Get("projects/:projectId/files")
  listFiles(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, async (query) => (await selectJson(query, FILES_SQL, [projectId])).map(mapFile));
  }

  // 메타데이터를 지우고 원본 정리 대기열에 올린다(원본 파일 삭제는 파일 저장소 단계).
  @Delete("workspace/files/:fileId")
  @HttpCode(204)
  async deleteFile(@UserId() userId: string, @Param("fileId", ParseIntPipe) fileId: number) {
    await this.db.asUser(userId, (query) => query("select public.delete_workspace_file($1::bigint)", [fileId]));
  }

  @Post("workspace/files/:fileId/move")
  @HttpCode(204)
  async moveFile(@UserId() userId: string, @Param("fileId", ParseIntPipe) fileId: number, @Body() body: MoveFileDto) {
    await this.db.asUser(userId, (query) => query("select public.move_workspace_file($1::bigint, $2::bigint)", [fileId, body.folderId]));
  }

  @Put("workspace/files/:fileId/tags")
  @HttpCode(204)
  async setTags(@UserId() userId: string, @Param("fileId", ParseIntPipe) fileId: number, @Body() body: TagsDto) {
    await this.db.asUser(userId, (query) => query("select public.set_workspace_file_tags($1::bigint, $2::text[])", [fileId, body.tags]));
  }

  @Post("workspace/files/:fileId/versions/:versionId/promote")
  @HttpCode(204)
  async promoteVersion(@UserId() userId: string, @Param("fileId", ParseIntPipe) fileId: number, @Param("versionId", ParseIntPipe) versionId: number) {
    await this.db.asUser(userId, (query) => query("select public.promote_workspace_version($1::bigint, $2::bigint)", [fileId, versionId]));
  }

  @Put("workspace/files/:fileId/versions/:versionId/pinned")
  @HttpCode(204)
  async pinVersion(@UserId() userId: string, @Param("fileId", ParseIntPipe) fileId: number, @Param("versionId", ParseIntPipe) versionId: number, @Body() body: PinnedDto) {
    await this.db.asUser(userId, (query) => query("select public.pin_workspace_version($1::bigint, $2::bigint, $3)", [fileId, versionId, body.pinned]));
  }

  // 검색용으로 뽑은 글자(PDF·문서 등에서 브라우저가 추출)를 버전에 기록.
  @Put("workspace/versions/:versionId/text")
  @HttpCode(204)
  async setVersionText(@UserId() userId: string, @Param("versionId", ParseIntPipe) versionId: number, @Body() body: VersionTextDto) {
    await this.db.asUser(userId, (query) => query("select public.set_workspace_version_text($1::bigint, $2, $3)", [versionId, body.text, body.status]));
  }

  @Post("workspace/files/:fileId/comments")
  addComment(@UserId() userId: string, @Param("fileId", ParseIntPipe) fileId: number, @Body() body: FileCommentDto) {
    const text = body.text.trim();
    if (!text) throw new BadRequestException("댓글 내용이 비어 있습니다.");
    return this.db.asUser(userId, async (query) => {
      const actor = await myMember(query, await projectOfFile(query, fileId));
      const [row] = await query<{ id: number }>(
        `insert into public.file_comments(file_id, author, avatar, date, text, version_id) values ($1, $2, $3, ${TODAY_SQL}, $4, $5) returning id`,
        [fileId, actor.name, actor.avatar, text, body.versionId ?? null]);
      return mapComment(await selectOneJson(query, "select * from public.file_comments where id = $1", [row.id]));
    });
  }

  @Put("workspace/comments/:commentId/reaction")
  @HttpCode(204)
  async setCommentReaction(@UserId() userId: string, @Param("commentId", ParseIntPipe) commentId: number, @Body() body: ReactionDto) {
    await this.db.asUser(userId, async (query) => {
      const comment = await selectOneJson(query, "select f.project_id from public.file_comments c join public.files f on f.id = c.file_id where c.id = $1", [commentId]);
      if (!comment) throw new BadRequestException("댓글을 찾을 수 없습니다.");
      const me = await myMember(query, comment.project_id);
      if (body.active) {
        await query("insert into public.file_comment_reactions(comment_id, member_id, emoji) values ($1, $2, $3) on conflict do nothing", [commentId, me.id, body.emoji]);
      } else {
        await query("delete from public.file_comment_reactions where comment_id = $1 and member_id = $2 and emoji = $3", [commentId, me.id, body.emoji]);
      }
    });
  }

  // 원본 정리 대기열(파일 저장소 단계에서 실제 삭제에 쓴다).
  @Get("projects/:projectId/workspace-cleanup")
  pendingCleanup(@UserId() userId: string, @Param("projectId") projectId: string) {
    return this.db.asUser(userId, async (query) =>
      (await selectJson(query, "select storage_path from public.workspace_delete_queue where project_id = $1 order by storage_path limit 100", [projectId]))
        .map((r) => r.storage_path));
  }

  @Get("me/workspace-cleanup-projects")
  cleanupProjects(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) =>
      [...new Set((await selectJson(query, "select project_id from public.workspace_delete_queue limit 1000")).map((r) => r.project_id))]);
  }
}
