import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { ChatToolsService } from './chat-tools.service.js';
import { CreateToolDto } from './dto/create-tool.dto.js';
import { ActToolDto } from './dto/act-tool.dto.js';

@UseGuards(JwtAuthGuard)
@Controller()
export class ChatToolsController {
  constructor(private readonly chatToolsService: ChatToolsService) {}

  @Post('projects/:projectId/chat/:channelId/tools')
  createTool(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('channelId') channelId: string,
    @Body() dto: CreateToolDto,
  ) {
    return this.chatToolsService.createTool(projectId, channelId, user.sub, dto.text, dto.config);
  }

  @Post('chat/messages/:messageId/tool-actions')
  actTool(@CurrentUser() user: JwtPayload, @Param('messageId') messageId: string, @Body() dto: ActToolDto) {
    return this.chatToolsService.act(messageId, user.sub, dto.action, dto.args ?? {});
  }

  @Get('projects/:projectId/chat-tool-events')
  listToolEvents(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.chatToolsService.listEvents(projectId, user.sub);
  }
}
