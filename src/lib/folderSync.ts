// 로컬 폴더 ↔ 워크스페이스 양방향 동기화의 순수 규칙(React·네트워크 의존 없음).
// talju_hajima-main의 폴더 연동(FolderSync)과 같은 방식이다 — 텍스트 파일을 경로로 맞추고, 마지막으로 맞춘 내용(baseline)과
// 비교해 바뀐 쪽을 반대편에 반영한다. 양쪽이 모두 바뀌면 로컬 내용을 "새 분기"로 올려 어느 쪽도 덮어쓰지 않는다.
// 이 앱은 파일 내용을 서버가 한꺼번에 주지 않으므로(버전 단위로 내려받음) 서버 쪽 내용은 필요할 때만 불러온다.

export const MAX_FILE_SIZE = 10_000_000; // 10MB, 텍스트 파일 기준
const SKIP_NAMES = new Set(["node_modules", ".git", ".DS_Store", "__pycache__"]);

// 글자로 읽어 비교할 수 있는 파일만 다룬다(pdf·이미지·오피스 같은 바이너리를 글자로 읽어 망가뜨리지 않게).
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "xml", "yml", "yaml", "toml", "ini", "log", "html", "htm", "css", "scss", "less",
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "py", "java", "c", "h", "cpp", "hpp", "cc", "cs", "go", "rs", "rb", "php", "sh", "bat", "ps1",
  "sql", "kt", "swift", "vue", "svelte", "r", "lua", "dart", "gradle", "properties", "tex", "rtf",
]);
export function isTextFileName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot > 0 && TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export interface FolderReadResult {
  files: { path: string; content: string }[];
  skipped: string[];
}

export function isFolderSyncSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (opts: { mode: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  return picker({ mode: "readwrite" });
}

export async function hasReadWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const permissioned = handle as unknown as { queryPermission(opts: { mode: "readwrite" }): Promise<"granted" | "denied" | "prompt"> };
  if (typeof permissioned.queryPermission !== "function") return true;
  return (await permissioned.queryPermission({ mode: "readwrite" })) === "granted";
}

export async function readFolder(rootHandle: FileSystemDirectoryHandle): Promise<FolderReadResult> {
  const files: { path: string; content: string }[] = [];
  const skipped: string[] = [];
  await walk(rootHandle, "", files, skipped);
  return { files, skipped };
}

export async function writeFile(rootHandle: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const segments = path.split("/");
  const fileName = segments.pop();
  if (!fileName) return;
  let dir = rootHandle;
  for (const segment of segments) {
    dir = await (dir as unknown as { getDirectoryHandle(name: string, opts: { create: boolean }): Promise<FileSystemDirectoryHandle> }).getDirectoryHandle(segment, { create: true });
  }
  const fileHandle = await (dir as unknown as { getFileHandle(name: string, opts: { create: boolean }): Promise<FileSystemFileHandle> }).getFileHandle(fileName, { create: true });
  const writable = await (fileHandle as unknown as { createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> }).createWritable();
  await writable.write(content);
  await writable.close();
}

async function walk(dirHandle: FileSystemDirectoryHandle, prefix: string, files: { path: string; content: string }[], skipped: string[]): Promise<void> {
  const entries = (dirHandle as unknown as { entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]> }).entries();
  for await (const [name, handle] of entries) {
    if (name.startsWith(".") || SKIP_NAMES.has(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      await walk(handle as FileSystemDirectoryHandle, path, files, skipped);
      continue;
    }
    if (!isTextFileName(name)) continue; // 바이너리는 이 동기화 대상이 아니다(건너뛴 목록에도 넣지 않는다)
    // 에디터가 저장할 때 쓰는 "임시 파일에 쓰고 이름 바꾸기"는 그 순간 getFile()이 실패할 수 있다. 파일 하나를 이번 주기에 건너뛰는
    // 것으로 충분하니 여기서 잡아야 한다(밖으로 새면 동기화 전체가 멈추고 자동 동기화가 꺼진다).
    try {
      const file = await (handle as FileSystemFileHandle).getFile();
      if (file.size > MAX_FILE_SIZE) { skipped.push(path); continue; }
      files.push({ path, content: await file.text() });
    } catch {
      skipped.push(path);
    }
  }
}

// ── 비교 규칙 ──
export interface BaselineEntry { content: string; versionId: number | null }
// versionId = 워크스페이스에서 그 파일의 현재 버전. 내용은 필요할 때만 content()로 불러온다.
export interface ServerEntry { versionId: number | null; content: () => Promise<string> }
export interface PushItem { path: string; content: string; baseVersionId: number | null }
export interface PullItem { path: string; content: string; versionId: number | null }
export interface SyncPlan { push: PushItem[]; pull: PullItem[]; baseline: Map<string, BaselineEntry> }

// initial && !localFirst: 처음 연결하는 순간엔 겹치는 파일을 워크스페이스 내용으로 로컬에 맞춘다.
// localFirst("로컬 폴더 기준으로 동기화"): 겹치는 파일은 반대로 로컬 내용을 새 버전으로 올린다.
export async function planSync(args: {
  local: Map<string, string>;
  server: Map<string, ServerEntry>;
  baseline: Map<string, BaselineEntry>;
  inScope: (path: string) => boolean;
  initial: boolean;
  localFirst: boolean;
}): Promise<SyncPlan> {
  const { local, server, baseline, inScope, initial, localFirst } = args;
  const push: PushItem[] = [];
  const pull: PullItem[] = [];
  const next = new Map(baseline);
  const paths = new Set([...local.keys(), ...server.keys(), ...baseline.keys()]);

  for (const path of paths) {
    // 범위 밖은 올리지도 받지도 않는다(baseline도 그대로 둬서 범위를 다시 넓혔을 때 정상 비교).
    if (!inScope(path)) continue;
    const mine = local.get(path);
    const theirs = server.get(path);
    const base = baseline.get(path);

    if (mine === undefined) {
      if (base === undefined && theirs !== undefined) {
        const content = await theirs.content();
        pull.push({ path, content, versionId: theirs.versionId });
        next.set(path, { content, versionId: theirs.versionId });
      } else {
        next.delete(path); // 로컬에서 지웠거나 양쪽 모두 없다. 워크스페이스 파일은 지우지 않는다.
      }
      continue;
    }

    if (theirs === undefined) { push.push({ path, content: mine, baseVersionId: null }); continue; }

    if (base === undefined) {
      const content = await theirs.content();
      if (content === mine) next.set(path, { content, versionId: theirs.versionId });
      else if (initial && !localFirst) { pull.push({ path, content, versionId: theirs.versionId }); next.set(path, { content, versionId: theirs.versionId }); }
      else push.push({ path, content: mine, baseVersionId: theirs.versionId });
      continue;
    }

    const localChanged = mine !== base.content;
    // 서버가 바뀌었는지는 버전 번호로 본다(번호가 baseline보다 작으면 방금 올린 것이 아직 목록에 안 보이는 것이라 바뀐 게 아니다).
    const serverChanged = theirs.versionId !== null && base.versionId !== null && theirs.versionId > base.versionId;
    if (!localChanged && !serverChanged) continue;
    if (!localChanged) {
      const content = await theirs.content();
      pull.push({ path, content, versionId: theirs.versionId });
      next.set(path, { content, versionId: theirs.versionId });
      continue;
    }
    push.push({ path, content: mine, baseVersionId: base.versionId });
  }
  return { push, pull, baseline: next };
}
