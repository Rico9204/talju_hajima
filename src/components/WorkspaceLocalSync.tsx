import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { FileUploadInput, Folder, WorkspaceFile } from "../api/types";
import {
  deleteLink, describeResult, hasPermission, isLocalSyncSupported, loadLinks, newLinkId, pickDirectory, runDownloadLink, runUploadLink, saveLink,
  type DirHandle, type DownloadLink, type FileHandle, type SyncLink, type UploadLink,
} from "../lib/localSync";

const AUTO_UPLOAD_MS = 5000; // 로컬 폴더를 이만큼마다 살펴 바뀐 파일만 올린다(크기·수정 시각이 같으면 파일을 읽지 않는다)
const AUTO_DOWNLOAD_MS = 30000; // 워크스페이스 변경은 실시간으로도 오지만, 놓친 것을 위해 가끔 다시 본다

export interface LocalSyncHandle {
  addDownload: (fileIds: number[]) => void; // 반드시 클릭 처리 안에서 바로 부른다(폴더 고르기 창은 사용자 동작이 있어야 열린다)
}

type LinkState = { running: boolean; progress: string; needsPermission: boolean };
const IDLE: LinkState = { running: false, progress: "", needsPermission: false };

// 워크스페이스 화면의 "내 컴퓨터 폴더와 동기화" 영역. 동기화 규칙은 lib/localSync.ts.
export default function WorkspaceLocalSync({ ref, projectId, userId, locked, ready, files, folders, currentFolderId, folderLabel, upload, createFolder, load }: {
  ref?: Ref<LocalSyncHandle>;
  projectId: string;
  userId: string;
  locked: boolean;
  ready: boolean; // 프로젝트 파일·폴더 목록을 다 받았는지(받기 전에 돌리면 모든 파일을 새것으로 착각한다)
  files: WorkspaceFile[];
  folders: Folder[];
  currentFolderId: number | null;
  folderLabel: (id: number | null) => string;
  upload: (input: FileUploadInput) => Promise<{ fileId: number; versionId: number }>;
  createFolder: (name: string, parentId: number | null) => Promise<Folder>;
  load: (versionId: number) => Promise<Blob>;
}) {
  const supported = isLocalSyncSupported();
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<SyncLink[]>([]);
  const [states, setStates] = useState<Record<string, LinkState>>({});
  const [error, setError] = useState("");
  const [oneShot, setOneShot] = useState(""); // 지원하지 않는 브라우저의 "폴더 한 번 올리기" 진행·결과
  const latest = useRef({ files, folders, upload, createFolder, load, locked, ready });
  latest.current = { files, folders, upload, createFolder, load, locked, ready };
  const linksRef = useRef<SyncLink[]>([]);
  linksRef.current = links;
  const running = useRef(new Set<string>());
  const statesRef = useRef(states);
  statesRef.current = states;
  const folderInput = useRef<HTMLInputElement>(null);

  const patchState = (id: string, patch: Partial<LinkState>) =>
    setStates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? IDLE), ...patch } }));
  const errorText = (e: unknown, fallback: string) => (e instanceof DOMException && e.name === "AbortError" ? "" : e instanceof Error ? e.message : fallback);

  // 이 프로젝트에 저장해 둔 연결을 불러온다. 새로 고침 뒤에는 권한을 다시 받아야 하는 경우가 많다.
  useEffect(() => {
    let alive = true;
    setLinks([]); setStates({});
    if (!supported) return;
    void loadLinks(projectId, userId).then(async (saved) => {
      if (!alive) return;
      setLinks(saved);
      if (saved.length) setOpen(true);
      for (const link of saved) patchState(link.id, { needsPermission: !(await hasPermission(link.handle, false)) });
    }).catch(() => setError("저장해 둔 동기화 연결을 불러오지 못했어요."));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]);

  async function store(link: SyncLink) {
    setLinks((prev) => (prev.some((l) => l.id === link.id) ? prev.map((l) => (l.id === link.id ? link : l)) : [...prev, link]));
    await saveLink(link).catch(() => setError("동기화 연결을 저장하지 못했어요. 새로 고침하면 다시 연결해야 해요."));
  }

  async function run(id: string, options: { ask?: boolean; force?: boolean } = {}) {
    const link = linksRef.current.find((l) => l.id === id);
    if (!link || running.current.has(id)) return;
    const { files: nowFiles, folders: nowFolders, locked: isLocked, ready: isReady } = latest.current;
    if (!isReady) { patchState(id, { progress: "프로젝트 파일 목록을 불러오는 중이에요. 잠시 뒤에 동기화해요." }); return; }
    if (link.kind === "upload" && isLocked) return;
    if (link.kind === "upload" && link.targetFolderId !== null && !nowFolders.some((f) => f.id === link.targetFolderId)) {
      patchState(id, { progress: "올릴 워크스페이스 폴더가 지워졌어요. 연결을 끊고 다시 만들어 주세요." });
      return;
    }
    if (!(await hasPermission(link.handle, !!options.ask))) { patchState(id, { needsPermission: true }); return; }
    running.current.add(id);
    patchState(id, { running: true, needsPermission: false, progress: "" });
    try {
      const onProgress = (text: string) => patchState(id, { progress: text });
      const next = link.kind === "upload"
        ? await runUploadLink(link, { files: nowFiles, folders: nowFolders, upload: latest.current.upload, createFolder: latest.current.createFolder, onProgress })
        : await runDownloadLink(link, { files: nowFiles, load: latest.current.load, force: options.force, onProgress });
      // 아무것도 바뀌지 않은 확인은 마지막 결과(무엇을 올리고 받았는지)를 지우지 않고 확인 시각만 남긴다.
      const r = next?.last;
      const quiet = !!r && !r.uploaded && !r.updated && !r.downloaded && !r.removedLocally && !r.conflicts.length && !r.errors.length;
      if (next) await store(quiet && link.last ? { ...next, last: link.last, checkedAt: r.at } : { ...next, checkedAt: r?.at });
    } catch (e) {
      patchState(id, { progress: errorText(e, "동기화하지 못했어요.") || "" });
    } finally {
      running.current.delete(id);
      // "…중" 진행 문구는 지우고(결과 요약이 보이게), 오류 문구는 남긴다.
      setStates((prev) => { const cur = prev[id] ?? IDLE; return { ...prev, [id]: { ...cur, running: false, progress: cur.progress.endsWith("…") ? "" : cur.progress } }; });
    }
  }

  // 로컬 폴더 → 지금 보고 있는 워크스페이스 폴더(자동 올리기)
  async function addUpload() {
    setError("");
    try {
      const handle = await pickDirectory();
      const link: UploadLink = { id: newLinkId(), kind: "upload", projectId, userId, handle, dirName: handle.name, auto: true, targetFolderId: currentFolderId, entries: {}, folders: {} };
      await store(link);
      linksRef.current = [...linksRef.current, link];
      void run(link.id);
    } catch (e) { setError(errorText(e, "로컬 폴더를 연결하지 못했어요.")); }
  }

  // 고른 워크스페이스 파일 → 로컬 폴더. 같은 로컬 폴더에 이미 받기 연결이 있으면 파일만 더한다.
  async function addDownload(fileIds: number[]) {
    setError("");
    setOpen(true);
    if (!supported) { void downloadOnce(fileIds); return; }
    try {
      const handle = await pickDirectory();
      let existing: DownloadLink | undefined;
      for (const l of linksRef.current) if (l.kind === "download" && (await l.handle.isSameEntry?.(handle))) existing = l;
      const link: DownloadLink = existing
        ? { ...existing, handle, fileIds: [...new Set([...existing.fileIds, ...fileIds])] }
        : { id: newLinkId(), kind: "download", projectId, userId, handle, dirName: handle.name, auto: true, fileIds, entries: {} };
      await store(link);
      linksRef.current = existing ? linksRef.current.map((l) => (l.id === link.id ? link : l)) : [...linksRef.current, link];
      void run(link.id);
    } catch (e) { setError(errorText(e, "로컬 폴더를 고르지 못했어요.")); }
  }
  useImperativeHandle(ref, () => ({ addDownload: (ids) => void addDownload(ids) }));

  async function unlink(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    await deleteLink(id).catch(() => {});
  }
  async function toggleAuto(link: SyncLink) { await store({ ...link, auto: !link.auto }); }

  // 자동 동기화: 올리기는 몇 초마다, 받기는 워크스페이스 파일이 바뀔 때와 가끔.
  useEffect(() => {
    if (!supported) return;
    const tick = (kind: SyncLink["kind"]) => () => {
      for (const l of linksRef.current) if (l.kind === kind && l.auto && !statesRef.current[l.id]?.needsPermission) void run(l.id);
    };
    const up = window.setInterval(tick("upload"), AUTO_UPLOAD_MS);
    const down = window.setInterval(tick("download"), AUTO_DOWNLOAD_MS);
    return () => { window.clearInterval(up); window.clearInterval(down); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);
  const versionsKey = files.map((f) => `${f.id}:${f.versions.find((v) => v.current)?.id ?? 0}`).join(",");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const l of linksRef.current) if (l.kind === "download" && l.auto && !statesRef.current[l.id]?.needsPermission) void run(l.id);
    }, 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionsKey]);

  // ── 지원하지 않는 브라우저(사파리·파이어폭스·휴대폰): 한 번씩만 ──
  async function uploadFolderOnce(list: FileList) {
    const byPath = new Map<string, File>();
    for (const file of Array.from(list)) byPath.set(file.webkitRelativePath.split("/").slice(1).join("/") || file.name, file);
    const root = memoryDir(list[0]?.webkitRelativePath.split("/")[0] || "폴더", byPath);
    const temp: UploadLink = { id: newLinkId(), kind: "upload", projectId, userId, handle: root, dirName: root.name, auto: false, targetFolderId: currentFolderId, entries: {}, folders: {} };
    setOneShot("올리는 중…");
    const done = await runUploadLink(temp, { ...latest.current, onProgress: (text) => setOneShot(text) });
    setOneShot(`“${root.name}” 폴더 · ${describeResult(done?.last)}${done?.last?.errors.length ? ` — ${done.last.errors.slice(0, 3).join(", ")}` : ""}`);
  }
  async function downloadOnce(fileIds: number[]) {
    for (const id of fileIds) {
      const f = latest.current.files.find((x) => x.id === id);
      const version = f?.versions.find((v) => v.current);
      if (!f || !version) continue;
      const url = URL.createObjectURL(await latest.current.load(version.id));
      const a = document.createElement("a");
      a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setOneShot(`파일 ${fileIds.length}개를 내려받았어요. 이 브라우저는 폴더 동기화를 지원하지 않아 한 번만 받아요(크롬·엣지 PC에서는 자동으로 다시 받아요).`);
  }

  const pill = "text-xs font-700 px-3 py-1.5 disabled:opacity-50";
  const pillStyle = { background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" };
  return (
    <div className="mb-4 border" style={{ background: "var(--card-glass)", borderColor: "var(--border)", borderRadius: "var(--radius)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="text-sm font-700">💻 내 컴퓨터 폴더와 동기화{links.length > 0 && <span className="ml-2 text-xs font-600" style={{ color: "var(--muted-foreground)" }}>연결 {links.length}개</span>}</span>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{open ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-xs" style={{ color: "var(--foreground)" }}>
          {!supported ? (
            <p className="mb-3" style={{ color: "var(--muted-foreground)" }}>
              이 브라우저는 폴더 자동 동기화를 지원하지 않아요(크롬·엣지 PC에서 쓸 수 있어요). 여기서는 폴더를 한 번에 올리거나, 고른 파일을 한 번 내려받을 수 있어요.
            </p>
          ) : (
            <p className="mb-3" style={{ color: "var(--muted-foreground)" }}>
              <b>올리기</b>: 내 컴퓨터 폴더를 연결하면 안의 파일·하위 폴더를 모두 올리고, 켜 둔 동안 바뀐 파일만 새 버전으로 올려요(로컬에서 지운 파일은 워크스페이스에서 지우지 않아요).<br />
              <b>받기</b>: 파일을 고른 뒤 "로컬로 동기화"를 누르면 고른 파일만 내 컴퓨터에 받아 두고, 새 버전이 생기면 다시 받아요(내 컴퓨터에서 고친 파일은 덮어쓰지 않아요).
            </p>
          )}
          {error && <p role="alert" className="mb-2 text-red-500">{error}</p>}
          {!locked && (
            <div className="flex flex-wrap gap-2 mb-3">
              {supported ? (
                <button type="button" onClick={() => void addUpload()} className={pill} style={pillStyle}>⬆ 로컬 폴더를 “{folderLabel(currentFolderId)}”에 연결(자동 올리기)</button>
              ) : (
                <>
                  <button type="button" onClick={() => folderInput.current?.click()} className={pill} style={pillStyle}>⬆ 폴더 통째로 한 번 올리기 → “{folderLabel(currentFolderId)}”</button>
                  <input ref={folderInput} type="file" hidden multiple aria-label="올릴 폴더" {...{ webkitdirectory: "" }}
                    onChange={(e) => { const list = e.target.files; if (list?.length) void uploadFolderOnce(list); e.target.value = ""; }} />
                </>
              )}
            </div>
          )}
          {oneShot && <p role="status" className="mb-2">{oneShot}</p>}
          {links.length === 0 && supported && <p style={{ color: "var(--muted-foreground)" }}>아직 연결한 폴더가 없어요.</p>}
          <ul className="flex flex-col gap-2">
            {links.map((link) => {
              const st = states[link.id];
              const title = link.kind === "upload"
                ? <>⬆ 내 컴퓨터 “{link.dirName}” → 워크스페이스 “{folderLabel(link.targetFolderId)}”</>
                : <>⬇ 워크스페이스 파일 {link.fileIds.length}개 → 내 컴퓨터 “{link.dirName}”</>;
              return (
                <li key={link.id} className="p-3 border" style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--card)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-700 min-w-0 break-all">{title}</span>
                    <label className="ml-auto flex items-center gap-1 shrink-0" style={{ color: "var(--muted-foreground)" }}>
                      <input type="checkbox" checked={link.auto} onChange={() => void toggleAuto(link)} /> 자동
                    </label>
                    {st?.needsPermission ? (
                      <button type="button" onClick={() => void run(link.id, { ask: true })} className={pill} style={{ ...pillStyle, background: "#f59e0b22", color: "#b45309" }}>권한 다시 허용</button>
                    ) : (
                      <button type="button" onClick={() => void run(link.id, { ask: true })} disabled={st?.running || (link.kind === "upload" && locked)} className={pill} style={pillStyle}>{st?.running ? "동기화 중…" : "지금 동기화"}</button>
                    )}
                    <button type="button" onClick={() => void unlink(link.id)} className={pill} style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}>연결 끊기</button>
                  </div>
                  <div className="mt-1.5" style={{ color: "var(--muted-foreground)" }} role="status">
                    {st?.needsPermission ? "새로 고침한 뒤에는 폴더 권한을 한 번 다시 허용해야 동기화돼요." : st?.progress || describeResult(link.last)}
                    {!st?.needsPermission && !st?.progress && link.checkedAt && link.checkedAt !== link.last?.at && ` (마지막 확인 ${new Date(link.checkedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })})`}
                  </div>
                  {link.last && link.last.conflicts.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2" style={{ color: "#b45309" }}>
                      <span>내 컴퓨터에서 고쳤거나 같은 이름의 파일이 있어 덮어쓰지 않았어요: {link.last.conflicts.slice(0, 5).join(", ")}{link.last.conflicts.length > 5 && ` 외 ${link.last.conflicts.length - 5}개`}</span>
                      <button type="button" onClick={() => void run(link.id, { ask: true, force: true })} disabled={st?.running} className={pill} style={{ background: "#f59e0b22", color: "#b45309", borderRadius: "20px" }}>워크스페이스 것으로 덮어쓰기</button>
                    </div>
                  )}
                  {link.last && link.last.errors.length > 0 && (
                    <ul className="mt-1.5 list-disc pl-4 text-red-500">
                      {link.last.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}
                      {link.last.errors.length > 5 && <li>외 {link.last.errors.length - 5}개</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// <input webkitdirectory>로 고른 파일 목록을 폴더 핸들처럼 보이게 해 같은 올리기 규칙(runUploadLink)을 쓴다.
function memoryDir(name: string, files: Map<string, File>, prefix = ""): DirHandle {
  const dir: DirHandle = {
    kind: "directory", name,
    async *entries() {
      const seen = new Set<string>();
      for (const [path, file] of files) {
        if (!path.startsWith(prefix)) continue;
        const [head, ...rest] = path.slice(prefix.length).split("/");
        if (seen.has(head)) continue;
        seen.add(head);
        if (rest.length) yield [head, memoryDir(head, files, `${prefix}${head}/`)] as [string, DirHandle];
        else yield [head, { kind: "file", name: head, getFile: async () => file, createWritable: async () => { throw new Error("읽기 전용"); } } as FileHandle] as [string, FileHandle];
      }
    },
    getDirectoryHandle: async () => { throw new Error("읽기 전용"); },
    getFileHandle: async () => { throw new Error("읽기 전용"); },
  };
  return dir;
}
