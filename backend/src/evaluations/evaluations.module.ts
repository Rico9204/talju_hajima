import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvaluationsService } from './evaluations.service.js';
import { EvaluationsController } from './evaluations.controller.js';
import { PeerEvaluationSubmission } from './peer-evaluation-submission.entity.js';
import { PeerEvaluation } from './peer-evaluation.entity.js';
import { EvaluationSetting } from './evaluation-setting.entity.js';
import { ProjectMember } from '../projects/project-member.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { AdminModule } from '../admin/admin.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([PeerEvaluationSubmission, PeerEvaluation, EvaluationSetting, ProjectMember]),
    AuthModule,
    ProjectsModule,
    AdminModule,
  ],
  providers: [EvaluationsService],
  controllers: [EvaluationsController],
})
export class EvaluationsModule {}
