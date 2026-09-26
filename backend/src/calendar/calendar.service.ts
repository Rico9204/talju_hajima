import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProjectsService } from '../projects/projects.service.js';
import { CalendarEvent, CalendarEventSource } from './calendar-event.entity.js';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';

export interface CalendarEventWithProject extends CalendarEvent {
  projectName: string;
}

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(CalendarEvent)
    private readonly eventsRepository: Repository<CalendarEvent>,
    private readonly projectsService: ProjectsService,
  ) {}

  async listForProject(projectId: string, userId: string): Promise<CalendarEvent[]> {
    await this.projectsService.assertMembership(projectId, userId);
    return this.eventsRepository.find({ where: { projectId }, order: { date: 'ASC' } });
  }

  // 내가 속한 모든 프로젝트의 일정을 프로젝트 이름과 함께 하나로 합쳐서 반환
  async listForUser(userId: string): Promise<CalendarEventWithProject[]> {
    const projects = await this.projectsService.findForUser(userId);
    if (projects.length === 0) return [];

    const nameById = new Map(projects.map((p) => [p.id, p.name]));
    const events = await this.eventsRepository.find({
      where: { projectId: In(projects.map((p) => p.id)) },
      order: { date: 'ASC' },
    });

    return events.map((e) => ({ ...e, projectName: nameById.get(e.projectId) ?? '' }));
  }

  async create(projectId: string, userId: string, dto: CreateCalendarEventDto): Promise<CalendarEvent> {
    await this.projectsService.assertMembership(projectId, userId);
    const date = new Date(dto.date);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    return this.eventsRepository.save(
      this.eventsRepository.create({
        projectId,
        source: CalendarEventSource.MANUAL,
        title: dto.title,
        date,
        endDate: endDate && endDate.getTime() > date.getTime() ? endDate : null,
        color: dto.color ?? null,
        refType: dto.type,
        refId: null,
        createdBy: userId,
      }),
    );
  }

  private async findEditable(projectId: string, eventId: string, userId: string): Promise<CalendarEvent> {
    await this.projectsService.assertMembership(projectId, userId);
    const event = await this.eventsRepository.findOne({ where: { id: eventId, projectId } });
    if (!event) throw new NotFoundException('일정을 찾을 수 없습니다.');
    // 크롤링/시스템 일정(과제 마감 자동 반영 등)은 그 출처에서만 관리 — 직접 수정/삭제하면
    // 다음 동기화 때 다시 생기거나 원본과 어긋나므로 이 화면에서는 막는다.
    if (event.source !== CalendarEventSource.MANUAL) {
      throw new ForbiddenException('직접 추가한 일정만 수정/삭제할 수 있습니다.');
    }
    return event;
  }

  async update(projectId: string, eventId: string, userId: string, dto: UpdateCalendarEventDto): Promise<CalendarEvent> {
    const event = await this.findEditable(projectId, eventId, userId);
    if (dto.title !== undefined) event.title = dto.title;
    if (dto.date !== undefined) event.date = new Date(dto.date);
    if (dto.type !== undefined) event.refType = dto.type;
    if (dto.color !== undefined) event.color = dto.color;
    if (dto.endDate !== undefined) {
      const endDate = dto.endDate ? new Date(dto.endDate) : null;
      event.endDate = endDate && endDate.getTime() > event.date.getTime() ? endDate : null;
    }
    return this.eventsRepository.save(event);
  }

  async delete(projectId: string, eventId: string, userId: string): Promise<void> {
    const event = await this.findEditable(projectId, eventId, userId);
    await this.eventsRepository.delete(event.id);
  }
}
