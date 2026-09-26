import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { Project } from './project.entity.js';
import { ProjectMember, ProjectRole } from './project-member.entity.js';
import { Invitation, InvitationStatus } from './invitation.entity.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UsersService } from '../users/users.service.js';

const INVITATION_TTL_DAYS = 7;

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly membersRepository: Repository<ProjectMember>,
    @InjectRepository(Invitation)
    private readonly invitationsRepository: Repository<Invitation>,
    private readonly usersService: UsersService,
  ) {}

  async create(ownerId: string, dto: CreateProjectDto): Promise<Project> {
    const project = await this.projectsRepository.save(
      this.projectsRepository.create({
        ownerId,
        name: dto.name,
        description: dto.description ?? null,
      }),
    );

    await this.membersRepository.save(
      this.membersRepository.create({
        projectId: project.id,
        userId: ownerId,
        role: ProjectRole.OWNER,
      }),
    );

    return project;
  }

  async findForUser(userId: string): Promise<Project[]> {
    // joinedAt 오름차순 — 가장 먼저 참여한(보통 진짜 쓰는) 프로젝트가 항상 앞에 오도록.
    // 정렬이 없으면 어떤 프로젝트가 기본으로 선택될지 사실상 무작위였음.
    const memberships = await this.membersRepository.find({
      where: { userId },
      relations: { project: true },
      order: { joinedAt: 'ASC' },
    });
    return memberships.map((m) => m.project);
  }

  async findOneForUser(projectId: string, userId: string): Promise<Project> {
    await this.assertMembership(projectId, userId);
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return project;
  }

  async getMembers(projectId: string, userId: string): Promise<(ProjectMember & { user: { links: unknown[] } })[]> {
    await this.assertMembership(projectId, userId);
    const members = await this.membersRepository.find({
      where: { projectId },
      relations: { user: true },
      select: {
        id: true,
        projectId: true,
        userId: true,
        role: true,
        joinedAt: true,
        user: {
          id: true,
          email: true,
          name: true,
          trustScore: true,
          createdAt: true,
          school: true,
          major: true,
          student: true,
          contact: true,
          bannerColor: true,
          bannerImageUrl: true,
          avatarUrl: true,
        },
      },
    });
    const linksByUser = await this.usersService.listLinksForUsers(members.map((m) => m.userId));
    return members.map((m) => ({ ...m, user: { ...m.user, links: linksByUser.get(m.userId) ?? [] } }));
  }

  async createInvitation(projectId: string, inviterId: string): Promise<Invitation> {
    await this.assertMembership(projectId, inviterId);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_TTL_DAYS);

    return this.invitationsRepository.save(
      this.invitationsRepository.create({
        projectId,
        inviterId,
        token: randomBytes(24).toString('hex'),
        status: InvitationStatus.PENDING,
        expiresAt,
      }),
    );
  }

  // 초대 토큰 없이 바로 멤버로 추가 — 게시판 모집 신청을 프로젝트 팀장이 수락할 때 씀
  // (board.service.ts). acceptInvitation의 멤버 생성 부분과 동일한 멱등 체크.
  async addMember(projectId: string, userId: string): Promise<void> {
    const existing = await this.membersRepository.findOne({ where: { projectId, userId } });
    if (existing) return;
    await this.membersRepository.save(
      this.membersRepository.create({ projectId, userId, role: ProjectRole.MEMBER }),
    );
  }

  async isOwner(projectId: string, userId: string): Promise<boolean> {
    const project = await this.projectsRepository.findOne({ where: { id: projectId } });
    return !!project && project.ownerId === userId;
  }

  async acceptInvitation(
    token: string,
    userId: string,
    profile?: { school?: string; major?: string; student?: string },
  ): Promise<Project> {
    const invitation = await this.invitationsRepository.findOne({
      where: { token },
    });
    if (!invitation) {
      throw new NotFoundException('유효하지 않은 초대입니다.');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ForbiddenException('이미 처리된 초대입니다.');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      invitation.status = InvitationStatus.EXPIRED;
      await this.invitationsRepository.save(invitation);
      throw new ForbiddenException('만료된 초대입니다.');
    }

    const existingMembership = await this.membersRepository.findOne({
      where: { projectId: invitation.projectId, userId },
    });
    if (!existingMembership) {
      await this.membersRepository.save(
        this.membersRepository.create({
          projectId: invitation.projectId,
          userId,
          role: ProjectRole.MEMBER,
        }),
      );
    }

    invitation.status = InvitationStatus.ACCEPTED;
    await this.invitationsRepository.save(invitation);

    if (profile) await this.usersService.fillProfileOnJoin(userId, profile);

    const project = await this.projectsRepository.findOne({
      where: { id: invitation.projectId },
    });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return project;
  }

  async listMemberUserIds(projectId: string): Promise<string[]> {
    const members = await this.membersRepository.find({ where: { projectId }, select: { userId: true } });
    return members.map((m) => m.userId);
  }

  async assertMembership(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember> {
    const membership = await this.membersRepository.findOne({
      where: { projectId, userId },
    });
    if (!membership) {
      throw new ForbiddenException('프로젝트 멤버가 아닙니다.');
    }
    return membership;
  }
}
