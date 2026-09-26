import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from '../projects/project.entity.js';
import { User } from '../users/user.entity.js';

export enum EvaluationPhase {
  MIDTERM = 'midterm',
  FINAL = 'final',
}

// 한 사람이 한 프로젝트에서 한 phase당 딱 한 번만 제출할 수 있음을 표시하는 잠금 레코드.
// 실제 점수는 PeerEvaluation에 있고, 이 row의 존재 여부 자체가 "제출했다"는 뜻.
@Entity('peer_evaluation_submissions')
export class PeerEvaluationSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ type: 'enum', enum: EvaluationPhase })
  phase: EvaluationPhase;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
