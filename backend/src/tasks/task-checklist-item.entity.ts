import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Task } from './task.entity.js';

@Entity('task_checklist_items')
export class TaskChecklistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Task)
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @Column({ name: 'task_id' })
  taskId: string;

  @Column()
  text: string;

  @Column({ default: false })
  done: boolean;
}
