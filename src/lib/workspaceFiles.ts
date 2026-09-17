import type { FileVersion, WorkspaceFile } from "../api/types";

export const MAX_WORKSPACE_FILE_SIZE = 50 * 1024 * 1024;
export const WORKSPACE_BUCKET = "workspace-files";

export function workspaceStoragePath(projectId: string, userId: string, objectId: string): string {
  const encoded = Array.from(new TextEncoder().encode(projectId), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `v2/${encoded}/${userId}/${objectId}`;
}

export function workspaceFileType(name: string): WorkspaceFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "heic"].includes(ext)) return "img";
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
