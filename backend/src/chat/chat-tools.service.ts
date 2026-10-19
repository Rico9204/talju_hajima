import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ChatMessage } from './chat-message.entity.js';
import { ChatToolEvent, ChatToolEventType, ChatToolKind } from './chat-tool-event.entity.js';
import { ChatToolSecret } from './chat-tool-secret.entity.js';
import { ProjectMember } from '../projects/project-member.entity.js';
import { ChatService } from './chat.service.js';

const TOOL_MESSAGE_PREFIX = '[TALJU_CHAT_TOOL]:';

interface ToolPayload {
  type: ChatToolKind;
  server?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

function parseToolMessage(text: string | null): ToolPayload | null {
  if (!text || !text.startsWith(TOOL_MESSAGE_PREFIX)) return null;
  try {
    return JSON.parse(text.slice(TOOL_MESSAGE_PREFIX.length));
  } catch {
    return null;
  }
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface LadderMatch {
  participantId: string;
  participantName: string;
  resultText: string;
  endCol: number;
}

// 사다리: 선(step, fromCol)을 따라 각 참가자가 도착하는 결과를 계산한다.
// (talju_hajima_update의 chat_ladder_matches() SQL 함수를 그대로 TS로 포팅.)
function ladderMatches(
  ls: number[],
  lc: number[],
  steps: number,
  participants: { id: string; name: string }[],
  results: string[],
): LadderMatch[] {
  return participants.map((p, startCol) => {
    let cur = startCol;
    for (let s = 0; s < steps; s++) {
      let moved = false;
      for (let j = 0; j < ls.length; j++) {
        if (ls[j] === s && lc[j] === cur) {
          cur += 1;
          moved = true;
          break;
        }
      }
      if (!moved) {
        for (let j = 0; j < ls.length; j++) {
          if (ls[j] === s && lc[j] === cur - 1) {
            cur -= 1;
            break;
          }
        }
      }
    }
    return { participantId: p.id, participantName: p.name, resultText: results[cur] ?? `결과 ${cur + 1}`, endCol: cur };
  });
}

// 사다리 가로선 생성 — 모든 경계에 선이 1개 이상 있고(2인이면 홀수 개), 모두가 제자리로
// 떨어지는 경우는 다시 뽑는다. (chat_ladder_generate() SQL 함수를 그대로 TS로 포팅.)
function ladderGenerate(
  participants: { id: string; name: string }[],
  results: string[],
): { numSteps: number; lines: { step: number; fromCol: number }[]; matches: Omit<LadderMatch, 'endCol'>[] } {
  const n = participants.length;
  if (n < 2 || n > 20) throw new BadRequestException('사다리 참가자는 2~20명이어야 합니다.');
  const totalSteps = Math.max(n * 2 + 2, 8);

  let bestLs: number[] = [];
  let bestLc: number[] = [];
  let bestMatches: LadderMatch[] | null = null;

  for (let attempt = 0; attempt < 100; attempt++) {
    const ls: number[] = [];
    const lc: number[] = [];
    const colCount = new Array(n - 1).fill(0);
    for (let s = 0; s < totalSteps; s++) {
      for (let c = 0; c < n - 1; c++) {
        let hasLeft = false;
        let hadPrev = false;
        for (let j = 0; j < ls.length; j++) {
          if (ls[j] === s && lc[j] === c - 1) hasLeft = true;
          if (ls[j] === s - 1 && lc[j] === c) hadPrev = true;
        }
        if (hasLeft || hadPrev) continue;
        const prob = colCount[c] < 2 ? 0.75 : 0.4;
        if (Math.random() < prob) {
          ls.push(s);
          lc.push(c);
          colCount[c] += 1;
        }
      }
    }
    const ok = n === 2 ? ls.length % 2 === 1 : colCount.every((c) => c >= 1);
    if (!ok) continue;

    const matches = ladderMatches(ls, lc, totalSteps, participants, results);
    const straight = matches.filter((m, i) => m.endCol === i).length;
    bestLs = ls;
    bestLc = lc;
    bestMatches = matches;
    if (straight < n) break;
  }

  if (!bestMatches) {
    bestLs = [];
    bestLc = [];
    for (let c = 0; c < n - 1; c++) {
      bestLs.push(c * 2);
      bestLc.push(c);
    }
    bestMatches = ladderMatches(bestLs, bestLc, totalSteps, participants, results);
  }

  return {
    numSteps: totalSteps,
    lines: bestLs.map((step, i) => ({ step, fromCol: bestLc[i] })),
    matches: bestMatches.map(({ endCol, ...rest }) => rest),
  };
}

@Injectable()
export class ChatToolsService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly messagesRepository: Repository<ChatMessage>,
    @InjectRepository(ProjectMember)
    private readonly membersRepository: Repository<ProjectMember>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly chatService: ChatService,
  ) {}

