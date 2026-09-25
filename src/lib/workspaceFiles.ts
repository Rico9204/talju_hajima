import type { FileVersion, WorkspaceFile } from "../api/types";

export const MAX_WORKSPACE_FILE_SIZE = 50 * 1024 * 1024;
export const WORKSPACE_BUCKET = "workspace-files";

export function parseFileTags(text: string): string[] {
  return [...new Set(text.split(",").map((tag) => tag.trim()).filter(Boolean))];
}
export function validateFileTags(tags: string[], image: boolean): void {
  if (image && !tags.length) throw new Error("이미지에는 태그를 하나 이상 입력해 주세요.");
  if (tags.length > 10 || tags.some((tag) => tag.length > 30)) throw new Error("태그는 최대 10개, 각각 30자까지 입력할 수 있습니다.");
}

export function workspaceStoragePath(projectId: string, userId: string, objectId: string): string {
  const encoded = Array.from(new TextEncoder().encode(projectId), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `v2/${encoded}/${userId}/${objectId}`;
}

export function workspaceFileType(name: string): WorkspaceFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "heic", "tif", "tiff", "ico"].includes(ext)) return "img";
  if (["ppt", "pptx", "odp"].includes(ext)) return "ppt";
  if (["xls", "xlsx", "xlsm", "csv", "ods"].includes(ext)) return "xls";
  if (["zip", "7z", "rar", "gz"].includes(ext)) return "zip";
  return ext === "pdf" ? "pdf" : "doc";
}

// Iterative traversal also handles legacy roots and orphaned parent references.
export function versionTree(versions: FileVersion[]): { version: FileVersion; depth: number }[] {
  const ids = new Set(versions.map((v) => v.id));
  const children = new Map<number | null, FileVersion[]>();
  for (const v of versions) {
    const parent = v.parentVersionId !== null && ids.has(v.parentVersionId) ? v.parentVersionId : null;
    children.set(parent, [...(children.get(parent) ?? []), v]);
  }
  for (const list of children.values()) list.sort((a, b) => a.id - b.id);
  const stack = (children.get(null) ?? []).map((version) => ({ version, depth: 0 })).reverse();
  const result: { version: FileVersion; depth: number }[] = [];
  const visited = new Set<number>();
  while (stack.length) {
    const item = stack.pop()!;
    if (visited.has(item.version.id)) continue;
    visited.add(item.version.id);
    result.push(item);
    for (const version of [...(children.get(item.version.id) ?? [])].reverse()) stack.push({ version, depth: item.depth + 1 });
  }
  for (const version of versions) if (!visited.has(version.id)) result.push({ version, depth: 0 });
  return result;
}

// Preserve date-only legacy records rather than inventing an upload time.
export function formatUploadTime(uploadedAt: string | null | undefined, date: string): string {
  if (!uploadedAt || Number.isNaN(Date.parse(uploadedAt))) return date;
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(uploadedAt));
  return parts;
}
// 가장 나중에 올린 버전(id가 가장 큰 버전).
function latestVersion(file: WorkspaceFile): FileVersion | undefined {
  return [...file.versions].sort((a, b) => b.id - a.id)[0];
}
export function latestFileUploadTime(file: WorkspaceFile): string {
  const latest = latestVersion(file);
  return latest ? formatUploadTime(latest.uploadedAt, latest.date) : formatUploadTime(file.createdAt, file.date);
}

export type FileSortOption = "latest" | "oldest" | "nameAsc" | "nameDesc" | "sizeDesc" | "sizeAsc";

// 목록에 보이는 날짜(latestFileUploadTime)와 같은 기준: 마지막 버전을 올린 시각. 시각이 없는 옛 기록은 날짜, 그것도 없으면 id.
function fileTimestamp(file: WorkspaceFile): number {
  const latest = latestVersion(file);
  for (const value of [latest?.uploadedAt, file.createdAt, latest?.date?.replace(/\.\s*/g, "-"), file.date?.replace(/\.\s*/g, "-")]) {
    const t = value ? Date.parse(value) : NaN;
    if (!Number.isNaN(t)) return t;
  }
  return file.id;
}

// 현재 버전 크기(바이트). 옛 기록처럼 byteSize가 없으면 표시용 크기 문자열("1.2 MB")을 바이트로 되돌린다.
function fileByteSize(file: WorkspaceFile): number {
  const current = file.versions.find((v) => v.current) ?? file.versions[0];
  if (current?.byteSize != null) return current.byteSize;
  const match = file.size.match(/^([\d.]+)\s*(B|KB|MB|GB)?$/i);
  if (!match) return 0;
  const unit = { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024 }[(match[2] ?? "").toUpperCase()] ?? 1;
  return parseFloat(match[1]) * unit;
}

const byName = (a: WorkspaceFile, b: WorkspaceFile) => a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" });

export function sortWorkspaceFiles(items: WorkspaceFile[], sortBy: FileSortOption): WorkspaceFile[] {
  const compare: Record<FileSortOption, (a: WorkspaceFile, b: WorkspaceFile) => number> = {
    latest: (a, b) => fileTimestamp(b) - fileTimestamp(a) || b.id - a.id,
    oldest: (a, b) => fileTimestamp(a) - fileTimestamp(b) || a.id - b.id,
    nameAsc: byName,
    nameDesc: (a, b) => byName(b, a),
    sizeDesc: (a, b) => fileByteSize(b) - fileByteSize(a) || b.id - a.id,
    sizeAsc: (a, b) => fileByteSize(a) - fileByteSize(b) || a.id - b.id,
  };
  return [...items].sort(compare[sortBy]);
}

// 바로 수정(동시 편집)이 가능한 텍스트 파일 — 원본 텍스트를 그대로 다루고 크기 제한을 둔다.
export const EDITABLE_TEXT_EXTENSIONS = ["txt", "md", "csv", "json", "log", "xml", "yaml", "yml"];
export const MAX_EDITABLE_BYTES = 200_000;
export function isEditableTextFile(name: string, byteSize: number | null): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EDITABLE_TEXT_EXTENSIONS.includes(ext) && (byteSize ?? 0) <= MAX_EDITABLE_BYTES;
}
