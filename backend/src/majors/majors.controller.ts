import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { MajorsService } from './majors.service.js';

@UseGuards(JwtAuthGuard)
@Controller('majors')
export class MajorsController {
  constructor(private readonly majorsService: MajorsService) {}

  @Get()
  async findMajors(@Query('school') school?: string) {
    const trimmed = (school ?? '').trim();
    if (!trimmed) throw new BadRequestException('school query param is required');
    const majors = await this.majorsService.findMajors(trimmed);
    return { majors };
  }

  // 워크스페이스 버전 트리를 공학자용/비공학자용 중 어느 쪽으로 기본 표시할지 정하는 용도.
  @Get('classify')
  async classify(@Query('school') school?: string, @Query('major') major?: string) {
    const trimmedSchool = (school ?? '').trim();
    const trimmedMajor = (major ?? '').trim();
    if (!trimmedSchool || !trimmedMajor) throw new BadRequestException('school and major query params are required');
    const engineering = await this.majorsService.isEngineeringMajor(trimmedSchool, trimmedMajor);
    return { engineering };
  }
}
