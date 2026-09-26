import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MajorsController } from './majors.controller.js';
import { MajorsService } from './majors.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [MajorsController],
  providers: [MajorsService],
})
export class MajorsModule {}
