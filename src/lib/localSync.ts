import type { FileUploadInput, Folder, WorkspaceFile } from "../api/types";

// 내 컴퓨터 폴더와 워크스페이스를 잇는 "로컬 동기화". 브라우저의 File System Access API(크롬·엣지 PC)를 쓴다.
// 방향을 하나로 정한 연결 두 가지만 둔다(예전 양방향 폴더 연동은 두 쪽이 서로 덮어쓰는 일이 있었다):
//  - 올리기(upload): 로컬 폴더 → 워크스페이스 폴더. 안의 파일·하위 폴더를 전부 올리고, 켜 두면 몇 초마다 바뀐 파일만
//    새 버전으로 올린다. 로컬에서 지운 파일은 워크스페이스에서 지우지 않는다(실수로 지운 것이 팀 전체에서 사라지지 않게).
//  - 내려받기(download): 고른 워크스페이스 파일 → 로컬 폴더. 워크스페이스에 새 버전이 생기면 다시 받는다. 로컬에서 고친 파일은
//    덮어쓰지 않고 "충돌"로 알린다.
// 연결(폴더 권한 포함)은 이 브라우저의 IndexedDB에 저장해 새로 고침해도 남는다. 다시 열면 브라우저가 권한을 한 번 묻는다.

export const MAX_SYNC_FILE_BYTES = 50 * 1024 * 1024; // 워크스페이스 업로드 한도와 같다
export const SYNC_TAG = "로컬 동기화"; // 이미지는 태그가 하나 이상 있어야 올라간다
// 연결된 워크스페이스 파일이 목록에 없을 때, 이만큼 계속 없어야 지워진 것으로 본다(새로 고침 직후 목록을 아직 못 받은 때와 구분).
export const MISSING_GRACE_MS = 2 * 60 * 1000;

// TypeScript 기본 DOM 타입에 아직 없는 부분(크롬의 File System Access API).
type PermissionMode = { mode: "read" | "readwrite" };
export interface DirHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, DirHandle | FileHandle]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  queryPermission?(options: PermissionMode): Promise<PermissionState>;
  requestPermission?(options: PermissionMode): Promise<PermissionState>;
  isSameEntry?(other: DirHandle): Promise<boolean>;
}
export interface FileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

export function isLocalSyncSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickDirectory(): Promise<DirHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (options: { mode: "readwrite"; id?: string }) => Promise<DirHandle> }).showDirectoryPicker;
  return picker({ mode: "readwrite", id: "talju-sync" });
}

// 권한: 저장해 둔 연결은 새로 고침 뒤 "prompt" 상태라, 사용자가 버튼을 눌렀을 때(ask) 다시 묻는다.
export async function hasPermission(handle: DirHandle, ask: boolean): Promise<boolean> {
  const mode: PermissionMode = { mode: "readwrite" };
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission(mode)) === "granted") return true;
  return ask && !!handle.requestPermission && (await handle.requestPermission(mode)) === "granted";
}

export interface SyncResult {
  at: string; // 끝난 시각(ISO)
  uploaded: number; // 새로 올린 파일
  updated: number; // 새 버전으로 올린(또는 다시 받은) 파일
  downloaded: number;
  unchanged: number;
  removedLocally: number; // 로컬에서 지워져 연결만 끊은 파일(워크스페이스엔 남김)
  conflicts: string[]; // 덮어쓰지 않고 건너뛴 파일
  errors: string[];
}
const emptyResult = (): SyncResult => ({ at: "", uploaded: 0, updated: 0, downloaded: 0, unchanged: 0, removedLocally: 0, conflicts: [], errors: [] });

