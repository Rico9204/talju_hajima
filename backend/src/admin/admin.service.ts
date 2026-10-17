import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { AdminApplication } from './admin-application.entity.js';
import { User } from '../users/user.entity.js';
import { SubmitApplicationDto } from './dto/submit-application.dto.js';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminApplication)
    private readonly applicationsRepository: Repository<AdminApplication>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { id: userId }, select: { isAdmin: true, isOperator: true } });
    return !!user && (user.isAdmin || user.isOperator);
  }

  async isOperator(userId: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({ where: { id: userId }, select: { isOperator: true } });
    return !!user?.isOperator;
  }

  private async assertOperator(userId: string): Promise<void> {
    if (!(await this.isOperator(userId))) throw new ForbiddenException('운영자만 할 수 있습니다.');
  }

  async getMyApplication(userId: string): Promise<AdminApplication | null> {
    return this.applicationsRepository.findOne({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async submitApplication(userId: string, dto: SubmitApplicationDto): Promise<void> {
    const existing = await this.getMyApplication(userId);
    if (existing?.status === 'pending') throw new BadRequestException('이미 심사 중인 신청이 있습니다.');
    await this.applicationsRepository.save(
      this.applicationsRepository.create({
        userId,
        org: dto.org,
        jobTitle: dto.jobTitle,
        contact: dto.contact,
        docType: dto.docType,
        docName: dto.docName,
        docSize: dto.docSize,
        docData: dto.docData,
        status: 'pending',
      }),
    );
  }

  async listApplications(operatorUserId: string): Promise<(AdminApplication & { displayName: string; email: string })[]> {
    await this.assertOperator(operatorUserId);
    const applications = await this.applicationsRepository.find({
      relations: { user: true },
      select: { id: true, userId: true, org: true, jobTitle: true, contact: true, docType: true, docName: true, docSize: true, docDeleted: true, status: true, reviewNote: true, reviewedAt: true, createdAt: true, updatedAt: true, user: { id: true, name: true, email: true } },
      order: { createdAt: 'DESC' },
    });
    return applications.map((a) => ({ ...a, displayName: a.user?.name ?? '알 수 없음', email: a.user?.email ?? '' }));
  }

  async getDocumentData(applicationId: string, operatorUserId: string): Promise<string> {
    await this.assertOperator(operatorUserId);
    const application = await this.applicationsRepository.findOne({ where: { id: applicationId } });
    if (!application || application.docDeleted || !application.docData) throw new NotFoundException('문서를 찾을 수 없습니다.');
    return application.docData;
  }

  async reviewApplication(applicationId: string, operatorUserId: string, approve: boolean, note: string): Promise<void> {
    await this.assertOperator(operatorUserId);
    const application = await this.applicationsRepository.findOne({ where: { id: applicationId } });
    if (!application) throw new NotFoundException('신청을 찾을 수 없습니다.');
    application.status = approve ? 'approved' : 'rejected';
    application.reviewNote = note;
    application.reviewedAt = new Date();
    await this.applicationsRepository.save(application);
    if (approve) {
      await this.usersRepository.update(application.userId, { isAdmin: true, org: application.org });
    }
  }

  async cleanupDocument(applicationId: string, operatorUserId: string): Promise<void> {
    await this.assertOperator(operatorUserId);
    await this.applicationsRepository.update(applicationId, { docData: null, docDeleted: true });
  }

  async listAdmins(operatorUserId: string): Promise<{ userId: string; displayName: string; email: string; org: string | null; isOperator: boolean; pendingProjects: number }[]> {
    await this.assertOperator(operatorUserId);
    const admins = await this.usersRepository.find({
      where: { isAdmin: true },
      select: { id: true, name: true, email: true, org: true, isOperator: true },
    });
    return admins.map((a) => ({ userId: a.id, displayName: a.name, email: a.email, org: a.org, isOperator: a.isOperator, pendingProjects: 0 }));
  }

  async revokeAdmin(userId: string, operatorUserId: string): Promise<void> {
    await this.assertOperator(operatorUserId);
    await this.usersRepository.update(userId, { isAdmin: false });
  }

  async searchAdmins(query: string): Promise<{ id: string; displayName: string; org: string | null; email: string | null }[]> {
    const admins = await this.usersRepository.find({
      where: [{ isAdmin: true, name: ILike(`%${query}%`) }, { isAdmin: true, org: ILike(`%${query}%`) }],
      select: { id: true, name: true, org: true, email: true },
      take: 20,
    });
    return admins.map((a) => ({ id: a.id, displayName: a.name, org: a.org, email: a.email }));
  }
}
