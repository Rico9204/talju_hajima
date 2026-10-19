import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { ChatToolsService } from './chat-tools.service.js';
import { ChatToolsController } from './chat-tools.controller.js';
import { ChatMessage } from './chat-message.entity.js';
import { ChatMessageRead } from './chat-message-read.entity.js';
import { ChatReaction } from './chat-reaction.entity.js';
import { ChatGroup } from './chat-group.entity.js';
import { ChatGroupMember } from './chat-group-member.entity.js';
import { ChatToolEvent } from './chat-tool-event.entity.js';
import { ChatToolSecret } from './chat-tool-secret.entity.js';
import { ProjectMember } from '../projects/project-member.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, ChatMessageRead, ChatReaction, ChatGroup, ChatGroupMember, ChatToolEvent, ChatToolSecret, ProjectMember]),
    AuthModule,
    ProjectsModule,
  ],
  providers: [ChatService, ChatToolsService],
  controllers: [ChatController, ChatToolsController],
  exports: [TypeOrmModule, ChatService],
})
export class ChatModule {}