interface LinkBase { id: string; projectId: string; userId: string; handle: DirHandle; dirName: string; auto: boolean; last?: SyncResult; checkedAt?: string } // last = 마지막으로 무언가 바뀐(또는 오류가 난) 동기화, checkedAt = 마지막으로 살펴본 시각
export interface UploadLink extends LinkBase {
  kind: "upload";
  targetFolderId: number | null; // null = 워크스페이스 루트
  // 로컬 경로("하위/파일.pdf") → 올린 워크스페이스 파일과 그때의 크기·수정 시각·내용 해시
  // fileId 0 = 워크스페이스에서 지운 파일(로컬에서 다시 고치기 전까지 올리지 않는다). missingSince = 목록에서 처음 안 보인 시각.
  entries: Record<string, { fileId: number; size: number; lastModified: number; hash: string; missingSince?: number }>;
  folders: Record<string, number>; // 로컬 하위 폴더 경로 → 워크스페이스 폴더 id
}
export interface DownloadLink extends LinkBase {
  kind: "download";
  fileIds: number[];
  // 워크스페이스 파일 id → 로컬에 쓴 이름과 그때의 버전·수정 시각
  entries: Record<number, { name: string; versionId: number; lastModified: number; missingSince?: number }>;
}
export type SyncLink = UploadLink | DownloadLink;

