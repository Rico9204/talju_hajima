import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ChatMessage } from './chat-message.entity.js';
import { User } from '../users/user.entity.js';

@Entity('chat_reactions')
export class ChatReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ChatMessage)
  @JoinColumn({ name: 'message_id' })
  message: ChatMessage;

  @Column({ name: 'message_id' })
  messageId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  emoji: string;
}
