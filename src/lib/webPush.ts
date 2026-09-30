import { dataRepository } from "../api";

// 웹 푸시: 브라우저(사이트 탭)를 닫아도 새 과제·일정·파일·채팅 알림을 받는다.
// 서비스 워커(public/sw.js)가 푸시를 받아 알림을 띄우고, 구독은 내 계정에 저장해 서버(DB 트리거 → /api/push)가 보낸다.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim(); // 붙여 넣으며 섞인 공백·줄바꿈 제거
let active = false;

export function isPushSupported(): boolean {
  return !!VAPID_PUBLIC_KEY && typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window;
}

// 푸시가 켜져 있으면 탭이 열려 있을 때의 알림(notifyIfAway)은 띄우지 않는다 — 같은 알림이 두 번 뜨지 않게.
export function isPushActive(): boolean {
  return active;
}

function keyBytes(base64url: string): Uint8Array {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const bytes = new Uint8Array(a);
  return bytes.every((value, i) => value === b[i]);
}

// 이 브라우저에서 알림을 직접 켠 계정. 공용 컴퓨터에서 다음 사람이 켠 적 없이 자동 구독되지 않도록,
// 로그인 때의 자동 구독(syncPush)은 켠 본인일 때만 한다.
const OWNER_KEY = "collabpeer.push-owner";
function pushOwner(): string | null {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
function setPushOwner(userId: string | null) {
  try { if (userId) localStorage.setItem(OWNER_KEY, userId); else localStorage.removeItem(OWNER_KEY); } catch { /* 저장소를 못 쓰면 자동 구독만 안 된다 */ }
}

// 로그인할 때: 이 브라우저에서 알림을 켠 사람이 나일 때만 구독을 다시 맞춘다(로그아웃 때 지워지므로).
export async function syncPush(userId: string): Promise<boolean> {
  return pushOwner() === userId ? enablePush(userId) : false;
}

// 설정에서 알림을 켤 때(권한 허용 뒤). 이 브라우저를 구독하고 내 계정에 저장한다.
export async function enablePush(userId: string): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  setPushOwner(userId);
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const key = keyBytes(VAPID_PUBLIC_KEY!);
  let subscription = await registration.pushManager.getSubscription();
  // 서버 키가 바뀌었으면 예전 구독으로는 받을 수 없으니 새로 만든다.
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) return false;
  await dataRepository.savePushSubscription({ endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
  active = true;
  return true;
}

// 알림을 끌 때(forget=true)·로그아웃할 때: 이 브라우저의 구독을 계정에서 지우고 해지한다(다음 사람이 알림을 받지 않게).
// 로그아웃은 "켠 사람" 기록을 남겨 두어, 같은 사람이 다시 로그인하면 자동으로 다시 구독된다.
export async function disablePush({ forget = false } = {}): Promise<void> {
  active = false;
  if (forget) setPushOwner(null);
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await dataRepository.deletePushSubscription(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}
