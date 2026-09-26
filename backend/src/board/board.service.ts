import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoardPost } from './board-post.entity.js';
import { BoardApplication, BoardApplicationStatus } from './board-application.entity.js';
import { ProjectsService } from '../projects/projects.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';

@Injectable()
export class BoardService {
  constructor(
    @InjectRepository(BoardPost)
    private readonly postsRepository: Repository<BoardPost>,
    @InjectRepository(BoardApplication)
    private readonly applicationsRepository: Repository<BoardApplication>,
    private readonly projectsService: ProjectsService,
  ) {}

  // 앞의 #은 사람들이 습관적으로 붙이니 저장 전에 떼고, 트림/중복 제거(대소문자 구분 없이)/
  // 최대 10개로 정리한다. 표시할 때 원래 대소문자는 그대로 남긴다(검색만 대소문자 무시).
  private normalizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of tags) {
      const t = raw.trim().replace(/^#/, '');
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      result.push(t);
      if (result.length >= 10) break;
    }
    return result;
  }

  async listPosts(options: { tag?: string; q?: string } = {}): Promise<BoardPost[]> {
    const qb = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.project', 'project')
      .orderBy('post.createdAt', 'DESC');

    if (options.tag?.trim()) {
      qb.andWhere('EXISTS (SELECT 1 FROM unnest(post.tags) t WHERE LOWER(t) = LOWER(:tag))', {
        tag: options.tag.trim(),
      });
    }
    if (options.q?.trim()) {
      qb.andWhere('(post.title ILIKE :q OR post.content ILIKE :q)', { q: `%${options.q.trim()}%` });
    }

    return qb.getMany();
  }

  async createPost(userId: string, dto: CreatePostDto): Promise<BoardPost> {
    if (dto.projectId) {
      // 모집 공고는 그 프로젝트 멤버만 올릴 수 있음(남의 프로젝트로 모집 공고를 못 올리게).
      await this.projectsService.assertMembership(dto.projectId, userId);
    }
    return this.postsRepository.save(
      this.postsRepository.create({
        authorId: userId,
        title: dto.title,
        content: dto.content,
        projectId: dto.projectId ?? null,
        tags: this.normalizeTags(dto.tags),
      }),
    );
  }

  async deletePost(postId: string, userId: string): Promise<void> {
    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    if (post.authorId !== userId) throw new ForbiddenException('본인이 작성한 글만 삭제할 수 있습니다.');
    await this.postsRepository.delete(postId);
  }

  async setRecruiting(postId: string, userId: string, recruiting: boolean): Promise<BoardPost> {
    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    if (post.authorId !== userId) throw new ForbiddenException('본인이 작성한 글만 수정할 수 있습니다.');
    post.recruiting = recruiting;
    return this.postsRepository.save(post);
  }

  async apply(postId: string, userId: string, message: string | undefined): Promise<BoardApplication> {
    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    if (!post.projectId) throw new BadRequestException('팀원 모집 공고가 아닙니다.');
    if (!post.recruiting) throw new BadRequestException('모집이 마감된 공고입니다.');

    const alreadyMember = await this.projectsService
      .assertMembership(post.projectId, userId)
      .then(() => true)
      .catch(() => false);
    if (alreadyMember) throw new BadRequestException('이미 이 프로젝트의 팀원입니다.');

    const existing = await this.applicationsRepository.findOne({ where: { postId, applicantId: userId } });
    if (existing) throw new BadRequestException('이미 지원한 공고입니다.');

    return this.applicationsRepository.save(
      this.applicationsRepository.create({ postId, applicantId: userId, message: message?.trim() ?? '' }),
    );
  }

  async listApplications(postId: string, userId: string): Promise<BoardApplication[]> {
    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    if (post.authorId !== userId && (!post.projectId || !(await this.projectsService.isOwner(post.projectId, userId)))) {
      throw new ForbiddenException('이 공고의 지원자 목록을 볼 권한이 없습니다.');
    }
    return this.applicationsRepository.find({
      where: { postId },
      relations: { applicant: true },
      order: { createdAt: 'ASC' },
    });
  }

  async respond(applicationId: string, userId: string, accept: boolean): Promise<BoardApplication> {
    const application = await this.applicationsRepository.findOne({ where: { id: applicationId } });
    if (!application) throw new NotFoundException('지원 내역을 찾을 수 없습니다.');
    const post = await this.postsRepository.findOne({ where: { id: application.postId } });
    if (!post?.projectId) throw new NotFoundException('공고를 찾을 수 없습니다.');
    if (!(await this.projectsService.isOwner(post.projectId, userId))) {
      throw new ForbiddenException('팀장만 지원을 수락/거절할 수 있습니다.');
    }
    if (application.status !== BoardApplicationStatus.PENDING) {
      throw new BadRequestException('이미 처리된 지원입니다.');
    }

    application.status = accept ? BoardApplicationStatus.ACCEPTED : BoardApplicationStatus.REJECTED;
    await this.applicationsRepository.save(application);
    if (accept) await this.projectsService.addMember(post.projectId, application.applicantId);
    return application;
  }
}
