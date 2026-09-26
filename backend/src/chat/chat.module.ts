import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { ChatMessage } from './chat-message.entity.js';
import { ChatMessageRead } from './chat-message-read.entity.js';
import { ChatReaction } from './chat-reaction.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, ChatMessageRead, ChatReaction]),
    AuthModule,
    ProjectsModule,
  ],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [TypeOrmModule],
})
export class ChatModule {}
