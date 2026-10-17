import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BoardPost } from './board-post.entity.js';
import { BoardApplication, BoardApplicationStatus } from './board-application.entity.js';
import { BoardComment } from './board-comment.entity.js';
import { BoardLike } from './board-like.entity.js';
import { BoardAttachment } from './board-attachment.entity.js';
import { BoardPoll } from './board-poll.entity.js';
import { BoardPollOption } from './board-poll-option.entity.js';
import { BoardPollVote } from './board-poll-vote.entity.js';
import { BoardPostReport } from './board-post-report.entity.js';
import { ProjectsService } from '../projects/projects.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';

@Injectable()
export class BoardService {
  constructor(
    @InjectRepository(BoardPost)
    private readonly postsRepository: Repository<BoardPost>,
    @InjectRepository(BoardApplication)
    private readonly applicationsRepository: Repository<BoardApplication>,
    @InjectRepository(BoardComment)
    private readonly commentsRepository: Repository<BoardComment>,
    @InjectRepository(BoardLike)
    private readonly likesRepository: Repository<BoardLike>,
    @InjectRepository(BoardAttachment)
    private readonly attachmentsRepository: Repository<BoardAttachment>,
    @InjectRepository(BoardPoll)
    private readonly pollsRepository: Repository<BoardPoll>,
    @InjectRepository(BoardPollOption)
    private readonly pollOptionsRepository: Repository<BoardPollOption>,
    @InjectRepository(BoardPollVote)
    private readonly pollVotesRepository: Repository<BoardPollVote>,
    @InjectRepository(BoardPostReport)
    private readonly reportsRepository: Repository<BoardPostReport>,
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
      .leftJoin('post.author', 'author')
      .addSelect(['author.id', 'author.name'])
      .leftJoin('post.project', 'project')
      .addSelect(['project.id', 'project.name'])
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
    const post = await this.postsRepository.save(
      this.postsRepository.create({
        authorId: userId,
        title: dto.title,
        content: dto.content,
        projectId: dto.projectId ?? null,
        tags: this.normalizeTags(dto.tags),
        category: dto.category ?? 'free',
      }),
    );

    if (dto.attachmentIds?.length) {
      await this.attachmentsRepository.update(
        { id: In(dto.attachmentIds), uploaderId: userId, postId: null as unknown as string },
        { postId: post.id },
      );
    }

    if (dto.poll && dto.poll.options.length >= 2) {
      const poll = await this.pollsRepository.save(
        this.pollsRepository.create({
          postId: post.id,
          question: dto.poll.question,
          allowMultiple: dto.poll.allowMultiple ?? false,
          isAnonymous: dto.poll.isAnonymous ?? false,
          closesAt: dto.poll.closesAt ? new Date(dto.poll.closesAt) : null,
        }),
      );
      await this.pollOptionsRepository.save(
        dto.poll.options.map((text, i) => this.pollOptionsRepository.create({ pollId: poll.id, text, sortOrder: i })),
      );
    }

    return post;
  }

  async getPost(postId: string): Promise<BoardPost> {
    const post = await this.postsRepository.findOne({
      where: { id: postId },
      relations: { author: true, project: true },
      select: {
        id: true,
        authorId: true,
        title: true,
        content: true,
        projectId: true,
        recruiting: true,
        tags: true,
        category: true,
        views: true,
        pinned: true,
        createdAt: true,
        author: { id: true, name: true },
        project: { id: true, name: true },
      },
    });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    return post;
  }

  // 삭제된 글이면 null(화면이 "삭제된 글입니다"로 보여줄 때 씀).
  async getPostContent(postId: string): Promise<string | null> {
    const post = await this.postsRepository.findOne({ where: { id: postId } });
    return post?.content ?? null;
  }

  async updatePost(postId: string, userId: string, patch: { title?: string; content?: string; tags?: string[] }): Promise<BoardPost> {
    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    if (post.authorId !== userId) throw new ForbiddenException('본인이 작성한 글만 수정할 수 있습니다.');
    if (patch.title !== undefined) post.title = patch.title;
    if (patch.content !== undefined) post.content = patch.content;
    if (patch.tags !== undefined) post.tags = this.normalizeTags(patch.tags);
    return this.postsRepository.save(post);
  }

  async deletePost(postId: string, userId: string): Promise<void> {
    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    if (post.authorId !== userId) throw new ForbiddenException('본인이 작성한 글만 삭제할 수 있습니다.');
    await this.postsRepository.delete(postId);
  }

  async incrementViews(postId: string): Promise<void> {
    await this.postsRepository.increment({ id: postId }, 'views', 1);
  }

  async setLike(postId: string, userId: string, active: boolean): Promise<void> {
    if (active) {
      const existing = await this.likesRepository.findOne({ where: { postId, userId } });
      if (!existing) await this.likesRepository.save(this.likesRepository.create({ postId, userId }));
    } else {
      await this.likesRepository.delete({ postId, userId });
    }
  }

