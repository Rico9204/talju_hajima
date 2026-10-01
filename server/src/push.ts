import { Body, Controller, HttpCode, Logger, Post, UseGuards, type OnModuleDestroy } from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";
import { randomBytes } from "node:crypto";
import webpush from "web-push";
import { AuthGuard, UserId } from "./auth.js";
import { Db } from "./db.js";

// ── 웹 푸시(브라우저를 닫아도 새 과제·일정·파일·채팅 알림) ──
// Supabase에서는 DB 트리거(push_to_members)가 pg_net으로 Vercel 함수(/api/push)에 보냈다.
// 일반 PostgreSQL에는 pg_net이 없어서 db/realtime.sql이 같은 이름의 net.http_post를 두고, 요청을 net.push_outbox에 쌓아
// pg_notify('talju_push', id)로 알린다. 이 서버가 알림을 받아 브라우저 푸시 서비스로 암호화해 보낸다.
// 받을 사람 계산(볼 권한이 있는 팀원, 작성자 제외)은 그대로 DB 트리거가 한다.

export interface VapidKeys { publicKey: string; privateKey: string; subject: string }
export type PushSend = (subscription: webpush.PushSubscription, payload: string) => Promise<unknown>;

const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;
const BACKLOG_MS = 10 * 60_000; // 서버가 꺼져 있던 동안 쌓인 요청은 10분 이내 것만 보낸다(오래된 알림은 의미 없음)
// push_to_members는 보낼 곳(push_config)이 없으면 아무것도 하지 않는다. 이 서버에서 주소는 쓰이지 않고 "켜짐" 표시일 뿐이다.
const SELF_ENDPOINT = "https://localhost/self-hosted-push";

type Subscription = { endpoint: string; p256dh: string; auth: string };
type Notice = { title: string; body: string; url: string; tag: string };

function parse(input: unknown): { subscriptions: Subscription[]; notification: Notice } | null {
  const body = input as { subscriptions?: unknown; notification?: Partial<Record<keyof Notice, unknown>> } | null;
  const n = body?.notification;
  if (!Array.isArray(body?.subscriptions) || !n || typeof n.title !== "string" || typeof n.url !== "string") return null;
  // 알림을 누르면 여는 주소는 우리 사이트 안(/로 시작)만.
  if (!n.url.startsWith("/") || n.url.startsWith("//")) return null;
  const subscriptions = (body.subscriptions as Partial<Subscription>[]).filter((s): s is Subscription =>
    !!s && typeof s.endpoint === "string" && PUSH_HOST.test(s.endpoint) && typeof s.p256dh === "string" && typeof s.auth === "string");
  return {
    subscriptions,
    notification: { title: n.title.slice(0, 120), body: typeof n.body === "string" ? n.body.slice(0, 300) : "", url: n.url, tag: typeof n.tag === "string" ? n.tag.slice(0, 120) : "" },
  };
}

export class PushSender implements OnModuleDestroy {
  private readonly logger = new Logger("WebPush");
  private unlisten?: () => Promise<void>;
  private readonly send: PushSend;

  constructor(private readonly db: Db, private readonly vapid?: VapidKeys, send?: PushSend) {
    this.send = send ?? ((subscription, payload) => webpush.sendNotification(subscription, payload, { TTL: 24 * 60 * 60 }));
  }

  // 마이그레이션(2610011300_web_push.sql)이나 db/realtime.sql을 아직 적용하지 않은 DB에서도 서버는 뜨고, 웹 푸시만 꺼진다.
  async start(): Promise<void> {
    try {
      await this.setup();
    } catch (error) {
      this.logger.warn(`웹 푸시를 켜지 못했습니다(supabase/migrations와 server/db/realtime.sql 적용 확인): ${error instanceof Error ? error.message : error}`);
      // 보내지 못할 요청이 쌓이지 않게 트리거를 끈다(표가 없으면 그대로 실패해도 된다).
      await this.db.asSystem((query) => query("delete from public.push_config")).catch(() => {});
    }
  }

  private async setup(): Promise<void> {
    if (!this.vapid) {
      // 키가 없으면 트리거가 구독을 모으지도 않게 끈다.
      await this.db.asSystem((query) => query("delete from public.push_config"));
      return;
    }
    try {
      webpush.setVapidDetails(this.vapid.subject, this.vapid.publicKey, this.vapid.privateKey);
    } catch (error) {
      throw new Error(`웹 푸시 VAPID 설정 오류: ${error instanceof Error ? error.message : error}`);
    }
    // 비밀값은 Vercel 함수(prune_push_subscriptions)용이라 이 서버에서는 쓰지 않는다 — 실행마다 새 임의 값.
    await this.db.asSystem((query) => query(
      "insert into public.push_config(endpoint, secret) values ($1, $2) on conflict (id) do update set endpoint = excluded.endpoint, secret = excluded.secret",
      [SELF_ENDPOINT, randomBytes(32).toString("hex")]));
    this.unlisten = await this.db.listen("talju_push", (id) => void this.deliver(id));
    const pending = await this.db.asSystem(async (query) => {
      await query("delete from net.push_outbox where created_at < now() - make_interval(secs => $1)", [BACKLOG_MS / 1000]);
      return query<{ id: string }>("select id::text as id from net.push_outbox order by id");
    });
    for (const { id } of pending) await this.deliver(id);
  }

  // 쌓인 요청 하나를 꺼내(지우면서) 보낸다. 실패해도 다시 보내지 않는다 — 알림 하나 놓치는 것이 중복보다 낫다.
  async deliver(id: string): Promise<void> {
    try {
      if (!/^\d+$/.test(id)) return;
      const [row] = await this.db.asSystem((query) => query<{ body: unknown }>("delete from net.push_outbox where id = $1::bigint returning body", [id]));
      const payload = row && parse(row.body);
      if (!payload) return;
      const message = JSON.stringify(payload.notification);
      const gone: string[] = [];
      await Promise.all(payload.subscriptions.map(async (s) => {
        try {
          await this.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message);
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.endpoint); // 브라우저가 구독을 끊음
        }
      }));
      if (gone.length) await this.db.asSystem((query) => query("delete from public.push_subscriptions where endpoint = any($1::text[])", [gone]));
    } catch (error) {
      this.logger.warn(`웹 푸시 전송 실패: ${error instanceof Error ? error.message : error}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.unlisten?.();
  }
}

class PushSubscriptionDto {
  @IsString() @MaxLength(1000) endpoint!: string;
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}

class PushEndpointDto {
  @IsString() @MaxLength(1000) endpoint!: string;
}

// 이 브라우저의 구독을 내 계정에 저장·삭제(주소·키 검사는 DB 함수가 한다).
@Controller("me/push-subscriptions")
@UseGuards(AuthGuard)
export class PushController {
  constructor(private readonly db: Db) {}

  @Post()
  @HttpCode(204)
  async save(@UserId() userId: string, @Body() body: PushSubscriptionDto) {
    await this.db.asUser(userId, (query) => query("select public.save_push_subscription($1, $2, $3)", [body.endpoint, body.p256dh, body.auth]));
  }

  @Post("delete")
  @HttpCode(204)
  async remove(@UserId() userId: string, @Body() body: PushEndpointDto) {
    await this.db.asUser(userId, (query) => query("select public.delete_push_subscription($1)", [body.endpoint]));
  }
}
