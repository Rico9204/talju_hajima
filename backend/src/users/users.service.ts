import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './user.entity.js';
import { ProfileLink } from './profile-link.entity.js';
import { ProjectMember } from '../projects/project-member.entity.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { CreateLinkDto } from './dto/create-link.dto.js';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(ProfileLink)
    private readonly linksRepository: Repository<ProfileLink>,
    @InjectRepository(ProjectMember)
    private readonly membersRepository: Repository<ProjectMember>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.usersRepository.findBy({ id: In(ids) });
  }

  create(data: { email: string; passwordHash: string; name: string }): Promise<User> {
    const user = this.usersRepository.create({ ...data, trustScore: null });
    return this.usersRepository.save(user);
  }

  // 비밀번호가 틀렸을 때마다 호출 — 임계치(5회)에 도달하면 LOCKOUT_MINUTES 동안 잠그고
  // 카운터는 0으로 되돌린다(잠금이 풀린 뒤 다시 5번 틀려야 재잠금되게).
  async registerFailedLogin(userId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return;
    const attempts = user.failedLoginAttempts + 1;
    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    } else {
      user.failedLoginAttempts = attempts;
    }
    await this.usersRepository.save(user);
  }

  async clearFailedLogins(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { failedLoginAttempts: 0, lockedUntil: null });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    // dto는 class-validator DTO라 보내지 않은 필드도 선언된 속성으로 undefined 값을 갖고
    // 있을 수 있다 — Object.assign을 그대로 쓰면 그 undefined가 기존 값을 덮어써서, 예를
    // 들어 avatarUrl만 바꾸는 PATCH가 bannerImageUrl을 null로 날려버린다. 실제로 값이
    // 온 필드만 골라서 덮어쓴다.
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) (user as unknown as Record<string, unknown>)[key] = value;
    }
    return this.usersRepository.save(user);
  }

  // 프로젝트 참여 시점에 학교/학과/학번을 같이 받는다 — 계정 프로필을 처음 채우는 자연스러운
  // 지점이라 그렇지, 값 자체는 계정(User)에 저장되고 참여 중인 모든 프로젝트에서 공유된다.
  // 비어있는 값은 기존 값을 덮어쓰지 않는다.
  async fillProfileOnJoin(
    userId: string,
    input: { school?: string; major?: string; student?: string },
  ): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return;
    if (input.school?.trim()) user.school = input.school.trim();
    if (input.major?.trim()) user.major = input.major.trim();
    if (input.student?.trim()) user.student = input.student.trim();
    await this.usersRepository.save(user);
  }

  listLinks(userId: string): Promise<ProfileLink[]> {
    return this.linksRepository.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async listLinksForUsers(userIds: string[]): Promise<Map<string, ProfileLink[]>> {
    if (userIds.length === 0) return new Map();
    const links = await this.linksRepository.find({ where: { userId: In(userIds) } });
    const byUser = new Map<string, ProfileLink[]>();
    for (const link of links) {
      const list = byUser.get(link.userId) ?? [];
      list.push(link);
      byUser.set(link.userId, list);
    }
    return byUser;
  }

  addLink(userId: string, dto: CreateLinkDto): Promise<ProfileLink> {
    return this.linksRepository.save(this.linksRepository.create({ userId, ...dto }));
  }

  async deleteLink(userId: string, linkId: string): Promise<void> {
    await this.linksRepository.delete({ id: linkId, userId });
  }

  // 이 사람이 전체적으로 몇 개 프로젝트에 참여했고(projectCount), 그 프로젝트들에서 함께한
  // 서로 다른 팀원이 몇 명인지(collaboratorCount) — 프로필 모달에 "이 프로젝트만 기준" 점수
  // 옆에 곁들이는 참고 정보. 본인을 collaboratorCount에서 제외한다.
  async participationStats(userId: string): Promise<{ projectCount: number; collaboratorCount: number }> {
    const myMemberships = await this.membersRepository.find({ where: { userId }, select: { projectId: true } });
    const projectIds = myMemberships.map((m) => m.projectId);
    if (projectIds.length === 0) return { projectCount: 0, collaboratorCount: 0 };

    const coMembers = await this.membersRepository.find({ where: { projectId: In(projectIds) }, select: { userId: true } });
    const collaboratorIds = new Set(coMembers.map((m) => m.userId).filter((id) => id !== userId));
    return { projectCount: projectIds.length, collaboratorCount: collaboratorIds.size };
  }
}
