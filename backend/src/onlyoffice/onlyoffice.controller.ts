import { Body, Controller, Get, HttpCode, Logger, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { OnlyofficeService } from './onlyoffice.service.js';

@Controller('projects/:projectId/files/:fileId/onlyoffice')
export class OnlyofficeController {
  private readonly logger = new Logger(OnlyofficeController.name);

  constructor(private readonly onlyofficeService: OnlyofficeService) {}

  // 사용자가 "편집기 열기"를 누를 때 프론트가 부르는, 평소처럼 로그인 토큰으로 보호되는 엔드포인트.
  @UseGuards(JwtAuthGuard)
  @Get('config')
  getConfig(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('fileId') fileId: string) {
    return this.onlyofficeService.buildEditorConfig(projectId, fileId, user.sub);
  }

  // 아래 두 엔드포인트는 로그인한 브라우저가 아니라 OnlyOffice 서버(도커 컨테이너)가 서버 대
  // 서버로 직접 호출한다 — 쿠키/Bearer 로그인 토큰을 보낼 수 없으므로, getConfig가 발급해준
  // 파일/목적 범위로 서명된 단기 토큰(쿼리 파라미터)으로 대신 인증한다.
  @Get('raw')
  async getRaw(
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const payload = await this.onlyofficeService.verifyAccessToken(token);
      if (payload.purpose !== 'raw' || payload.projectId !== projectId || payload.fileId !== fileId) {
        res.status(403).send('invalid token');
        return;
      }
      const raw = await this.onlyofficeService.getRawFile(projectId, fileId, payload.userId);
      res.setHeader('Content-Type', raw.mime);
      res.send(raw.bytes);
    } catch (err) {
      this.logger.warn(`raw 조회 실패: ${err instanceof Error ? err.message : err}`);
      res.status(403).send('invalid token');
    }
  }

  // OnlyOffice는 콜백 응답 상태 코드가 정확히 200이 아니면 실패로 취급한다(201도 실패로 봄) —
  // @Res()를 쓰면 Nest가 매번 200을 보장해주지 않으므로 명시가 필요.
  @Post('callback')
  @HttpCode(200)
  async callback(
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @Query('token') token: string,
    @Body() body: { status?: number; url?: string },
    @Res() res: Response,
  ): Promise<void> {
    try {
      const payload = await this.onlyofficeService.verifyAccessToken(token);
      if (payload.purpose !== 'callback' || payload.projectId !== projectId || payload.fileId !== fileId) {
        res.json({ error: 1 });
        return;
      }
      await this.onlyofficeService.handleCallback(projectId, fileId, payload.userId, body);
      res.json({ error: 0 });
    } catch (err) {
      this.logger.error(`콜백 저장 실패: ${err instanceof Error ? err.message : err}`);
      res.json({ error: 1 });
    }
  }
}
