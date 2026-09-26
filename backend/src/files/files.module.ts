import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesService } from './files.service.js';
import { FilesController } from './files.controller.js';
import { SyncPresenceService } from './sync-presence.service.js';
import { SyncPresenceController } from './sync-presence.controller.js';
import { ProjectFile } from './project-file.entity.js';
import { FileVersion } from './file-version.entity.js';
import { FileComment } from './file-comment.entity.js';
import { FileVersionPin } from './file-version-pin.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectFile, FileVersion, FileComment, FileVersionPin]),
    AuthModule,
    ProjectsModule,
  ],
  providers: [FilesService, SyncPresenceService],
  controllers: [FilesController, SyncPresenceController],
  exports: [TypeOrmModule, FilesService],
})
export class FilesModule {}
