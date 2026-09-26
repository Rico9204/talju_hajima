import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { EvaluationsService } from './evaluations.service.js';
import { EvaluationPhase } from './peer-evaluation-submission.entity.js';
import { SubmitEvaluationsDto } from './dto/submit-evaluations.dto.js';

function parsePhase(phase: string): EvaluationPhase {
  if (phase === EvaluationPhase.MIDTERM || phase === EvaluationPhase.FINAL) return phase;
  throw new BadRequestException('잘못된 평가 유형입니다.');
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/evaluations')
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Get(':phase')
  getEvaluations(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('phase') phase: string) {
    return this.evaluationsService.getEvaluations(projectId, user.sub, parsePhase(phase));
  }

  @Post(':phase')
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
