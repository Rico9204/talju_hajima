import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BoardPoll } from './board-poll.entity.js';

@Entity('board_poll_options')
export class BoardPollOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BoardPoll, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poll_id' })
  poll: BoardPoll;

  @Column({ name: 'poll_id' })
  pollId: string;

  @Column()
  text: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;
}
