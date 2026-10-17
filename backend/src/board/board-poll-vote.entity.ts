import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../users/user.entity.js';
import { BoardPoll } from './board-poll.entity.js';
import { BoardPollOption } from './board-poll-option.entity.js';

@Entity('board_poll_votes')
@Unique(['optionId', 'userId'])
export class BoardPollVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BoardPoll, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: BoardPoll;

  @Column({ name: 'poll_id' })
  pollId: string;

  @ManyToOne(() => BoardPollOption, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'option_id' })
  option: BoardPollOption;

  @Column({ name: 'option_id' })
  optionId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