  // 이벤트가 속한 메시지의 채널(DM/그룹 채팅일 수 있음)에 접근 권한이 없으면 그 이벤트는
  // 보이지 않는다 — 프로젝트 멤버라고 전부 보이는 게 아니라, chat_tool_events_select RLS와
  // 같은 채널별 필터링을 여기서 재현한다.
  async listEvents(projectId: string, userId: string): Promise<ChatToolEvent[]> {
    const member = await this.membersRepository.findOne({ where: { projectId, userId } });
    if (!member) throw new ForbiddenException('프로젝트 참여자만 사용할 수 있습니다.');

    const events = await this.dataSource.getRepository(ChatToolEvent).find({ where: { projectId }, order: { id: 'ASC' } });
    if (events.length === 0) return [];
    const messages = await this.messagesRepository.find({ where: { id: In([...new Set(events.map((e) => e.messageId))]) } });
    const channelByMessageId = new Map(messages.map((m) => [m.id, m.channelId]));

    const accessByChannel = new Map<string, boolean>();
    const result: ChatToolEvent[] = [];
    for (const event of events) {
      const channelId = channelByMessageId.get(event.messageId);
      if (!channelId) continue;
      let allowed = accessByChannel.get(channelId);
      if (allowed === undefined) {
        allowed = await this.chatService
          .assertChannelAccess(projectId, channelId, userId)
          .then(() => true)
          .catch(() => false);
        accessByChannel.set(channelId, allowed);
      }
      if (allowed) result.push(event);
    }
    return result;
  }

  async createTool(
    projectId: string,
    channelId: string,
    userId: string,
    text: string,
    config: Record<string, unknown>,
  ): Promise<{ message: ChatMessage & { readBy: string[]; reactions: unknown[] }; event: ChatToolEvent }> {
    await this.chatService.assertChannelAccess(projectId, channelId, userId);
    const member = await this.membersRepository.findOne({ where: { projectId, userId } });
    if (!member) throw new ForbiddenException('프로젝트 참여자만 사용할 수 있습니다.');

    const payload = parseToolMessage(text);
    if (!payload || payload.server !== true) throw new BadRequestException('도구 메시지가 아닙니다.');

    return this.dataSource.transaction(async (manager) => {
      const message = await manager.save(
        ChatMessage,
        manager.create(ChatMessage, { projectId, channelId, senderId: userId, text }),
      );
      const event = await this.initTool(manager, message.id, projectId, member.id, payload, config);
      return { message: { ...message, readBy: [], reactions: [] }, event };
    });
  }

  private async initTool(
    manager: EntityManager,
    messageId: string,
    projectId: string,
    actorMemberId: string,
    payload: ToolPayload,
    config: Record<string, unknown>,
  ): Promise<ChatToolEvent> {
    const kind = payload.type;
    let data: Record<string, unknown>;

    if (kind === 'draw') {
      const items = config.items;
      if (!Array.isArray(items) || items.length < 2 || items.length > 50) {
        throw new BadRequestException('제비는 2~50개여야 합니다.');
      }
      const shuffled = shuffle(items).map((it, idx) => ({
        id: idx + 1,
        label: String((it as { label?: unknown })?.label ?? '').slice(0, 40),
        isWinner: !!(it as { isWinner?: unknown })?.isWinner,
      }));
      await manager.save(ChatToolSecret, manager.create(ChatToolSecret, { messageId, projectId, secret: { items: shuffled } }));
      data = { total: shuffled.length, winnerCount: shuffled.filter((i) => i.isWinner).length };
    } else if (kind === 'ladder') {
      const participants = (payload.data?.participants ?? []) as { id: string; name: string }[];
      const results = (payload.data?.results ?? []) as string[];
      data = ladderGenerate(participants, results);
    } else if (kind === 'roulette') {
      const options = payload.data?.options;
      if (!Array.isArray(options) || options.length < 2 || options.length > 20) {
        throw new BadRequestException('룰렛 항목은 2~20개여야 합니다.');
      }
      data = {};
    } else {
      throw new BadRequestException('지원하지 않는 도구입니다.');
    }

    return manager.save(
      ChatToolEvent,
      manager.create(ChatToolEvent, { messageId, projectId, kind, event: 'init', actorMemberId, data }),
    );
  }

