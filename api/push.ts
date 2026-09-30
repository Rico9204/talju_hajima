import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";

// 웹 푸시 발송. DB 트리거(push_to_members, pg_net)가 받을 사람의 구독과 알림 내용을 보내 주면,
// 브라우저 푸시 서비스(FCM·Mozilla·Apple·Windows)로 암호화해 보낸다. DB와 이 함수만 아는 비밀값으로 확인한다.
// 필요한 환경변수: PUSH_WEBHOOK_SECRET, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:...),
//                 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY(더 이상 없는 구독 정리용)
// (api/majors.ts 주석대로 api/ 밖의 파일을 import하지 않는다.)
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;
const MAX_BODY_BYTES = 1_000_000;

type Subscription = { endpoint: string; p256dh: string; auth: string };
type Notice = { title: string; body: string; url: string; tag: string };

function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sameSecret(given: unknown, expected: string) {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parse(input: unknown): { subscriptions: Subscription[]; notification: Notice } | null {
  const body = input as { subscriptions?: unknown; notification?: Partial<Record<keyof Notice, unknown>> } | null;
  const n = body?.notification;
  if (!Array.isArray(body?.subscriptions) || !n || typeof n.title !== "string" || typeof n.url !== "string") return null;
  // 알림을 누르면 여는 주소는 우리 사이트 안(/로 시작)만.
  if (!n.url.startsWith("/") || n.url.startsWith("//")) return null;
  const subscriptions = body.subscriptions.filter((s): s is Subscription =>
    !!s && typeof s.endpoint === "string" && PUSH_HOST.test(s.endpoint) && typeof s.p256dh === "string" && typeof s.auth === "string");
  return {
    subscriptions,
    notification: { title: n.title.slice(0, 120), body: typeof n.body === "string" ? n.body.slice(0, 300) : "", url: n.url, tag: typeof n.tag === "string" ? n.tag.slice(0, 120) : "" },
  };
}

// 대시보드에 붙여 넣을 때 섞인 앞뒤 공백·줄바꿈 때문에 키가 달라지는 일이 흔해서 잘라 낸다.
const env = (name: string) => process.env[name]?.trim() || undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const secret = env("PUSH_WEBHOOK_SECRET");
  const publicKey = env("VITE_VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!secret || !publicKey || !privateKey) return reply(res, 500, { error: "push not configured" });
  if (req.method !== "POST") return reply(res, 405, { error: "method not allowed" });
  if (!sameSecret(req.headers["x-push-secret"], secret)) return reply(res, 401, { error: "unauthorized" });

  let payload;
  try { payload = parse(await readJson(req)); } catch { payload = null; }
  if (!payload) return reply(res, 400, { error: "bad request" });

  try {
    webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@example.com", publicKey, privateKey);
  } catch (error) {
    // 키·연락처 형식이 틀리면 여기서 멈춘다. 함수가 죽지 않고 원인을 남긴다(값은 기록하지 않음).
    console.error("웹 푸시 VAPID 설정 오류:", error instanceof Error ? error.message : error);
    return reply(res, 500, { error: "invalid VAPID config" });
  }
  const message = JSON.stringify(payload.notification);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(payload.subscriptions.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 24 * 60 * 60 });
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(s.endpoint); // 브라우저가 구독을 끊음
    }
  }));

  // 끊긴 구독 정리(실패해도 다음 발송 때 다시 시도된다).
  const supabaseUrl = env("VITE_SUPABASE_URL");
  const anonKey = env("VITE_SUPABASE_ANON_KEY");
  if (gone.length && supabaseUrl && anonKey) {
    await fetch(`${supabaseUrl}/rest/v1/rpc/prune_push_subscriptions`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_secret: secret, p_endpoints: gone }),
    }).catch(() => {});
  }
  reply(res, 200, { sent, gone: gone.length });
}
