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
          backgroundImageUrl: true,
          org: true,
          isAdmin: true,
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

  // 팀장 또는 부팀장인지 — 팀원 강퇴/설정 변경 등 일상 운영 권한 체크에 씀.
  async isLeaderOrVice(projectId: string, userId: string): Promise<boolean> {
    if (await this.isOwner(projectId, userId)) return true;
    const member = await this.membersRepository.findOne({ where: { projectId, userId } });
    return member?.role === ProjectRole.VICE_LEADER;
  }

  // memberId는 ProjectMember.id(멤버십 row id) — kickMember/setViceLeader는 main 쪽에서 이
  // id로 부른다.
  async kickMemberByMembershipId(memberId: string, actingUserId: string): Promise<void> {
    const member = await this.membersRepository.findOne({ where: { id: memberId } });
    if (!member) throw new NotFoundException('멤버를 찾을 수 없습니다.');
    if (!(await this.isLeaderOrVice(member.projectId, actingUserId))) {
      throw new ForbiddenException('팀장/부팀장만 팀원을 제외할 수 있습니다.');
    }
    const project = await this.projectsRepository.findOne({ where: { id: member.projectId } });
    if (project?.ownerId === member.userId) throw new ForbiddenException('팀장은 제외할 수 없습니다.');
    await this.membersRepository.delete(memberId);
  }

  async setViceLeaderByMembershipId(memberId: string, enabled: boolean, actingUserId: string): Promise<void> {
    const member = await this.membersRepository.findOne({ where: { id: memberId } });
    if (!member) throw new NotFoundException('멤버를 찾을 수 없습니다.');
    if (!(await this.isOwner(member.projectId, actingUserId))) {
      throw new ForbiddenException('팀장만 부팀장을 지정할 수 있습니다.');
    }
    member.role = enabled ? ProjectRole.VICE_LEADER : ProjectRole.MEMBER;
    await this.membersRepository.save(member);
  }

  async transferLeadership(projectId: string, newOwnerMemberId: string, actingUserId: string): Promise<void> {
    if (!(await this.isOwner(projectId, actingUserId))) throw new ForbiddenException('팀장만 팀장을 위임할 수 있습니다.');
    const member = await this.membersRepository.findOne({ where: { id: newOwnerMemberId } });
    if (!member || member.projectId !== projectId) throw new NotFoundException('멤버를 찾을 수 없습니다.');
    await this.projectsRepository.update(projectId, { ownerId: member.userId });
    member.role = ProjectRole.OWNER;
    await this.membersRepository.save(member);
    const prevOwnerMembership = await this.membersRepository.findOne({ where: { projectId, userId: actingUserId } });
    if (prevOwnerMembership) {
      prevOwnerMembership.role = ProjectRole.MEMBER;
      await this.membersRepository.save(prevOwnerMembership);
    }
  }

  async completeProject(projectId: string, userId: string): Promise<Project> {
    if (!(await this.isOwner(projectId, userId))) throw new ForbiddenException('팀장만 프로젝트를 종료할 수 있습니다.');
    await this.projectsRepository.update(projectId, { completedAt: new Date() });
    const project = await this.projectsRepository.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return project;
  }

  async setApprovalStatus(projectId: string, status: 'approved' | 'rejected'): Promise<void> {
    await this.projectsRepository.update(projectId, { approvalStatus: status });
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

  // 자기 자신의 프레즌스만 바꿀 수 있다 — memberId(멤버십 id)가 호출자 본인 것이 아니면 거부.
  private async assertOwnMembership(memberId: string, actingUserId: string): Promise<ProjectMember> {
    const member = await this.membersRepository.findOne({ where: { id: memberId } });
    if (!member) throw new NotFoundException('멤버를 찾을 수 없습니다.');
    if (member.userId !== actingUserId) throw new ForbiddenException('본인의 접속 상태만 바꿀 수 있습니다.');
    return member;
  }

  async touchPresence(memberId: string, actingUserId: string): Promise<void> {
    const member = await this.assertOwnMembership(memberId, actingUserId);
    await this.membersRepository.update(member.id, { lastActiveAt: new Date() });
  }

  async setPresenceStatus(memberId: string, status: 'active' | 'idle', actingUserId: string): Promise<void> {
    const member = await this.assertOwnMembership(memberId, actingUserId);
    await this.membersRepository.update(member.id, { presenceStatus: status, lastActiveAt: new Date() });
  }

  private static readonly ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

  async getPresence(projectId: string): Promise<{ onlineMemberIds: string[]; states: Record<string, { status: 'active' | 'idle'; lastActiveAt: string; onlineAt: string }> }> {
    const members = await this.membersRepository.find({ where: { projectId } });
    const now = Date.now();
    const onlineMemberIds: string[] = [];
    const states: Record<string, { status: 'active' | 'idle'; lastActiveAt: string; onlineAt: string }> = {};
    for (const member of members) {
      if (!member.lastActiveAt) continue;
      if (now - member.lastActiveAt.getTime() > ProjectsService.ONLINE_THRESHOLD_MS) continue;
      onlineMemberIds.push(member.id);
      states[member.id] = { status: member.presenceStatus, lastActiveAt: member.lastActiveAt.toISOString(), onlineAt: member.lastActiveAt.toISOString() };
    }
    return { onlineMemberIds, states };
  }
}
