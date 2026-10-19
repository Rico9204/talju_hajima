import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ChatMessage } from './chat-message.entity.js';

// 제비뽑기의 정답(어떤 제비가 당첨인지)만 여기 두고, 클라이언트에는 절대 내려주지 않는다 —
// 사다리/룰렛은 결과를 미리 알 수 없는 구조라 별도 비밀이 필요 없다(init 시점에 즉시 계산).
@Entity('chat_tool_secrets')
export class ChatToolSecret {
  @PrimaryColumn({ name: 'message_id' })
  messageId: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: ChatMessage;

  @Column({ name: 'project_id' })
  projectId: string;

  @Column({ type: 'jsonb' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  secret: any;
}
