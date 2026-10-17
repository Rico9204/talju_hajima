import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProjectsService } from '../projects/projects.service.js';
import { ChatMessage } from './chat-message.entity.js';
import { ChatMessageRead } from './chat-message-read.entity.js';
import { ChatReaction } from './chat-reaction.entity.js';
import { ChatGroup } from './chat-group.entity.js';
import { ChatGroupMember } from './chat-group-member.entity.js';

function groupIdFromChannel(channelId: string): string | null {
  return channelId.startsWith('grp:') ? channelId.slice(4) : null;
}

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
    @InjectRepository(ChatGroup)
    private readonly groupsRepository: Repository<ChatGroup>,
    @InjectRepository(ChatGroupMember)
    private readonly groupMembersRepository: Repository<ChatGroupMember>,
    private readonly projectsService: ProjectsService,
  ) {}

  // 프로젝트 멤버인지 + (DM이면 그 당사자인지, 그룹 채팅이면 그 그룹의 멤버인지) 확인한다.
  private async assertChannelAccess(projectId: string, channelId: string, userId: string): Promise<void> {
    await this.projectsService.assertMembership(projectId, userId);
    const dm = dmParticipants(channelId);
    if (dm && !dm.includes(userId)) {
      throw new ForbiddenException('이 대화에 접근할 수 없습니다.');
    }
    const groupId = groupIdFromChannel(channelId);
    if (groupId) {
      const membership = await this.groupMembersRepository.findOne({ where: { groupId, userId } });
      if (!membership) throw new ForbiddenException('이 단체 채팅방의 멤버가 아닙니다.');
    }
  }

  async listGroups(projectId: string, userId: string): Promise<{ id: string; name: string; memberIds: string[] }[]> {
    await this.projectsService.assertMembership(projectId, userId);
    const myGroups = await this.groupMembersRepository.find({ where: { userId } });
    const myGroupIds = new Set(myGroups.map((m) => m.groupId));
    const groups = await this.groupsRepository.find({ where: { projectId }, order: { createdAt: 'ASC' } });
    const relevant = groups.filter((g) => myGroupIds.has(g.id));
    const allMembers = await this.groupMembersRepository.find({ where: { groupId: In(relevant.map((g) => g.id)) } });
    return relevant.map((g) => ({
      id: `grp:${g.id}`,
      name: g.name,
      memberIds: allMembers.filter((m) => m.groupId === g.id).map((m) => m.userId),
    }));
  }

  async createGroup(projectId: string, userId: string, name: string, memberIds: string[]): Promise<string> {
    await this.projectsService.assertMembership(projectId, userId);
    const group = await this.groupsRepository.save(this.groupsRepository.create({ projectId, name, createdById: userId }));
    const allMemberIds = new Set([userId, ...memberIds]);
    await this.groupMembersRepository.save(
      [...allMemberIds].map((id) => this.groupMembersRepository.create({ groupId: group.id, userId: id })),
    );
    return `grp:${group.id}`;
  }

  async addGroupMembers(groupId: string, userId: string, memberIds: string[]): Promise<void> {
    const group = await this.groupsRepository.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('채팅 그룹을 찾을 수 없습니다.');
    const myMembership = await this.groupMembersRepository.findOne({ where: { groupId, userId } });
    if (!myMembership) throw new ForbiddenException('이 단체 채팅방의 멤버가 아닙니다.');
    if (memberIds.length === 0) throw new BadRequestException('추가할 멤버가 없습니다.');
    const existing = await this.groupMembersRepository.find({ where: { groupId, userId: In(memberIds) } });
    const existingIds = new Set(existing.map((m) => m.userId));
    const toAdd = memberIds.filter((id) => !existingIds.has(id));
    if (toAdd.length > 0) {
      await this.groupMembersRepository.save(toAdd.map((id) => this.groupMembersRepository.create({ groupId, userId: id })));
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
