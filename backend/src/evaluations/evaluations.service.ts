import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectsService } from '../projects/projects.service.js';
import { ProjectMember } from '../projects/project-member.entity.js';
import { AdminService } from '../admin/admin.service.js';
import { PeerEvaluationSubmission, EvaluationPhase } from './peer-evaluation-submission.entity.js';
import { PeerEvaluation } from './peer-evaluation.entity.js';
import { EvaluationSetting } from './evaluation-setting.entity.js';
import { EvaluationEntryDto } from './dto/submit-evaluations.dto.js';

const CRITERIA = ['role', 'deadline', 'communication', 'collaboration', 'quality'] as const;
type Criteria = Record<(typeof CRITERIA)[number], number>;
export type ScoreMethod = 'raw' | 'cca';

// 익명성 보호 — 내 평균 점수는 팀원 전원(나 제외)이 다 제출했을 때만 공개된다(한두 명만 제출한
// 시점에 평균을 보여주면 누가 무슨 점수를 줬는지 역추적하기 쉬워짐). 2명 미만이면 애초에 익명이
// 성립하지 않아 항상 비공개.
const MIN_PEERS_FOR_AVERAGE = 2;
// "상위 N%" 집계는 비교 인원이 너무 적으면 역추적 위험 + 통계적 의미가 없어서 숨긴다.
const MIN_POPULATION_FOR_PERCENTILE = 10;
const SETTINGS_ID = 'global';

export interface MyEvaluationAverage {
  available: boolean;
  count: number;
  score: number | null;
  criteria: Criteria | null;
  comments: string[];
}

export type EvaluationPercentiles =
  | { available: false; population: number }
  | { available: true; population: number; overall: number; criteria: Criteria };

function average(rows: PeerEvaluation[], key: (typeof CRITERIA)[number]): number {
  return rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
}

// 'cca' 미리보기 방식 — 평가자 수가 3명 이상일 때 항목별 최저/최고 1건을 제외하고 평균을 낸다
// (극단값에 의한 왜곡을 줄이는 목적). 3명 미만이면 뺄 극단값이 의미가 없어 단순 평균과 같다.
// NOTE: 원본 Supabase 함수(evaluation_average_preview)의 정확한 구현은 커밋된 적이 없어 이식
// 과정에서 이 트림드 민 방식으로 새로 정의함 — 공식 산정 방식으로 쓰기 전엔 재검토 필요.
function trimmedAverage(rows: PeerEvaluation[], key: (typeof CRITERIA)[number]): number {
  if (rows.length < 3) return average(rows, key);
  const values = rows.map((r) => r[key]).sort((a, b) => a - b);
  const trimmed = values.slice(1, -1);
  return trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
}

function criteriaFrom(rows: PeerEvaluation[], method: ScoreMethod): Criteria {
  const fn = method === 'cca' ? trimmedAverage : average;
  return {
    role: fn(rows, 'role'),
    deadline: fn(rows, 'deadline'),
    communication: fn(rows, 'communication'),
    collaboration: fn(rows, 'collaboration'),
    quality: fn(rows, 'quality'),
  };
}

