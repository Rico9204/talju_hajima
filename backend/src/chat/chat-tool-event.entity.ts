import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ChatMessage } from './chat-message.entity.js';
import { ProjectMember } from '../projects/project-member.entity.js';

export type ChatToolKind = 'draw' | 'ladder' | 'roulette';
export type ChatToolEventType = 'init' | 'draw_pick' | 'draw_reveal_all' | 'ladder_reveal' | 'roulette_spin';

// 서버가 결과를 정하는 채팅 도구(제비뽑기·사다리타기·룰렛)의 결과 기록. 채팅 로그에 위조 메시지를
// 넣어도 이 테이블의 내용이 바뀌지 않으므로, 화면은 항상 이 테이블을 결과의 출처로 삼는다
// (talju_hajima_update의 Supabase 마이그레이션 chat_tools_server.sql을 그대로 포팅).
@Entity('chat_tool_events')
// "한 번만 일어나는" 이벤트는 메시지당 하나만 — 동시에 두 번 눌러도 먼저 들어온 것만 성공.
@Index(['messageId', 'event'], { unique: true, where: "event in ('init', 'draw_reveal_all', 'ladder_reveal', 'roulette_spin')" })
export class ChatToolEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: ChatMessage;

  @Column({ name: 'message_id' })
  messageId: string;

  @Column({ name: 'project_id' })
  projectId: string;

  @Column({ type: 'enum', enum: ['draw', 'ladder', 'roulette'] })
  kind: ChatToolKind;

  @Column({ type: 'enum', enum: ['init', 'draw_pick', 'draw_reveal_all', 'ladder_reveal', 'roulette_spin'] })
  event: ChatToolEventType;

  @ManyToOne(() => ProjectMember, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_member_id' })
  actorMember: ProjectMember | null;

  @Column({ name: 'actor_member_id', type: 'uuid', nullable: true })
  actorMemberId: string | null;

  @Column({ type: 'jsonb', default: {} })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
