import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto.js';
import { SetScheduleLinkDto } from './dto/set-schedule-link.dto.js';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto.js';
import { ToggleChecklistItemDto } from './dto/toggle-checklist-item.dto.js';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto.js';
import { ToggleCommentReactionDto } from './dto/toggle-comment-reaction.dto.js';

@UseGuards(JwtAuthGuard)
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('projects/:projectId/tasks')
  list(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.tasksService.listForProject(projectId, user.sub);
  }

  @Post('projects/:projectId/tasks')
  create(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(projectId, user.sub, dto);
  }

  @Patch('tasks/:id/status')
  updateStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateTaskStatusDto) {
    return this.tasksService.updateStatus(id, user.sub, dto.status);
  }

  @Patch('tasks/:id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, user.sub, dto);
  }

  @Delete('tasks/:id')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.tasksService.delete(id, user.sub);
    return { ok: true };
  }

  @Patch('tasks/:id/schedule-link')
  setScheduleLink(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SetScheduleLinkDto) {
    return this.tasksService.setScheduleLink(id, user.sub, dto);
  }

  @Get('tasks/:id/checklist')
  listChecklist(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.listChecklist(id, user.sub);
  }

  @Post('tasks/:id/checklist')
  addChecklistItem(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CreateChecklistItemDto) {
    return this.tasksService.addChecklistItem(id, user.sub, dto.text);
  }

  @Patch('tasks/checklist/:itemId')
  toggleChecklistItem(
    @CurrentUser() user: JwtPayload,
    @Param('itemId') itemId: string,
    @Body() dto: ToggleChecklistItemDto,
  ) {
    return this.tasksService.toggleChecklistItem(itemId, user.sub, dto.done);
  }

  @Get('tasks/:id/comments')
  listComments(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.listComments(id, user.sub);
  }

  @Post('tasks/:id/comments')
  addComment(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CreateTaskCommentDto) {
    return this.tasksService.addComment(id, user.sub, dto.content);
  }

  @Post('tasks/comments/:commentId/reactions')
  toggleCommentReaction(
    @CurrentUser() user: JwtPayload,
    @Param('commentId') commentId: string,
    @Body() dto: ToggleCommentReactionDto,
  ) {
    return this.tasksService.toggleCommentReaction(commentId, user.sub, dto.emoji);
  }
}
