import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { FilesService } from './files.service.js';
import { SyncFilesDto } from './dto/sync-files.dto.js';
import { SetTagDto } from './dto/set-tag.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { CreatePinDto } from './dto/create-pin.dto.js';

@Controller('projects/:projectId/files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.filesService.listFiles(projectId, user.sub);
  }

  @Get('branches')
  listBranches(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.filesService.listBranchesForProject(projectId, user.sub);
  }

  @Get('pins')
  listPinCounts(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.filesService.listPinCountsForProject(projectId, user.sub);
  }

  @Get('versions-calendar')
  listVersionsForCalendar(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Query('fileId') fileId?: string,
  ) {
    return this.filesService.listVersionsForCalendar(projectId, user.sub, fileId);
  }

  @Get(':fileId')
  getOne(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.filesService.getFile(projectId, fileId, user.sub);
  }

  @Get(':fileId/versions')
  listVersions(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.filesService.listVersions(projectId, fileId, user.sub);
  }

  @Post(':fileId/versions/:versionId/promote')
  promote(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.filesService.promoteVersion(projectId, fileId, versionId, user.sub);
  }

  @Post('sync')
  sync(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: SyncFilesDto,
  ) {
    return this.filesService.syncFiles(projectId, user.sub, dto.files);
  }

  @Patch(':fileId/tag')
  setTag(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @Body() dto: SetTagDto,
  ) {
    return this.filesService.setTag(projectId, fileId, dto.tag, user.sub);
  }

  @Get(':fileId/comments')
  listComments(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.filesService.listComments(projectId, fileId, user.sub);
  }

  @Post(':fileId/comments')
  addComment(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.filesService.addComment(projectId, fileId, user.sub, dto.content, dto.versionId);
  }

  @Get(':fileId/pins')
  listPins(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.filesService.listPins(projectId, fileId, user.sub);
  }

  @Post(':fileId/pins')
  createPin(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @Body() dto: CreatePinDto,
  ) {
    return this.filesService.createPin(projectId, fileId, dto.versionId, dto.label, user.sub);
  }

  @Delete(':fileId/pins/:pinId')
  deletePin(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @Param('pinId') pinId: string,
  ) {
    return this.filesService.deletePin(projectId, fileId, pinId, user.sub);
  }
}
