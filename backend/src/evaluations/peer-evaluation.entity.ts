import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PeerEvaluationSubmission } from './peer-evaluation-submission.entity.js';
import { Project } from '../projects/project.entity.js';
import { User } from '../users/user.entity.js';
import { EvaluationPhase } from './peer-evaluation-submission.entity.js';

// 평가자 한 명이 동료 한 명에게 매긴 점수 한 건. talju_hajima_update의 Supabase 스키마
// (peer_evaluations)를 그대로 옮김 — 항목 5개는 1~10 정수, comment는 중간 평가에서만 쓰고
// 최종 평가는 점수만(서비스 레이어에서 항상 빈 문자열로 저장, 아래 PeerEvaluationsService 참고).
@Entity('peer_evaluations')
export class PeerEvaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PeerEvaluationSubmission)
  @JoinColumn({ name: 'submission_id' })
  submission: PeerEvaluationSubmission;

  @Column({ name: 'submission_id' })
  submissionId: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'evaluator_id' })
  evaluator: User;

  @Column({ name: 'evaluator_id' })
  evaluatorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'recipient_id' })
  recipient: User;

  @Column({ name: 'recipient_id' })
  recipientId: string;

  @Column({ type: 'enum', enum: EvaluationPhase })
  phase: EvaluationPhase;

  @Column()
  role: number;

  @Column()
  deadline: number;

  @Column()
  communication: number;

  @Column()
  collaboration: number;

  @Column()
  quality: number;

  @Column({ type: 'text', default: '' })
  comment: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
