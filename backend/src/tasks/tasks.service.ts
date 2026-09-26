import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProjectsService } from '../projects/projects.service.js';
import { Task, TaskStatus } from './task.entity.js';
import { TaskChecklistItem } from './task-checklist-item.entity.js';
import { TaskComment } from './task-comment.entity.js';
import { TaskCommentReaction } from './task-comment-reaction.entity.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { SetScheduleLinkDto } from './dto/set-schedule-link.dto.js';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(TaskChecklistItem)
    private readonly checklistRepository: Repository<TaskChecklistItem>,
    @InjectRepository(TaskComment)
    private readonly commentsRepository: Repository<TaskComment>,
    @InjectRepository(TaskCommentReaction)
    private readonly commentReactionsRepository: Repository<TaskCommentReaction>,
    private readonly projectsService: ProjectsService,
  ) {}

  async listForProject(projectId: string, userId: string): Promise<Task[]> {
    await this.projectsService.assertMembership(projectId, userId);
    return this.tasksRepository.find({
      where: { projectId },
      relations: { assignee: true },
      select: {
        id: true,
        projectId: true,
        title: true,
        assigneeId: true,
        priority: true,
        dueDate: true,
        tags: true,
        status: true,
        teamScheduleEventId: true,
        personalScheduleEventId: true,
        createdAt: true,
        updatedAt: true,
        assignee: { id: true, name: true, email: true },
      },
      order: { createdAt: 'ASC' },
    });
  }

  async create(projectId: string, userId: string, dto: CreateTaskDto): Promise<Task> {
    await this.projectsService.assertMembership(projectId, userId);
    if (dto.assigneeId) {
      await this.projectsService.assertMembership(projectId, dto.assigneeId);
    }
    return this.tasksRepository.save(
      this.tasksRepository.create({
        projectId,
        title: dto.title,
        assigneeId: dto.assigneeId ?? null,
        priority: dto.priority,
        dueDate: dto.dueDate ?? null,
        tags: dto.tags ?? [],
      }),
    );
  }

  private async findOwnedTask(taskId: string, userId: string): Promise<Task> {
    const task = await this.tasksRepository.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('과제를 찾을 수 없습니다.');
    await this.projectsService.assertMembership(task.projectId, userId);
    return task;
  }

  async updateStatus(taskId: string, userId: string, status: TaskStatus): Promise<Task> {
    const task = await this.findOwnedTask(taskId, userId);
    task.status = status;
    return this.tasksRepository.save(task);
  }

  async update(taskId: string, userId: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOwnedTask(taskId, userId);
    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      await this.projectsService.assertMembership(task.projectId, dto.assigneeId);
    }
    if (dto.title !== undefined) task.title = dto.title;
    if (dto.assigneeId !== undefined) task.assigneeId = dto.assigneeId;
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate;
    if (dto.tags !== undefined) task.tags = dto.tags;
    return this.tasksRepository.save(task);
  }

  async delete(taskId: string, userId: string): Promise<void> {
    const task = await this.findOwnedTask(taskId, userId);
    await this.tasksRepository.delete(task.id);
  }

  async setScheduleLink(taskId: string, userId: string, dto: SetScheduleLinkDto): Promise<Task> {
    const task = await this.findOwnedTask(taskId, userId);
    if (dto.field === 'team') task.teamScheduleEventId = dto.eventId ?? null;
    else task.personalScheduleEventId = dto.eventId ?? null;
    return this.tasksRepository.save(task);
  }

  async listChecklist(taskId: string, userId: string): Promise<TaskChecklistItem[]> {
    await this.findOwnedTask(taskId, userId);
    return this.checklistRepository.find({ where: { taskId } });
  }

  async addChecklistItem(taskId: string, userId: string, text: string): Promise<TaskChecklistItem> {
    await this.findOwnedTask(taskId, userId);
    return this.checklistRepository.save(this.checklistRepository.create({ taskId, text }));
  }

  async toggleChecklistItem(itemId: string, userId: string, done: boolean): Promise<TaskChecklistItem> {
    const item = await this.checklistRepository.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('체크리스트 항목을 찾을 수 없습니다.');
    await this.findOwnedTask(item.taskId, userId);
    item.done = done;
    return this.checklistRepository.save(item);
  }

  async listComments(taskId: string, userId: string): Promise<(TaskComment & { reactions: TaskCommentReaction[] })[]> {
    await this.findOwnedTask(taskId, userId);
    const comments = await this.commentsRepository.find({ where: { taskId }, order: { createdAt: 'ASC' } });
    if (comments.length === 0) return [];
    const reactions = await this.commentReactionsRepository.find({
      where: { commentId: In(comments.map((c) => c.id)) },
    });
    const byComment = new Map<string, TaskCommentReaction[]>();
    for (const r of reactions) {
      const list = byComment.get(r.commentId) ?? [];
      list.push(r);
      byComment.set(r.commentId, list);
    }
    return comments.map((c) => ({ ...c, reactions: byComment.get(c.id) ?? [] }));
  }

  async addComment(taskId: string, userId: string, content: string): Promise<TaskComment & { reactions: TaskCommentReaction[] }> {
    await this.findOwnedTask(taskId, userId);
    const saved = await this.commentsRepository.save(this.commentsRepository.create({ taskId, authorId: userId, content }));
    return { ...saved, reactions: [] };
  }

  async toggleCommentReaction(commentId: string, userId: string, emoji: string): Promise<TaskCommentReaction[]> {
    const comment = await this.commentsRepository.findOne({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');
    await this.findOwnedTask(comment.taskId, userId);
    const existing = await this.commentReactionsRepository.findOne({ where: { commentId, userId, emoji } });
    if (existing) {
      await this.commentReactionsRepository.delete(existing.id);
    } else {
      await this.commentReactionsRepository.save(this.commentReactionsRepository.create({ commentId, userId, emoji }));
    }
    return this.commentReactionsRepository.find({ where: { commentId } });
  }
}
