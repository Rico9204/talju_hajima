import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { User } from './user.entity.js';
import { ProfileLink } from './profile-link.entity.js';
import { ProjectMember } from '../projects/project-member.entity.js';

@Module({
  // AuthModule을 여기서 import하면 AuthModule -> UsersModule -> AuthModule 순환 참조가 되므로,
  // JwtAuthGuard가 필요로 하는 PassportModule만 직접 등록한다.
  imports: [TypeOrmModule.forFeature([User, ProfileLink, ProjectMember]), PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
