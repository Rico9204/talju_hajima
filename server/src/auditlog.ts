import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { isIP } from "node:net";
import type { Request } from "express";
import { defer, from, of, switchMap, tap, type Observable } from "rxjs";
import type { ClientAddress } from "./auth.js";
import { Db } from "./db.js";

// 접속 감사 기록(public.audit_log). 쓰기는 이 서버만 한다. 읽기(운영자 창)는 audit.ts.
//  - 접속: 로그인 성공과 로그인 유지(토큰 갱신)를 IP와 함께 남겨, IP별 "처음~마지막 접속"을 계산한다.
//  - 활동: 업로드와 삭제만(요청 본문·내용은 저장하지 않고 "무엇을 했는지"만).
// 기록에 실패해도 사용자 요청은 그대로 진행한다. 보관 기간은 1년(하루에 한 번 오래된 기록을 지운다).
export type AuditKind = "login" | "refresh" | "upload" | "delete";

export interface AuditEvent {
  userId: string;
  ip: string;
  kind: AuditKind;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  projectId?: string;
  projectName?: string;
  detail?: Record<string, unknown>;
}

const PURGE_EVERY_MS = 24 * 60 * 60 * 1000;
const LOOPBACK = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1"]);

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Audit");
  private first?: NodeJS.Timeout;
  private every?: NodeJS.Timeout;

  constructor(private readonly db: Db, private readonly address: ClientAddress) {}

  onModuleInit(): void {
    this.first = setTimeout(() => void this.purge(), 30_000);
    this.every = setInterval(() => void this.purge(), PURGE_EVERY_MS);
    this.first.unref(); this.every.unref();
  }

  onModuleDestroy(): void { clearTimeout(this.first); clearInterval(this.every); }

  // 요청한 사람의 IP. Vercel을 거치면 그 헤더의 실제 사용자 IP, 터널(cloudflared)로 직접 들어오면(서버에는 localhost로 보인다) cf-connecting-ip.
  // 서버에 직접 연결한 주소가 localhost일 때만 cf-connecting-ip를 믿는다(밖에서는 위조할 수 있으므로).
  ipOf(req: Request): string {
    const { client, hop } = this.address.of(req);
    let ip = client;
    if (LOOPBACK.has(hop) && client === hop) {
      const header = req.headers["cf-connecting-ip"];
      const cf = (Array.isArray(header) ? header[0] : header)?.trim() ?? "";
      if (isIP(cf)) ip = cf;
    }
    return ip.replace(/^::ffff:/, "").slice(0, 64);
  }

  // 기록 하나. 실패는 로그만 남기고 삼킨다.
  async record(event: AuditEvent): Promise<void> {
    try {
      await this.db.asSystem(async (query) => {
        const [who] = await query<{ email: string | null; name: string | null }>(
          "select u.email, p.display_name as name from auth.users u left join public.profiles p on p.id = u.id where u.id = $1", [event.userId]);
        await query(
          `insert into public.audit_log(user_id, user_email, user_name, ip, kind, target_type, target_id, target_name, project_id, project_name, detail)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
          [event.userId, who?.email ?? "", who?.name ?? "", event.ip, event.kind, event.targetType ?? null, event.targetId ?? null,
            event.targetName?.slice(0, 300) ?? null, event.projectId ?? null, event.projectName?.slice(0, 300) ?? null, JSON.stringify(event.detail ?? {})]);
      });
    } catch (error) {
      this.logger.warn(`감사 기록을 남기지 못했습니다: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 1년이 지난 기록 삭제
  async purge(): Promise<number> {
    try {
      const rows = await this.db.asSystem((query) => query<{ n: string }>("select public.purge_audit_log()::text as n"));
      const removed = Number(rows[0]?.n ?? 0);
      if (removed > 0) this.logger.log(`보관 기간(1년)이 지난 감사 기록 ${removed}개를 지웠습니다.`);
      return removed;
    } catch (error) {
      this.logger.warn(`감사 기록 정리에 실패했습니다: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  }

  // 삭제·업로드 대상의 이름·소속 프로젝트(삭제하기 전에 읽어야 이름을 알 수 있다). 못 찾거나 오류면 빈 값.
  async resolve(sql: string | undefined, id: string | undefined): Promise<{ name?: string; project_id?: string; project_name?: string }> {
    if (!sql || id === undefined) return {};
    try {
      const rows = await this.db.asSystem((query) => query<{ name?: string; project_id?: string; project_name?: string }>(sql, [id]));
      return rows[0] ?? {};
    } catch { return {}; }
  }
}

// ── 어떤 요청을 활동으로 남길지 ──
// 키: "메서드 경로"(전역 접두사 /api 제외). 삭제는 모든 삭제 요청 중 아래 대상, 업로드는 파일을 받는 요청.
const WITH_PROJECT = (table: string, nameColumn: string, idCast: string) =>
  `select t.${nameColumn} as name, t.project_id, p.name as project_name from public.${table} t join public.projects p on p.id = t.project_id where t.id = $1::${idCast}`;

interface Rule {
  kind: "upload" | "delete";
  type: string;
  idParam?: string; // 대상 번호가 들어 있는 경로 변수
  sql?: string; // 삭제 전에 이름을 읽는 쿼리($1 = 대상 번호)
}

const RULES: Record<string, Rule> = {
  "DELETE workspace/files/:fileId": { kind: "delete", type: "workspace_file", idParam: "fileId", sql: WITH_PROJECT("files", "name", "bigint") },
  "DELETE workspace/folders/:folderId": { kind: "delete", type: "workspace_folder", idParam: "folderId", sql: WITH_PROJECT("folders", "name", "bigint") },
  "DELETE projects/:projectId": { kind: "delete", type: "project", idParam: "projectId", sql: "select name, id as project_id, name as project_name from public.projects where id = $1" },
  "DELETE members/:memberId": { kind: "delete", type: "member", idParam: "memberId", sql: WITH_PROJECT("members", "name", "uuid") },
  "DELETE tasks/:taskId": { kind: "delete", type: "task", idParam: "taskId", sql: WITH_PROJECT("tasks", "title", "bigint") },
  "DELETE schedule/:eventId": { kind: "delete", type: "schedule_event", idParam: "eventId", sql: WITH_PROJECT("schedule_events", "title", "bigint") },
  "DELETE board/posts/:postId": { kind: "delete", type: "board_post", idParam: "postId", sql: "select title as name from public.board_posts where id = $1::bigint" },
  "DELETE board/comments/:commentId": { kind: "delete", type: "board_comment", idParam: "commentId", sql: "select left(coalesce(to_jsonb(c)->>'content', to_jsonb(c)->>'text', ''), 60) as name from public.board_comments c where c.id = $1::bigint" },
  "DELETE announcements/:id": { kind: "delete", type: "announcement", idParam: "id", sql: "select title as name from public.announcements where id = $1::bigint" },
  "POST projects/:projectId/files": { kind: "upload", type: "workspace_file" },
  "POST me/images/:kind": { kind: "upload", type: "profile_image" },
  "POST board/attachments": { kind: "upload", type: "board_attachment" },
  "POST me/admin-application": { kind: "upload", type: "admin_document" },
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value); // 경로 변수는 한 값이다

type AuditedRequest = Request & { userId?: string; file?: { originalname?: string; size?: number } };

// multer는 파일 이름을 latin1로 읽는다 — 브라우저가 보낸 UTF-8 이름(한글 등)을 되살린다.
const decodeName = (name: string | undefined) => (name ? Buffer.from(name, "latin1").toString("utf8") : undefined);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const req = context.switchToHttp().getRequest<AuditedRequest>();
    const pattern = (req.route?.path as string | undefined)?.replace(/^\/api\//, "");
    const rule = pattern ? RULES[`${req.method} ${pattern}`] : undefined;
    const userId = req.userId; // 인증 가드가 먼저 정한다
    if (!rule || !userId) return next.handle();
    // 삭제는 지우기 전에 이름을 읽어 둔다.
    const before = rule.kind === "delete" ? from(this.audit.resolve(rule.sql, rule.idParam ? one(req.params[rule.idParam]) : undefined)) : of({});
    return before.pipe(switchMap((resolved) => defer(() => next.handle()).pipe(
      tap({ next: (result) => void this.log(rule, req, userId, resolved, result) }), // 성공했을 때만 남긴다
    )));
  }

  private async log(rule: Rule, req: AuditedRequest, userId: string, resolved: { name?: string; project_id?: string; project_name?: string }, result: unknown): Promise<void> {
    const ip = this.audit.ipOf(req);
    if (rule.kind === "delete") {
      await this.audit.record({
        userId, ip, kind: "delete", targetType: rule.type, targetId: rule.idParam ? String(req.params[rule.idParam]) : undefined,
        targetName: resolved.name, projectId: resolved.project_id, projectName: resolved.project_name,
      });
      return;
    }
    // 업로드: 파일 이름·크기. 워크스페이스는 어느 프로젝트의 어느 파일(새 버전인지)인지도.
    const file = req.file;
    const body = result as { fileId?: number; versionId?: number; branched?: boolean } | null;
    const detail: Record<string, unknown> = { size: file?.size ?? null };
    let projectId: string | undefined; let projectName: string | undefined; let targetId: string | undefined;
    if (rule.type === "workspace_file") {
      projectId = one(req.params.projectId);
      projectName = (await this.audit.resolve("select name, id as project_id, name as project_name from public.projects where id = $1", projectId)).name;
      targetId = body?.fileId !== undefined ? String(body.fileId) : undefined;
      detail.versionId = body?.versionId ?? null;
      detail.newVersion = !!(req.body as { fileId?: string } | undefined)?.fileId; // 이미 있는 파일에 새 버전으로 올렸는가
      detail.branched = body?.branched ?? false;
    } else if (rule.type === "profile_image") {
      detail.kind = one(req.params.kind);
    }
    await this.audit.record({ userId, ip, kind: "upload", targetType: rule.type, targetId, targetName: decodeName(file?.originalname), projectId, projectName, detail });
  }
}
