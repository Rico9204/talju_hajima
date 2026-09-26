import { Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, UserId } from "./auth.js";
import { Db } from "./db.js";

// 배포 확인용. 로그인 없이 부를 수 있는 유일한 경로이며 DB에 닿지 않는다.
@Controller("health")
export class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

@Controller()
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly db: Db) {}

  // 메인 화면 프로젝트 카드의 알림 점: 확인하지 않은 것이 있는 내 프로젝트 id들.
  @Get("me/project-alerts")
  projectAlerts(@UserId() userId: string) {
    return this.db.asUser(userId, async (query) =>
      (await query<{ project_id: string; has_alert: boolean }>("select project_id, has_alert from public.my_project_alerts()"))
        .filter((row) => row.has_alert)
        .map((row) => row.project_id),
    );
  }

  // 과제·일정·워크스페이스 화면을 본 시각 기록(섹션 이름 검사는 DB 함수가 한다).
  @Post("projects/:projectId/sections/:section/viewed")
  @HttpCode(204)
  async markSectionViewed(@UserId() userId: string, @Param("projectId") projectId: string, @Param("section") section: string) {
    await this.db.asUser(userId, (query) => query("select public.mark_section_viewed($1, $2)", [projectId, section]));
  }
}
