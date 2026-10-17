import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { BoardService } from './board.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { ApplyDto } from './dto/apply.dto.js';
import { UploadAttachmentDto } from './dto/upload-attachment.dto.js';
import { AddCommentDto } from './dto/comment.dto.js';
import { ReportPostDto } from './dto/report-post.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get('posts')
  listPosts(@Query('tag') tag?: string, @Query('q') q?: string) {
    return this.boardService.listPosts({ tag, q });
  }

  @Post('posts')
  createPost(@CurrentUser() user: JwtPayload, @Body() dto: CreatePostDto) {
    return this.boardService.createPost(user.sub, dto);
  }

  @Get('posts/:id')
  getPost(@Param('id') id: string) {
    return this.boardService.getPost(id);
  }

  @Get('posts/:id/content')
  getPostContent(@Param('id') id: string) {
    return this.boardService.getPostContent(id);
  }

  @Patch('posts/:id')
  updatePost(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() patch: { title?: string; content?: string; tags?: string[] },
  ) {
    return this.boardService.updatePost(id, user.sub, patch);
  }

  @Delete('posts/:id')
  async deletePost(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.boardService.deletePost(id, user.sub);
    return { ok: true };
  }

  @Post('posts/:id/view')
  async incrementViews(@Param('id') id: string) {
    await this.boardService.incrementViews(id);
    return { ok: true };
  }

  @Post('posts/:id/like')
  async setLike(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body('active') active: boolean) {
    await this.boardService.setLike(id, user.sub, active);
    return { ok: true };
  }

  // 목록 화면에서 글 하나하나 열어보지 않고도 좋아요 수/댓글 수/내가 눌렀는지를 보여주기 위한
  // 집계 전용 엔드포인트 — nestDataRepository가 listBoardPosts에서 한 번에 모아 쓴다.
  @Get('posts/:id/stats')
  async getPostStats(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const [likes, liked, comments] = await Promise.all([
      this.boardService.countLikes(id),
      this.boardService.isLikedBy(id, user.sub),
      this.boardService.countComments(id),
    ]);
    return { likes, likedByMe: liked, comments };
  }

  @Get('posts/:id/comments')
  listComments(@Param('id') id: string) {
    return this.boardService.listComments(id);
  }

  @Post('posts/:id/comments')
  addComment(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AddCommentDto) {
    return this.boardService.addComment(id, user.sub, dto.content, dto.parentCommentId);
  }

  @Delete('comments/:id')
  async deleteComment(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.boardService.deleteComment(id, user.sub);
    return { ok: true };
  }

  @Post('attachments')
  uploadAttachment(@CurrentUser() user: JwtPayload, @Body() dto: UploadAttachmentDto) {
    return this.boardService.uploadAttachment(user.sub, {
      name: dto.name,
      byteSize: dto.byteSize,
      kind: dto.kind,
      mimeType: dto.mimeType ?? null,
      data: dto.data,
    });
  }

  @Get('posts/:id/attachments')
  listAttachments(@Param('id') id: string) {
    return this.boardService.listAttachments(id);
  }

  // 투표 질문/선택지/총 투표수/내가 고른 선택지까지 한 번에 — 화면이 한 번만 불러오면 되게.
  private async buildPollDetail(poll: { id: string; postId: string; question: string; allowMultiple: boolean; isAnonymous: boolean; closed: boolean; closesAt: Date | null; createdAt: Date }, userId: string) {
    const [options, votes] = await Promise.all([
      this.boardService.listPollOptions(poll.id),
      this.boardService.listPollVotes(poll.id),
    ]);
    const votesByOption = new Map<string, number>();
    for (const v of votes) votesByOption.set(v.optionId, (votesByOption.get(v.optionId) ?? 0) + 1);
    const myOptionIds = votes.filter((v) => v.userId === userId).map((v) => v.optionId);
    return {
      ...poll,
      options: options.map((o) => ({ ...o, votesCount: votesByOption.get(o.id) ?? 0 })),
      totalVotes: votes.length,
      hasVoted: myOptionIds.length > 0,
      myOptionIds,
    };
  }

  @Get('posts/:id/poll')
  async getPollDetail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const poll = await this.boardService.getPoll(id);
    if (!poll) return null;
    return this.buildPollDetail(poll, user.sub);
  }

  @Post('polls/:id/vote')
  async castPollVote(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body('optionIds') optionIds: string[]) {
    await this.boardService.castPollVote(id, user.sub, optionIds ?? []);
    const poll = await this.boardService.getPollById(id);
    if (!poll) throw new NotFoundException('투표를 찾을 수 없습니다.');
    return this.buildPollDetail(poll, user.sub);
  }

  @Post('polls/:id/close')
  async closePoll(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.boardService.closePoll(id, user.sub);
    return { ok: true };
  }

  @Post('posts/:id/report')
  async reportPost(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ReportPostDto) {
    await this.boardService.reportPost(id, user.sub, dto.reason, dto.detail);
    return { ok: true };
  }

  // 관리자 전용은 아니지만(이 백엔드엔 아직 운영자 권한 체계가 없음), main 쪽 화면은 운영자만 접근
  // 하도록 UI에서 가린다 — 본격적인 운영자 권한 체계는 "관리자" 기능 포팅 때 같이 정리할 예정.
  @Get('posts/:id/reports')
  listReportsForPost(@Param('id') id: string) {
    return this.boardService.listReportsForPost(id);
  }

  @Get('reports')
  listAllReports() {
    return this.boardService.listAllReports();
  }

  @Patch('reports/:id')
  async reviewReport(@Param('id') id: string, @Body('status') status: 'resolved' | 'dismissed') {
    await this.boardService.reviewReport(id, status);
    return { ok: true };
  }

  @Patch('posts/:id/recruiting')
  setRecruiting(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body('recruiting') recruiting: boolean) {
    return this.boardService.setRecruiting(id, user.sub, recruiting);
  }

  @Post('posts/:id/apply')
  apply(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ApplyDto) {
    return this.boardService.apply(id, user.sub, dto.message);
  }

  @Get('posts/:id/applications')
  listApplications(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.boardService.listApplications(id, user.sub);
  }

  @Post('applications/:id/accept')
  accept(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.boardService.respond(id, user.sub, true);
  }

  @Post('applications/:id/reject')
  reject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.boardService.respond(id, user.sub, false);
  }
}
