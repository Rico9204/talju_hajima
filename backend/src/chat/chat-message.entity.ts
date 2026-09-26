import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Project } from '../projects/project.entity.js';
import { User } from '../users/user.entity.js';
import { ProjectFile } from '../files/project-file.entity.js';

// channelId: "all"(팀 전체 채널) 또는 "dm:<idA>:<idB>"(idA < idB, 1:1 대화) — chat.service.ts의
// dmChannelId()가 생성/검증한다. 별도의 채널 테이블 없이 이 문자열 하나로 채널을 구분한다.
@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'project_id' })
  projectId: string;

  @Column({ name: 'channel_id' })
  channelId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'sender_id' })
  senderId: string;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @ManyToOne(() => ProjectFile, { nullable: true })
  @JoinColumn({ name: 'file_id' })
  file: ProjectFile | null;

  @Column({ name: 'file_id', type: 'uuid', nullable: true })
  fileId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
