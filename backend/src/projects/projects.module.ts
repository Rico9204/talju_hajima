import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsService } from './projects.service.js';
import { ProjectsController } from './projects.controller.js';
import { Project } from './project.entity.js';
import { ProjectMember } from './project-member.entity.js';
import { Invitation } from './invitation.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectMember, Invitation]),
    AuthModule,
    UsersModule,
  ],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [TypeOrmModule, ProjectsService],
})
export class ProjectsModule {}
