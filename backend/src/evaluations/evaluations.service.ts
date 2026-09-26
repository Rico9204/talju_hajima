import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectsService } from '../projects/projects.service.js';
import { PeerEvaluationSubmission, EvaluationPhase } from './peer-evaluation-submission.entity.js';
import { PeerEvaluation } from './peer-evaluation.entity.js';
import { EvaluationEntryDto } from './dto/submit-evaluations.dto.js';

const CRITERIA = ['role', 'deadline', 'communication', 'collaboration', 'quality'] as const;
// 익명성 보호 — 내 평균 점수는 팀원 전원(나 제외)이 다 제출했을 때만 공개된다(한두 명만 제출한
// 시점에 평균을 보여주면 누가 무슨 점수를 줬는지 역추적하기 쉬워짐). 2명 미만이면 애초에 익명이
// 성립하지 않아 항상 비공개.
const MIN_PEERS_FOR_AVERAGE = 2;

export interface MyEvaluationAverage {
  available: boolean;
  count: number;
  score: number | null;
  criteria: Record<(typeof CRITERIA)[number], number> | null;
  comments: string[];
}

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectRepository(PeerEvaluationSubmission)
    private readonly submissionsRepository: Repository<PeerEvaluationSubmission>,
    @InjectRepository(PeerEvaluation)
    private readonly evaluationsRepository: Repository<PeerEvaluation>,
    private readonly projectsService: ProjectsService,
  ) {}

  async getEvaluations(
    projectId: string,
    userId: string,
    phase: EvaluationPhase,
  ): Promise<{ records: PeerEvaluation[]; submitted: boolean; average: MyEvaluationAverage }> {
    await this.projectsService.assertMembership(projectId, userId);

    const [submission, average] = await Promise.all([
      this.submissionsRepository.findOne({ where: { projectId, evaluatorId: userId, phase } }),
      this.computeMyAverage(projectId, userId, phase),
    ]);

    // 중간 평가는 나와 관련된 것만(내가 평가자거나 대상자), 최종 평가는 팀 전체에 공개
    // (talju_hajima_이식기록.txt와 같은 방식으로 이식한 동료 평가 마이그레이션의 프로토타입
    // 모드 규칙 — main1엔 "프로젝트 종료" 상태 자체가 없어서 항상 이 규칙을 쓴다).
    const records =
      phase === EvaluationPhase.FINAL
        ? await this.evaluationsRepository.find({ where: { projectId, phase }, order: { createdAt: 'ASC' } })
        : await this.evaluationsRepository.find({
            where: [
              { projectId, phase, evaluatorId: userId },
              { projectId, phase, recipientId: userId },
            ],
            order: { createdAt: 'ASC' },
          });

    return { records, submitted: !!submission, average };
  }

  private async computeMyAverage(projectId: string, userId: string, phase: EvaluationPhase): Promise<MyEvaluationAverage> {
    const memberUserIds = await this.projectsService.listMemberUserIds(projectId);
    const expected = memberUserIds.filter((id) => id !== userId).length;
    const rows = await this.evaluationsRepository.find({ where: { projectId, phase, recipientId: userId } });

    if (expected < MIN_PEERS_FOR_AVERAGE || rows.length < expected) {
      return { available: false, count: 0, score: null, criteria: null, comments: [] };
    }

    const avg = (key: (typeof CRITERIA)[number]) => rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
    const criteria = { role: avg('role'), deadline: avg('deadline'), communication: avg('communication'), collaboration: avg('collaboration'), quality: avg('quality') };
    const score = (criteria.role + criteria.deadline + criteria.communication + criteria.collaboration + criteria.quality) / 5;
    return {
      available: true,
      count: rows.length,
      score,
      criteria,
      // 최종 평가는 코멘트를 아예 안 받음(submit에서 항상 빈 문자열로 저장) — 중간 평가만 코멘트 노출.
      comments: phase === EvaluationPhase.MIDTERM ? rows.map((r) => r.comment).filter((c) => c.trim()) : [],
    };
  }

  async submit(projectId: string, userId: string, phase: EvaluationPhase, entries: EvaluationEntryDto[]): Promise<void> {
    await this.projectsService.assertMembership(projectId, userId);

    const existing = await this.submissionsRepository.findOne({ where: { projectId, evaluatorId: userId, phase } });
    if (existing) throw new ForbiddenException('이미 제출한 평가입니다.');

    const memberUserIds = await this.projectsService.listMemberUserIds(projectId);
    const peerIds = new Set(memberUserIds.filter((id) => id !== userId));
    if (peerIds.size === 0) throw new BadRequestException('평가할 동료가 없습니다.');
    if (entries.length !== peerIds.size) throw new BadRequestException('팀원 목록이 변경되었습니다. 새로고침해 주세요.');

    const recipientIds = new Set(entries.map((e) => e.recipientId));
    if (recipientIds.size !== entries.length) throw new BadRequestException('같은 동료를 두 번 평가할 수 없습니다.');
    for (const id of recipientIds) {
      if (!peerIds.has(id)) throw new BadRequestException('평가 대상이 올바르지 않습니다.');
    }

    const pool = peerIds.size * 5;
    for (const key of CRITERIA) {
      const sum = entries.reduce((total, e) => total + e[key], 0);
      if (sum !== pool) throw new BadRequestException(`'${key}' 항목의 총점은 동료 수 × 5점(${pool}점)이어야 합니다.`);
    }

    const submission = await this.submissionsRepository.save(
      this.submissionsRepository.create({ projectId, evaluatorId: userId, phase }),
    );
    const rows = entries.map((e) =>
      this.evaluationsRepository.create({
        submissionId: submission.id,
        projectId,
        evaluatorId: userId,
        recipientId: e.recipientId,
        phase,
        role: e.role,
        deadline: e.deadline,
        communication: e.communication,
        collaboration: e.collaboration,
        quality: e.quality,
        // 최종 평가는 점수만 — 서술형 코멘트는 익명성이 깨질 위험이 커서 받지 않는다.
        comment: phase === EvaluationPhase.FINAL ? '' : (e.comment?.trim() ?? ''),
      }),
    );
    await this.evaluationsRepository.save(rows);
  }
}
