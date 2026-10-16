import type { AdminDocType } from "../api/types";

export const ADMIN_DOC_TYPES: { value: AdminDocType; label: string }[] = [
  { value: "employment", label: "재직증명서" },
  { value: "faculty_id", label: "교원증 사본" },
  { value: "appointment", label: "임용(발령) 통지서" },
  { value: "other", label: "기타 직위 증명서" },
];
export const MAX_ADMIN_DOC_SIZE = 10 * 1024 * 1024;
export const ADMIN_REAPPLY_HOURS = 24;
export const ADMIN_VERIFICATION_BUCKET = "admin-verification";

export function adminDocTypeLabel(value: string): string {
  return ADMIN_DOC_TYPES.find((t) => t.value === value)?.label ?? "기타";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 브라우저에서 먼저 걸러 준다. 서버(스토리지 설정과 제출 함수)가 같은 조건을 한 번 더 확인한다.
export function validateAdminDocument(file: File | null): string | null {
  if (!file) return "증명서 PDF를 선택해 주세요.";
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) return "PDF 파일만 제출할 수 있습니다.";
  if (file.size <= 0) return "빈 파일은 제출할 수 없습니다.";
  if (file.size > MAX_ADMIN_DOC_SIZE) return "증명서는 10MB 이하의 PDF여야 합니다.";
  return null;
}

// 확장자만 PDF로 바꾼 파일을 거른다(파일 맨 앞이 %PDF- 인지 확인).
export async function hasPdfSignature(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === "%PDF-";
}

// 반려된 뒤 다시 신청할 수 있는 시각. 반려 기록이 아니면 null.
export function reapplyAvailableAt(status: string, reviewedAt: string | null): Date | null {
  if (status !== "rejected" || !reviewedAt) return null;
  return new Date(new Date(reviewedAt).getTime() + ADMIN_REAPPLY_HOURS * 60 * 60 * 1000);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 관리자 신청서 화면을 가입 직후 한 번만 자동으로 열어 주기 위한 표시(브라우저에 저장, 없어도 동작한다).
export const adminApplicationSeenKey = (userId: string) => `adminApplicationSeen:${userId}`;

// 이메일 인증을 끄고 운영하면 Supabase가 이메일을 자동으로 "인증됨" 처리해서, 이 표시는 실제 확인을 뜻하지 않는다.
// 이메일 인증을 켜고 운영한다면 true로 바꿔 운영자 화면에 인증 여부를 보여준다.
export const SHOW_EMAIL_VERIFICATION_BADGE = false;