  async countLikes(postId: string): Promise<number> {
    return this.likesRepository.count({ where: { postId } });
  }

  async isLikedBy(postId: string, userId: string): Promise<boolean> {
    return (await this.likesRepository.findOne({ where: { postId, userId } })) !== null;
  }

  async countComments(postId: string): Promise<number> {
    return this.commentsRepository.count({ where: { postId } });
  }

  async listComments(postId: string): Promise<BoardComment[]> {
    return this.commentsRepository.find({
      where: { postId },
      relations: { author: true },
      order: { createdAt: 'ASC' },
      select: {
        id: true,
        postId: true,
        authorId: true,
        content: true,
        parentCommentId: true,
        createdAt: true,
        author: { id: true, name: true },
      },
    });
  }

  async addComment(postId: string, userId: string, content: string, parentCommentId?: string): Promise<BoardComment> {
    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    return this.commentsRepository.save(
      this.commentsRepository.create({ postId, authorId: userId, content, parentCommentId: parentCommentId ?? null }),
    );
  }

  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await this.commentsRepository.findOne({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');
    if (comment.authorId !== userId) throw new ForbiddenException('본인이 작성한 댓글만 삭제할 수 있습니다.');
    await this.commentsRepository.delete(commentId);
  }

  async uploadAttachment(userId: string, file: { name: string; byteSize: number; kind: 'image' | 'file'; mimeType: string | null; data: string }): Promise<BoardAttachment> {
    return this.attachmentsRepository.save(
      this.attachmentsRepository.create({
        uploaderId: userId,
        postId: null,
        name: file.name,
        byteSize: file.byteSize,
        kind: file.kind,
        mimeType: file.mimeType,
        data: file.data,
      }),
    );
  }

  async listAttachments(postId: string): Promise<BoardAttachment[]> {
    return this.attachmentsRepository.find({ where: { postId }, order: { createdAt: 'ASC' } });
  }

  async getPoll(postId: string): Promise<BoardPoll | null> {
    return this.pollsRepository.findOne({ where: { postId } });
  }

  async getPollById(pollId: string): Promise<BoardPoll | null> {
    return this.pollsRepository.findOne({ where: { id: pollId } });
  }

  async listPollOptions(pollId: string): Promise<BoardPollOption[]> {
    return this.pollOptionsRepository.find({ where: { pollId }, order: { sortOrder: 'ASC' } });
  }

  async listPollVotes(pollId: string): Promise<BoardPollVote[]> {
    return this.pollVotesRepository.find({ where: { pollId } });
  }

  async castPollVote(pollId: string, userId: string, optionIds: string[]): Promise<void> {
    const poll = await this.pollsRepository.findOne({ where: { id: pollId } });
    if (!poll) throw new NotFoundException('투표를 찾을 수 없습니다.');
    if (poll.closed) throw new BadRequestException('마감된 투표입니다.');
    if (!poll.allowMultiple && optionIds.length > 1) throw new BadRequestException('이 투표는 하나만 선택할 수 있습니다.');
    await this.pollVotesRepository.delete({ pollId, userId });
    if (optionIds.length > 0) {
      await this.pollVotesRepository.save(optionIds.map((optionId) => this.pollVotesRepository.create({ pollId, optionId, userId })));
    }
  }

  async closePoll(pollId: string, userId: string): Promise<void> {
    const poll = await this.pollsRepository.findOne({ where: { id: pollId } });
    if (!poll) throw new NotFoundException('투표를 찾을 수 없습니다.');
    const post = await this.postsRepository.findOne({ where: { id: poll.postId } });
    if (!post || post.authorId !== userId) throw new ForbiddenException('글쓴이만 투표를 마감할 수 있습니다.');
    poll.closed = true;
    await this.pollsRepository.save(poll);
  }

  async reportPost(postId: string, reporterId: string, reason: string, detail: string): Promise<void> {
    const post = await this.postsRepository.findOne({ where: { id: postId }, relations: { author: true } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    await this.reportsRepository.save(
      this.reportsRepository.create({
        postId: post.id,
        postTitle: post.title,
        postExcerpt: post.content.slice(0, 120),
        postAuthorName: post.author?.name ?? '알 수 없음',
        reporterId,
        reason,
        detail,
        status: 'open',
      }),
    );
  }

  async listReportsForPost(postId: string): Promise<BoardPostReport[]> {
    return this.reportsRepository.find({ where: { postId }, order: { createdAt: 'DESC' } });
  }

  async listAllReports(): Promise<BoardPostReport[]> {
    return this.reportsRepository.find({ order: { createdAt: 'DESC' } });
  }

  async reviewReport(reportId: string, status: 'resolved' | 'dismissed'): Promise<void> {
    await this.reportsRepository.update(reportId, { status });
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
      select: {
        id: true,
        postId: true,
        applicantId: true,
        message: true,
        status: true,
        createdAt: true,
        applicant: { id: true, name: true },
      },
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
