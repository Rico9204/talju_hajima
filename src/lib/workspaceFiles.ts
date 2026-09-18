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
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "xls";
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
export function latestFileUploadTime(file: WorkspaceFile): string {
  const latest = [...file.versions].sort((a, b) => b.id - a.id)[0];
  return latest ? formatUploadTime(latest.uploadedAt, latest.date) : formatUploadTime(file.createdAt, file.date);
}