  async act(messageId: string, userId: string, action: string, args: Record<string, unknown>): Promise<ChatToolEvent> {
    const message = await this.messagesRepository.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('도구 메시지를 찾을 수 없습니다.');
    await this.chatService.assertChannelAccess(message.projectId, message.channelId, userId);
    const member = await this.membersRepository.findOne({ where: { projectId: message.projectId, userId } });
    if (!member) throw new ForbiddenException('프로젝트 참여자만 사용할 수 있습니다.');

    const payload = parseToolMessage(message.text);
    if (!payload || payload.server !== true) throw new BadRequestException('서버 처리 도구가 아닙니다.');
    const kind = payload.type;

    return this.dataSource.transaction(async (manager) => {
      // 같은 메시지에 대한 동시 행동(동시에 두 번 누름 등)을 한 번에 하나씩만 처리한다.
      await manager.query('select pg_advisory_xact_lock(hashtext($1))', [messageId]);

      const eventsRepo = manager.getRepository(ChatToolEvent);
      const initEvent = await eventsRepo.findOne({ where: { messageId, event: 'init' } });
      if (!initEvent) throw new BadRequestException('아직 준비되지 않은 도구입니다.');

      let ev: ChatToolEvent | null = null;

      if (action === 'draw_pick' && kind === 'draw') {
        const itemId = Number(args.itemId);
        const secret = await manager.getRepository(ChatToolSecret).findOne({ where: { messageId } });
        const items = (secret?.secret?.items ?? []) as { id: number; label: string; isWinner: boolean }[];
        const item = items.find((i) => i.id === itemId);
        if (!item) throw new BadRequestException('없는 제비입니다.');

        const revealedAll = await eventsRepo.findOne({ where: { messageId, event: 'draw_reveal_all' } });
        if (revealedAll) throw new BadRequestException('이미 전체 공개된 제비뽑기입니다.');

        const already = await eventsRepo
          .createQueryBuilder('e')
          .where('e.message_id = :messageId', { messageId })
          .andWhere('e.event = :event', { event: 'draw_pick' })
          .andWhere("e.data->>'itemId' = :itemId", { itemId: String(itemId) })
          .getOne();
        if (already) throw new BadRequestException('이미 열린 제비입니다.');

        ev = await eventsRepo.save(
          eventsRepo.create({
            messageId,
            projectId: message.projectId,
            kind: 'draw',
            event: 'draw_pick',
            actorMemberId: member.id,
            data: { itemId, label: item.label, isWinner: item.isWinner },
          }),
        );
      } else if (action === 'draw_reveal_all' && kind === 'draw') {
        if (message.senderId !== userId) throw new ForbiddenException('만든 사람만 전체 공개할 수 있습니다.');
        const existing = await eventsRepo.findOne({ where: { messageId, event: 'draw_reveal_all' } });
        if (existing) {
          ev = existing;
        } else {
          const secret = await manager.getRepository(ChatToolSecret).findOne({ where: { messageId } });
          ev = await eventsRepo.save(
            eventsRepo.create({
              messageId,
              projectId: message.projectId,
              kind: 'draw',
              event: 'draw_reveal_all',
              actorMemberId: member.id,
              data: { items: secret?.secret?.items ?? [] },
            }),
          );
        }
      } else if (action === 'ladder_reveal' && kind === 'ladder') {
        const existing = await eventsRepo.findOne({ where: { messageId, event: 'ladder_reveal' } });
        ev =
          existing ??
          (await eventsRepo.save(
            eventsRepo.create({ messageId, projectId: message.projectId, kind: 'ladder', event: 'ladder_reveal', actorMemberId: member.id, data: {} }),
          ));
      } else if (action === 'roulette_spin' && kind === 'roulette') {
        const existing = await eventsRepo.findOne({ where: { messageId, event: 'roulette_spin' } });
        if (existing) {
          ev = existing;
        } else {
          const options = (payload.data?.options ?? []) as { id: string }[];
          const winner = options[Math.floor(Math.random() * options.length)];
          ev = await eventsRepo.save(
            eventsRepo.create({
              messageId,
              projectId: message.projectId,
              kind: 'roulette',
              event: 'roulette_spin',
              actorMemberId: member.id,
              data: { winnerOptionId: winner?.id ?? null },
            }),
          );
        }
      } else {
        throw new BadRequestException('지원하지 않는 동작입니다.');
      }

      return ev;
    });
  }
}
