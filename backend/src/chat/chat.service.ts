import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProjectsService } from '../projects/projects.service.js';
import { ChatMessage } from './chat-message.entity.js';
import { ChatMessageRead } from './chat-message-read.entity.js';
import { ChatReaction } from './chat-reaction.entity.js';

const TEAM_CHANNEL_ID = 'all';

// "dm:<idA>:<idB>" (idA < idB 문자열 정렬) — 두 사람의 id만으로 항상 같은 채널 id를 만들 수 있어
// 별도의 채널 테이블이 필요 없다.
export function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join(':')}`;
}

function dmParticipants(channelId: string): [string, string] | null {
  if (!channelId.startsWith('dm:')) return null;
  const parts = channelId.slice(3).split(':');
  if (parts.length !== 2) return null;
  return [parts[0], parts[1]];
}

export interface ChatMessageWithExtras extends ChatMessage {
  readBy: string[];
  reactions: { userId: string; emoji: string }[];
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly messagesRepository: Repository<ChatMessage>,
    @InjectRepository(ChatMessageRead)
    private readonly readsRepository: Repository<ChatMessageRead>,
    @InjectRepository(ChatReaction)
    private readonly reactionsRepository: Repository<ChatReaction>,
    private readonly projectsService: ProjectsService,
  ) {}

  // 프로젝트 멤버인지 + (DM이면) 그 대화의 당사자인지 확인한다.
  private async assertChannelAccess(projectId: string, channelId: string, userId: string): Promise<void> {
    await this.projectsService.assertMembership(projectId, userId);
    const dm = dmParticipants(channelId);
    if (dm && !dm.includes(userId)) {
      throw new ForbiddenException('이 대화에 접근할 수 없습니다.');
    }
  }

  private async attachExtras(messages: ChatMessage[]): Promise<ChatMessageWithExtras[]> {
    if (messages.length === 0) return [];
    const ids = messages.map((m) => m.id);
    const [reads, reactions] = await Promise.all([
      this.readsRepository.find({ where: { messageId: In(ids) } }),
      this.reactionsRepository.find({ where: { messageId: In(ids) } }),
    ]);
    const readsByMessage = new Map<string, string[]>();
    for (const r of reads) {
      const list = readsByMessage.get(r.messageId) ?? [];
      list.push(r.userId);
      readsByMessage.set(r.messageId, list);
    }
    const reactionsByMessage = new Map<string, { userId: string; emoji: string }[]>();
    for (const r of reactions) {
      const list = reactionsByMessage.get(r.messageId) ?? [];
      list.push({ userId: r.userId, emoji: r.emoji });
      reactionsByMessage.set(r.messageId, list);
    }
    return messages.map((m) => ({
      ...m,
      readBy: readsByMessage.get(m.id) ?? [],
      reactions: reactionsByMessage.get(m.id) ?? [],
    }));
  }

  async listMessages(projectId: string, channelId: string, userId: string): Promise<ChatMessageWithExtras[]> {
    await this.assertChannelAccess(projectId, channelId, userId);
    const messages = await this.messagesRepository.find({
      where: { projectId, channelId },
      order: { createdAt: 'ASC' },
    });
    return this.attachExtras(messages);
  }

  async sendMessage(
    projectId: string,
    channelId: string,
    userId: string,
    input: { text?: string; fileId?: string },
  ): Promise<ChatMessageWithExtras> {
    await this.assertChannelAccess(projectId, channelId, userId);
    const saved = await this.messagesRepository.save(
      this.messagesRepository.create({
        projectId,
        channelId,
        senderId: userId,
        text: input.text?.trim() || null,
        fileId: input.fileId ?? null,
      }),
    );
    return { ...saved, readBy: [], reactions: [] };
  }

  // 그 채널에서 본인이 보내지 않은, 아직 안 읽은 메시지를 전부 읽음 처리한다.
  async markChannelRead(projectId: string, channelId: string, userId: string): Promise<void> {
    await this.assertChannelAccess(projectId, channelId, userId);
    const unread = await this.messagesRepository
      .createQueryBuilder('m')
      .leftJoin(ChatMessageRead, 'r', 'r.message_id = m.id AND r.user_id = :userId', { userId })
      .where('m.project_id = :projectId', { projectId })
      .andWhere('m.channel_id = :channelId', { channelId })
      .andWhere('m.sender_id != :userId', { userId })
      .andWhere('r.id IS NULL')
      .select('m.id', 'id')
      .getRawMany<{ id: string }>();
    if (unread.length === 0) return;
    await this.readsRepository
      .createQueryBuilder()
      .insert()
      .values(unread.map((m) => ({ messageId: m.id, userId })))
      .orIgnore()
      .execute();
  }

  async toggleReaction(
    projectId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<{ userId: string; emoji: string }[]> {
    const message = await this.messagesRepository.findOne({ where: { id: messageId, projectId } });
    if (!message) throw new ForbiddenException('메시지를 찾을 수 없습니다.');
    await this.assertChannelAccess(projectId, message.channelId, userId);
    const existing = await this.reactionsRepository.findOne({ where: { messageId, userId, emoji } });
    if (existing) {
      await this.reactionsRepository.delete(existing.id);
    } else {
      await this.reactionsRepository.save(this.reactionsRepository.create({ messageId, userId, emoji }));
    }
    const reactions = await this.reactionsRepository.find({ where: { messageId } });
    return reactions.map((r) => ({ userId: r.userId, emoji: r.emoji }));
  }

  // 이 프로젝트에서 나와 관련된 모든 채널("팀 전체" + 다른 멤버 각각과의 DM)의 안 읽은 메시지 수.
  async listUnreadCounts(projectId: string, userId: string): Promise<{ channelId: string; count: number }[]> {
    await this.projectsService.assertMembership(projectId, userId);
    const memberIds = await this.projectsService.listMemberUserIds(projectId);
    const channelIds = [TEAM_CHANNEL_ID, ...memberIds.filter((id) => id !== userId).map((id) => dmChannelId(userId, id))];

    const rows = await this.messagesRepository
      .createQueryBuilder('m')
      .leftJoin(ChatMessageRead, 'r', 'r.message_id = m.id AND r.user_id = :userId', { userId })
      .where('m.project_id = :projectId', { projectId })
      .andWhere('m.channel_id IN (:...channelIds)', { channelIds })
      .andWhere('m.sender_id != :userId', { userId })
      .andWhere('r.id IS NULL')
      .select('m.channel_id', 'channelId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('m.channel_id')
      .getRawMany<{ channelId: string; count: string }>();

    const countByChannel = new Map(rows.map((r) => [r.channelId, Number(r.count)]));
    return channelIds.map((channelId) => ({ channelId, count: countByChannel.get(channelId) ?? 0 }));
  }
}
