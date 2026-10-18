import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { EvaluationsService, ScoreMethod } from './evaluations.service.js';
import { EvaluationPhase } from './peer-evaluation-submission.entity.js';
import { SubmitEvaluationsDto } from './dto/submit-evaluations.dto.js';

function parsePhase(phase: string): EvaluationPhase {
  if (phase === EvaluationPhase.MIDTERM || phase === EvaluationPhase.FINAL) return phase;
  throw new BadRequestException('잘못된 평가 유형입니다.');
}

function parseMethod(method?: string): ScoreMethod | undefined {
  if (method === undefined) return undefined;
  if (method === 'raw' || method === 'cca') return method;
  throw new BadRequestException('잘못된 점수 방식입니다.');
}

@UseGuards(JwtAuthGuard)
@Controller()
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Get('evaluation-mode')
  async getMode() {
    return this.evaluationsService.getMode();
  }

  @Put('evaluation-mode')
  async setMode(@CurrentUser() user: JwtPayload, @Body() body: { enabled: boolean }) {
    await this.evaluationsService.setMode(body.enabled, user.sub);
    return { ok: true };
  }

  @Get('evaluation-method-preview')
  async getMethodPreview() {
    return this.evaluationsService.getMethodPreview();
  }

  @Put('evaluation-method-preview')
  async setMethodPreview(@CurrentUser() user: JwtPayload, @Body() body: { enabled: boolean }) {
    await this.evaluationsService.setMethodPreview(body.enabled, user.sub);
    return { ok: true };
  }

  @Get('evaluation-score-cca')
  async getScoreCca() {
    return this.evaluationsService.getScoreCca();
  }

  @Put('evaluation-score-cca')
  async setScoreCca(@CurrentUser() user: JwtPayload, @Body() body: { enabled: boolean }) {
    await this.evaluationsService.setScoreCca(body.enabled, user.sub);
    return { ok: true };
  }

  @Get('me/evaluation-percentiles')
  async getMyPercentiles(@CurrentUser() user: JwtPayload, @Query('projectId') projectId?: string, @Query('memberId') memberId?: string) {
    if (projectId && memberId) return this.evaluationsService.getProjectMemberPercentiles(projectId, memberId);
    return this.evaluationsService.getAggregatePercentiles(user.sub);
  }

  @Get('projects/:projectId/evaluations/:phase')
  getEvaluations(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('phase') phase: string,
    @Query('method') method?: string,
  ) {
    return this.evaluationsService.getEvaluations(projectId, user.sub, parsePhase(phase), parseMethod(method));
  }

  @Post('projects/:projectId/evaluations/:phase')
  async submit(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('phase') phase: string,
    @Body() dto: SubmitEvaluationsDto,
  ) {
    await this.evaluationsService.submit(projectId, user.sub, parsePhase(phase), dto.entries);
    return { ok: true };
  }
}