// ── 연결 저장(IndexedDB) ──
const DB_NAME = "talju-local-sync";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("links", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction("links", mode).objectStore("links"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function loadLinks(projectId: string, userId: string): Promise<SyncLink[]> {
  const all = await withStore<SyncLink[]>("readonly", (store) => store.getAll() as IDBRequest<SyncLink[]>);
  return all.filter((link) => link.projectId === projectId && link.userId === userId);
}
export const saveLink = (link: SyncLink) => withStore("readwrite", (store) => store.put(link));
export const deleteLink = (id: string) => withStore("readwrite", (store) => store.delete(id));
export const newLinkId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── 공통 ──
// 숨김 파일(.git, .DS_Store 등)·node_modules·오피스 잠금 파일·내려받는 중인 임시 파일은 올리지 않는다.
export function isJunkName(name: string): boolean {
  return name.startsWith(".") || name.startsWith("~$") || name === "node_modules" || name === "__pycache__"
    || /^(thumbs\.db|desktop\.ini)$/i.test(name) || /\.(tmp|temp|crdownload|part|swp)$/i.test(name);
}

async function sha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// 같은 연결을 여러 탭이 동시에 돌리지 않게(같은 파일을 두 번 올리는 것을 막는다). 다른 탭이 돌리는 중이면 건너뛴다.
async function exclusive<T>(name: string, run: () => Promise<T>): Promise<T | null> {
  const locks = (navigator as Navigator & { locks?: { request: (n: string, o: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<T | null>) => Promise<T | null> } }).locks;
  if (!locks) return run();
  return locks.request(`talju-sync-${name}`, { ifAvailable: true }, async (lock) => (lock ? run() : null));
}

const currentVersion = (f: WorkspaceFile) => f.versions.find((v) => v.current) ?? f.versions[0];

// ── 올리기: 로컬 폴더 → 워크스페이스 ──
export interface UploadDeps {
  files: WorkspaceFile[];
  folders: Folder[];
  upload: (input: FileUploadInput) => Promise<{ fileId: number; versionId: number }>;
  createFolder: (name: string, parentId: number | null) => Promise<Folder>;
  onProgress?: (text: string) => void;
}

async function* walk(dir: DirHandle, prefix: string[]): AsyncGenerator<{ parts: string[]; handle: FileHandle }> {
  const children: [string, DirHandle | FileHandle][] = [];
  for await (const entry of dir.entries()) children.push(entry);
  children.sort(([a], [b]) => a.localeCompare(b));
  for (const [name, handle] of children) {
    if (isJunkName(name)) continue;
    if (handle.kind === "directory") yield* walk(handle, [...prefix, name]);
    else yield { parts: [...prefix, name], handle };
  }
}

function depthOf(folders: Folder[], id: number | null): number {
  let depth = 0;
  for (let cur = id; cur !== null && depth < 20; depth++) cur = folders.find((f) => f.id === cur)?.parentId ?? null;
  return depth;
}

export async function runUploadLink(link: UploadLink, deps: UploadDeps): Promise<UploadLink | null> {
  return exclusive(link.id, async () => {
    const result = emptyResult();
    const entries = { ...link.entries };
    const folderMap = { ...link.folders };
    const folders = [...deps.folders];
    const seen = new Set<string>();
    const baseDepth = depthOf(folders, link.targetFolderId);
    const fileById = new Map(deps.files.map((f) => [f.id, f]));

    // 로컬 하위 폴더 경로에 맞는 워크스페이스 폴더(없으면 같은 이름의 폴더를 찾거나 만든다).
    async function folderFor(dirParts: string[]): Promise<number | null> {
      let parent = link.targetFolderId;
      for (let i = 0; i < dirParts.length; i++) {
        const key = dirParts.slice(0, i + 1).join("/");
        const known = folderMap[key];
        if (known !== undefined && folders.some((f) => f.id === known && f.parentId === parent)) { parent = known; continue; }
        const same = folders.find((f) => f.parentId === parent && f.name === dirParts[i]);
        const folder = same ?? await deps.createFolder(dirParts[i], parent);
        if (!same) folders.push(folder);
        folderMap[key] = folder.id;
        parent = folder.id;
      }
      return parent;
    }

    for await (const { parts, handle } of walk(link.handle, [])) {
      const path = parts.join("/");
      seen.add(path);
      try {
        if (baseDepth + parts.length - 1 > 10) { result.errors.push(`${path}: 폴더가 너무 깊어요(워크스페이스는 10단계까지)`); continue; }
        const local = await handle.getFile();
        if (local.size > MAX_SYNC_FILE_BYTES) { result.errors.push(`${path}: 50MB를 넘어 올리지 않았어요`); continue; }
        const rec = entries[path];
        const mapped = rec ? fileById.get(rec.fileId) : undefined;
        const sameAsBefore = !!rec && rec.size === local.size && rec.lastModified === local.lastModified;
        if (rec && rec.fileId !== 0 && !mapped && sameAsBefore) {
          // 올렸던 파일이 목록에 없다: 잠깐(목록을 아직 못 받음)이면 기다리고, 계속 없으면 팀원이 지운 것으로 보고 다시 올리지 않는다.
          const since = rec.missingSince ?? Date.now();
          entries[path] = Date.now() - since > MISSING_GRACE_MS ? { ...rec, fileId: 0, missingSince: undefined } : { ...rec, missingSince: since };
          result.unchanged++;
          continue;
        }
        if (rec && rec.fileId === 0 && sameAsBefore) { result.unchanged++; continue; } // 워크스페이스에서 지운 파일(로컬에서 고치면 다시 올림)
        if (rec && mapped && sameAsBefore) { if (rec.missingSince) entries[path] = { ...rec, missingSince: undefined }; result.unchanged++; continue; }
        deps.onProgress?.(`${path} 확인 중…`);
        const hash = await sha256(local);
        if (rec && mapped && rec.hash === hash) { entries[path] = { ...rec, size: local.size, lastModified: local.lastModified }; result.unchanged++; continue; }
        const folderId = await folderFor(parts.slice(0, -1));
        // 처음 보는 파일인데 같은 폴더에 같은 이름의 워크스페이스 파일이 있으면 그 파일의 새 버전으로 올린다(중복 파일을 만들지 않게).
        const target = mapped ?? deps.files.find((f) => f.folderId === folderId && f.name === local.name);
        if (target && !mapped && currentVersion(target)?.byteSize === local.size) {
          entries[path] = { fileId: target.id, size: local.size, lastModified: local.lastModified, hash };
          result.unchanged++;
          continue;
        }
        deps.onProgress?.(`${path} 올리는 중…`);
        const uploaded = await deps.upload(target
          ? { file: local, fileId: target.id, folderId: target.folderId, baseVersionId: currentVersion(target)?.id ?? null, note: "로컬 폴더 동기화(바뀐 파일)", tags: target.tags }
          : { file: local, folderId, note: "로컬 폴더 동기화", tags: [SYNC_TAG] });
        entries[path] = { fileId: uploaded.fileId, size: local.size, lastModified: local.lastModified, hash };
        if (target) result.updated++; else result.uploaded++;
      } catch (e) {
        result.errors.push(`${path}: ${e instanceof Error ? e.message : "올리지 못했어요"}`);
      }
    }
    for (const path of Object.keys(entries)) {
      if (!seen.has(path)) { delete entries[path]; result.removedLocally++; }
    }
    result.at = new Date().toISOString();
    return { ...link, entries, folders: folderMap, last: result };
  });
}

// ── 내려받기: 고른 워크스페이스 파일 → 로컬 폴더 ──
export interface DownloadDeps {
  files: WorkspaceFile[];
  load: (versionId: number) => Promise<Blob>;
  force?: boolean; // 로컬에서 고친 파일·같은 이름의 다른 파일도 덮어쓴다
  onProgress?: (text: string) => void;
}

async function existingFile(dir: DirHandle, name: string): Promise<File | null> {
  try { return await (await dir.getFileHandle(name)).getFile(); } catch { return null; }
}

export async function runDownloadLink(link: DownloadLink, deps: DownloadDeps): Promise<DownloadLink | null> {
  return exclusive(link.id, async () => {
    const result = emptyResult();
    const entries = { ...link.entries };
    const fileIds: number[] = [];
    const taken = new Set(Object.entries(entries).filter(([id]) => link.fileIds.includes(Number(id))).map(([, e]) => e.name));
    for (const id of link.fileIds) {
      const f = deps.files.find((x) => x.id === id);
      const rec = entries[id];
      if (!f) {
        // 잠깐 안 보이는 것(새로 고침 직후)일 수 있어 한동안 기다린 뒤에만 연결을 끊는다.
        const since = rec?.missingSince ?? Date.now();
        if (Date.now() - since > MISSING_GRACE_MS) { result.errors.push(`${rec?.name ?? `파일 ${id}`}: 워크스페이스에서 지워져 연결을 끊었어요(로컬 파일은 남겨 둠)`); delete entries[id]; continue; }
        fileIds.push(id);
        if (rec) entries[id] = { ...rec, missingSince: since };
        continue;
      }
      fileIds.push(id);
      if (rec?.missingSince) entries[id] = { ...rec, missingSince: undefined };
      const version = currentVersion(f);
      if (!version) continue;
      // 이름: 처음 받을 때 정하고 계속 쓴다. 서로 다른 파일의 이름이 같으면 "(파일 번호)"를 붙인다.
      let name = rec?.name;
      if (!name) {
        name = f.name;
        if (taken.has(name)) { const dot = name.lastIndexOf("."); name = dot > 0 ? `${name.slice(0, dot)} (${f.id})${name.slice(dot)}` : `${name} (${f.id})`; }
        taken.add(name);
      }
      try {
        const local = await existingFile(link.handle, name);
        if (rec && local && rec.versionId === version.id && rec.lastModified === local.lastModified) { result.unchanged++; continue; }
        const editedLocally = rec ? !!local && local.lastModified !== rec.lastModified : !!local;
        if (editedLocally && !deps.force) {
          result.conflicts.push(name);
          if (rec) entries[id] = rec;
          continue;
        }
        deps.onProgress?.(`${name} 받는 중…`);
        const blob = await deps.load(version.id);
        const handle = await link.handle.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        const written = await handle.getFile();
        entries[id] = { name, versionId: version.id, lastModified: written.lastModified };
        if (rec) result.updated++; else result.downloaded++;
      } catch (e) {
        result.errors.push(`${name}: ${e instanceof Error ? e.message : "받지 못했어요"}`);
      }
    }
    result.at = new Date().toISOString();
    return { ...link, fileIds, entries, last: result };
  });
}

export function describeResult(result: SyncResult | undefined): string {
  if (!result) return "아직 동기화하지 않았어요";
  const time = new Date(result.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts = [
    result.uploaded && `새로 올림 ${result.uploaded}`, result.downloaded && `받음 ${result.downloaded}`, result.updated && `새 버전 ${result.updated}`,
    result.unchanged && `그대로 ${result.unchanged}`, result.removedLocally && `로컬에서 지움 ${result.removedLocally}(워크스페이스엔 남김)`,
    result.conflicts.length && `충돌 ${result.conflicts.length}`, result.errors.length && `오류 ${result.errors.length}`,
  ].filter(Boolean);
  return `${time} · ${parts.join(" · ") || "변경 없음"}`;
}