function overallOf(criteria: Criteria): number {
  return (criteria.role + criteria.deadline + criteria.communication + criteria.collaboration + criteria.quality) / 5;
}

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectRepository(PeerEvaluationSubmission)
    private readonly submissionsRepository: Repository<PeerEvaluationSubmission>,
    @InjectRepository(PeerEvaluation)
    private readonly evaluationsRepository: Repository<PeerEvaluation>,
    @InjectRepository(EvaluationSetting)
    private readonly settingsRepository: Repository<EvaluationSetting>,
    @InjectRepository(ProjectMember)
    private readonly membersRepository: Repository<ProjectMember>,
    private readonly projectsService: ProjectsService,
    private readonly adminService: AdminService,
  ) {}

  private async getSettings(): Promise<EvaluationSetting> {
    const existing = await this.settingsRepository.findOne({ where: { id: SETTINGS_ID } });
    if (existing) return existing;
    return this.settingsRepository.save(this.settingsRepository.create({ id: SETTINGS_ID }));
  }

  async getMode(): Promise<boolean> {
    return (await this.getSettings()).evaluationMode;
  }
  async setMode(enabled: boolean, operatorUserId: string): Promise<void> {
    await this.assertOperator(operatorUserId);
    await this.getSettings();
    await this.settingsRepository.update(SETTINGS_ID, { evaluationMode: enabled });
  }
  async getMethodPreview(): Promise<boolean> {
    return (await this.getSettings()).methodPreviewEnabled;
  }
  async setMethodPreview(enabled: boolean, operatorUserId: string): Promise<void> {
    await this.assertOperator(operatorUserId);
    await this.getSettings();
    await this.settingsRepository.update(SETTINGS_ID, { methodPreviewEnabled: enabled });
  }
  async getScoreCca(): Promise<boolean> {
    return (await this.getSettings()).scoreCcaEnabled;
  }
  async setScoreCca(enabled: boolean, operatorUserId: string): Promise<void> {
    await this.assertOperator(operatorUserId);
    await this.getSettings();
    await this.settingsRepository.update(SETTINGS_ID, { scoreCcaEnabled: enabled });
  }

  private async assertOperator(userId: string): Promise<void> {
    if (!(await this.adminService.isOperator(userId))) {
      throw new ForbiddenException('운영자만 할 수 있습니다.');
    }
  }

  async getEvaluations(
    projectId: string,
    userId: string,
    phase: EvaluationPhase,
    methodOverride?: ScoreMethod,
  ): Promise<{ records: PeerEvaluation[]; submitted: boolean; average: MyEvaluationAverage }> {
    await this.projectsService.assertMembership(projectId, userId);

    const settings = await this.getSettings();
    const method: ScoreMethod = methodOverride && settings.methodPreviewEnabled ? methodOverride : settings.scoreCcaEnabled ? 'cca' : 'raw';

    const [submission, average] = await Promise.all([
      this.submissionsRepository.findOne({ where: { projectId, evaluatorId: userId, phase } }),
      this.computeMyAverage(projectId, userId, phase, method),
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

  private async computeMyAverage(projectId: string, userId: string, phase: EvaluationPhase, method: ScoreMethod): Promise<MyEvaluationAverage> {
    const memberUserIds = await this.projectsService.listMemberUserIds(projectId);
    const expected = memberUserIds.filter((id) => id !== userId).length;
    const rows = await this.evaluationsRepository.find({ where: { projectId, phase, recipientId: userId } });

    if (expected < MIN_PEERS_FOR_AVERAGE || rows.length < expected) {
      return { available: false, count: 0, score: null, criteria: null, comments: [] };
    }

    const criteria = criteriaFrom(rows, method);
    return {
      available: true,
      count: rows.length,
      score: overallOf(criteria),
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

  // 사용자 한 명의 전체(모든 프로젝트) 최종 평가 집계 — 프로젝트별 평균을 evalCount로 가중
  // 평균하는 것은, 그 프로젝트의 원본 row들을 전부 모아 한 번에 평균하는 것과 수학적으로 같다
  // (분모가 서로 상쇄됨). 그래서 "공개 가능한" 프로젝트의 row만 모아 flat하게 평균한다.
  private async aggregateFinalScore(userId: string, method: ScoreMethod): Promise<{ available: boolean; count: number; overall: number; criteria: Criteria }> {
    const rows = await this.evaluationsRepository.find({ where: { recipientId: userId, phase: EvaluationPhase.FINAL } });
    if (rows.length === 0) return { available: false, count: 0, overall: 0, criteria: criteriaFrom([], method) };

    const byProject = new Map<string, PeerEvaluation[]>();
    for (const row of rows) {
      const list = byProject.get(row.projectId) ?? [];
      list.push(row);
      byProject.set(row.projectId, list);
    }

    const availableRows: PeerEvaluation[] = [];
    for (const [projectId, projectRows] of byProject) {
      const memberUserIds = await this.projectsService.listMemberUserIds(projectId);
      const expected = memberUserIds.filter((id) => id !== userId).length;
      if (expected >= MIN_PEERS_FOR_AVERAGE && projectRows.length >= expected) availableRows.push(...projectRows);
    }

    if (availableRows.length === 0) return { available: false, count: 0, overall: 0, criteria: criteriaFrom([], method) };
    const criteria = criteriaFrom(availableRows, method);
    return { available: true, count: availableRows.length, overall: overallOf(criteria), criteria };
  }

  // 서비스 전체 사용자 중, 최종 평가 집계가 공개 가능한(= 팀원 전원이 제출 완료한 프로젝트가
  // 하나 이상 있는) 사람들의 집합. 이 함수가 돌려주는 배열이 상위 % 계산의 모수(population)다.
  private async allAggregateScores(method: ScoreMethod): Promise<{ userId: string; overall: number; criteria: Criteria }[]> {
    const rows = await this.evaluationsRepository.find({ where: { phase: EvaluationPhase.FINAL } });
    const recipientIds = [...new Set(rows.map((r) => r.recipientId))];
    const results: { userId: string; overall: number; criteria: Criteria }[] = [];
    for (const recipientId of recipientIds) {
      const agg = await this.aggregateFinalScore(recipientId, method);
      if (agg.available) results.push({ userId: recipientId, overall: agg.overall, criteria: agg.criteria });
    }
    return results;
  }

  private rankPercentiles(mine: { overall: number; criteria: Criteria }, population: { overall: number; criteria: Criteria }[]): EvaluationPercentiles {
    if (population.length < MIN_POPULATION_FOR_PERCENTILE) return { available: false, population: population.length };
    const topPercent = (value: number, all: number[]) => {
      const rankFromTop = all.filter((v) => v > value).length + 1;
      return Math.max(1, Math.ceil((rankFromTop / all.length) * 100));
    };
    const overall = topPercent(mine.overall, population.map((p) => p.overall));
    const criteria = {
      role: topPercent(mine.criteria.role, population.map((p) => p.criteria.role)),
      deadline: topPercent(mine.criteria.deadline, population.map((p) => p.criteria.deadline)),
      communication: topPercent(mine.criteria.communication, population.map((p) => p.criteria.communication)),
      collaboration: topPercent(mine.criteria.collaboration, population.map((p) => p.criteria.collaboration)),
      quality: topPercent(mine.criteria.quality, population.map((p) => p.criteria.quality)),
    };
    return { available: true, population: population.length, overall, criteria };
  }

  async getAggregatePercentiles(userId: string): Promise<EvaluationPercentiles> {
    const settings = await this.getSettings();
    const method: ScoreMethod = settings.scoreCcaEnabled ? 'cca' : 'raw';
    const population = await this.allAggregateScores(method);
    const mine = population.find((p) => p.userId === userId);
    if (!mine) return { available: false, population: population.length };
    return this.rankPercentiles(mine, population);
  }

  // 특정 프로젝트 안에서의 점수만 기준 — "이 프로젝트만 기준"이라 모수도 집계 점수가 아니라
  // 프로젝트별 개별 점수들의 전체 모음(서비스 전체의 모든 "프로젝트×멤버" 점수)로 비교한다.
  async getProjectMemberPercentiles(projectId: string, memberId: string): Promise<EvaluationPercentiles> {
    const member = await this.membersRepository.findOne({ where: { id: memberId } });
    if (!member) return { available: false, population: 0 };

    const settings = await this.getSettings();
    const method: ScoreMethod = settings.scoreCcaEnabled ? 'cca' : 'raw';

    const allRows = await this.evaluationsRepository.find({ where: { phase: EvaluationPhase.FINAL } });
    const byProjectRecipient = new Map<string, PeerEvaluation[]>();
    for (const row of allRows) {
      const key = `${row.projectId}:${row.recipientId}`;
      const list = byProjectRecipient.get(key) ?? [];
      list.push(row);
      byProjectRecipient.set(key, list);
    }

    const memberCountCache = new Map<string, number>();
    const population: { overall: number; criteria: Criteria }[] = [];
    let mine: { overall: number; criteria: Criteria } | null = null;

    for (const [key, groupRows] of byProjectRecipient) {
      const [groupProjectId, groupRecipientId] = key.split(':');
      let memberCount = memberCountCache.get(groupProjectId);
      if (memberCount === undefined) {
        memberCount = (await this.projectsService.listMemberUserIds(groupProjectId)).length;
        memberCountCache.set(groupProjectId, memberCount);
      }
      const expected = memberCount - 1;
      if (expected < MIN_PEERS_FOR_AVERAGE || groupRows.length < expected) continue;

      const criteria = criteriaFrom(groupRows, method);
      const entry = { overall: overallOf(criteria), criteria };
      population.push(entry);
      if (groupProjectId === projectId && groupRecipientId === member.userId) mine = entry;
    }

    if (!mine) return { available: false, population: population.length };
    return this.rankPercentiles(mine, population);
  }
}
