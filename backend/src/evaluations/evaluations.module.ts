import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvaluationsService } from './evaluations.service.js';
import { EvaluationsController } from './evaluations.controller.js';
import { PeerEvaluationSubmission } from './peer-evaluation-submission.entity.js';
import { PeerEvaluation } from './peer-evaluation.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([PeerEvaluationSubmission, PeerEvaluation]), AuthModule, ProjectsModule],
  providers: [EvaluationsService],
  controllers: [EvaluationsController],
})
export class EvaluationsModule {}
