import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { BoardService } from './board.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { ApplyDto } from './dto/apply.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get('posts')
  listPosts(@Query('tag') tag?: string, @Query('q') q?: string) {
    return this.boardService.listPosts({ tag, q });
  }

  @Post('posts')
  createPost(@CurrentUser() user: JwtPayload, @Body() dto: CreatePostDto) {
    return this.boardService.createPost(user.sub, dto);
  }

  @Delete('posts/:id')
  async deletePost(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.boardService.deletePost(id, user.sub);
    return { ok: true };
  }

  @Patch('posts/:id/recruiting')
  setRecruiting(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body('recruiting') recruiting: boolean) {
    return this.boardService.setRecruiting(id, user.sub, recruiting);
  }

  @Post('posts/:id/apply')
  apply(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ApplyDto) {
    return this.boardService.apply(id, user.sub, dto.message);
  }

  @Get('posts/:id/applications')
  listApplications(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.boardService.listApplications(id, user.sub);
  }

  @Post('applications/:id/accept')
  accept(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.boardService.respond(id, user.sub, true);
  }

  @Post('applications/:id/reject')
  reject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.boardService.respond(id, user.sub, false);
  }
}
