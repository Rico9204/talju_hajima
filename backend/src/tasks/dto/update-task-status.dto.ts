import { IsEnum } from 'class-validator';
import { TaskStatus } from '../task.entity.js';

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;
}
