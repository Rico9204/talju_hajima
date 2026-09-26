import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { ChatService } from './chat.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { ToggleReactionDto } from './dto/toggle-reaction.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('unread')
  listUnread(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.chatService.listUnreadCounts(projectId, user.sub);
  }

  @Get(':channelId/messages')
  listMessages(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.chatService.listMessages(projectId, channelId, user.sub);
  }

  @Post(':channelId/messages')
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('channelId') channelId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(projectId, channelId, user.sub, dto);
  }

  @Post(':channelId/read')
  async markRead(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('channelId') channelId: string,
  ) {
    await this.chatService.markChannelRead(projectId, channelId, user.sub);
    return { ok: true };
  }

  @Post('messages/:messageId/reactions')
  toggleReaction(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('messageId') messageId: string,
    @Body() dto: ToggleReactionDto,
  ) {
    return this.chatService.toggleReaction(projectId, messageId, user.sub, dto.emoji);
  }
}
