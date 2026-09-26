import { Body, Controller, Delete, HttpCode, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { IsInt, ValidateIf } from "class-validator";
import { AuthGuard, UserId } from "./auth.js";
import { Db } from "./db.js";

class MoveFileDto {
  // null = 워크스페이스 루트. 키를 빠뜨리면(undefined) 잘못된 요청으로 본다.
  @ValidateIf((dto: MoveFileDto) => dto.folderId !== null) @IsInt() folderId!: number | null;
}

// 권한(진행 중인 프로젝트의 참여자, 같은 프로젝트 폴더, 폴더 삭제는 팀장·부팀장·생성자)과
// 비어 있는지 검사는 모두 DB 함수가 한다.
@Controller("workspace")
@UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(private readonly db: Db) {}

  @Post("files/:fileId/move")
  @HttpCode(204)
  async moveFile(@UserId() userId: string, @Param("fileId", ParseIntPipe) fileId: number, @Body() body: MoveFileDto) {
    await this.db.asUser(userId, (query) => query("select public.move_workspace_file($1::bigint, $2::bigint)", [fileId, body.folderId]));
  }

  @Delete("folders/:folderId")
  @HttpCode(204)
  async deleteFolder(@UserId() userId: string, @Param("folderId", ParseIntPipe) folderId: number) {
    await this.db.asUser(userId, (query) => query("select public.delete_workspace_folder($1::bigint)", [folderId]));
  }
}
