import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ProjectMember } from '../projects/project-member.entity.js';
import { Task } from '../tasks/task.entity.js';
import { CalendarEvent } from '../calendar/calendar-event.entity.js';
import { ProjectFile } from '../files/project-file.entity.js';
import { ChatService } from '../chat/chat.service.js';

const EPOCH = new Date(0);

@Injectable()
export class ProjectAlertsService {
  constructor(
    @InjectRepository(ProjectMember)
    private readonly membersRepository: Repository<ProjectMember>,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(CalendarEvent)
    private readonly eventsRepository: Repository<CalendarEvent>,
    @InjectRepository(ProjectFile)
    private readonly filesRepository: Repository<ProjectFile>,
    private readonly chatService: ChatService,
  ) {}

  // 지금 열어둔 프로젝트가 아닌 "다른" 프로젝트에 새 소식(과제/일정/워크스페이스/채팅)이 있는지.
  // 한 번도 안 본 영역(viewedAt=null)은 그 영역의 모든 항목이 새 것으로 친다.
  async listAlertProjectIds(userId: string): Promise<string[]> {
    const memberships = await this.membersRepository.find({ where: { userId } });
    const alertProjectIds: string[] = [];

    for (const member of memberships) {
      const [hasNewTask, hasNewEvent, hasNewFile, unread] = await Promise.all([
        this.tasksRepository.exists({ where: { projectId: member.projectId, createdAt: MoreThan(member.tasksViewedAt ?? EPOCH) } }),
        this.eventsRepository.exists({ where: { projectId: member.projectId, createdAt: MoreThan(member.scheduleViewedAt ?? EPOCH) } }),
        this.filesRepository.exists({ where: { projectId: member.projectId, createdAt: MoreThan(member.workspaceViewedAt ?? EPOCH) } }),
        this.chatService.listUnreadCounts(member.projectId, userId),
      ]);
      const hasUnreadChat = unread.some((c) => c.count > 0);
      if (hasNewTask || hasNewEvent || hasNewFile || hasUnreadChat) alertProjectIds.push(member.projectId);
    }

    return alertProjectIds;
  }
}
