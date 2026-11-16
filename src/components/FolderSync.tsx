import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileUploadInput, Folder, WorkspaceFile } from "../api/types";
import { listSyncPresence, pingSyncPresence, type SyncPresence } from "../api/rest/syncPresence";
import {
  hasReadWritePermission, isFolderSyncSupported, isTextFileName, pickFolder, planSync, readFolder, writeFile,
  type BaselineEntry, type ServerEntry,
} from "../lib/folderSync";

const AUTO_SYNC_INTERVAL_MS = 2000;
const PRESENCE_POLL_MS = 3000;
const NEW_FOLDER_VALUE = "__new__";
// 연속으로 이 횟수만큼 계속 실패해야 자동 동기화를 끈다(한 번의 일시적 오류로는 안 끈다).
const MAX_CONSECUTIVE_SYNC_FAILURES = 3;

interface SyncSummary { created: number; updated: number; branched: number; unchanged: number }

const currentVersion = (f: WorkspaceFile) => f.versions.find((v) => v.current) ?? f.versions[0];

// 워크스페이스 화면의 "로컬 폴더 연동". 규칙은 lib/folderSync.ts(이전 폴더의 폴더 연동과 같은 방식)에 있다.
export default function FolderSync({ projectId, ready, locked, files, folders, selectedPaths, upload, createFolder, load, onActiveChange }: {
  projectId: string;
  ready: boolean; // 파일·폴더 목록을 다 받았는지(받기 전에 돌리면 모든 파일을 새것으로 착각한다)
  locked: boolean; // 종료된 프로젝트: 올릴 수 없다
  files: WorkspaceFile[];
  folders: Folder[];
  selectedPaths: Set<string>; // 파일 목록에서 체크한 파일의 워크스페이스 경로
  upload: (input: FileUploadInput) => Promise<{ fileId: number; versionId: number; branched: boolean }>;
  createFolder: (name: string, parentId: number | null) => Promise<Folder>;
  load: (versionId: number) => Promise<Blob>;
  onActiveChange?: (active: boolean) => void;
}) {
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [rootFolderId, setRootFolderId] = useState<number | null>(null);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [others, setOthers] = useState<SyncPresence[]>([]);
  const syncingRef = useRef(false);
  const rootRef = useRef<number | null>(null);
  const baselineRef = useRef<Map<string, BaselineEntry>>(new Map());
  const syncFailuresRef = useRef(0);
  // 분기로 올린 (경로 → 올린 내용·기준 버전): 같은 분기를 2초마다 또 만들지 않게 한다.
  const branchedRef = useRef<Map<string, { content: string; baseVersionId: number | null }>>(new Map());
  const contentCache = useRef<Map<number, string>>(new Map()); // 버전 id → 내용(버전은 바뀌지 않는다)
  // 타이머 안에서 항상 최신 목록·함수를 보도록 ref에 둔다.
  const latest = useRef({ files, folders, ready, locked, upload, createFolder, load });
  latest.current = { files, folders, ready, locked, upload, createFolder, load };

  // 선택 동기화: 파일 목록에서 체크한 파일만. 켜져 있으면 아래 폴더/파일 범위 선택은 무시한다.
  const [scopeSelection, setScopeSelection] = useState<Set<string> | null>(null);
  const scopeRef = useRef<Set<string> | null>(null);
  const [topLevelEntries, setTopLevelEntries] = useState<{ name: string; isFolder: boolean }[]>([]);
  const [showScopePicker, setShowScopePicker] = useState(false);
  const [useSelectionAsScope, setUseSelectionAsScope] = useState(false);
  const useSelectionRef = useRef(false);
  const selectedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    selectedRef.current = selectedPaths;
    // 선택 동기화를 켜 둔 채 체크를 다 풀면 아무것도 안 올라가는 채로 멈추니, 자동으로 꺼서 전체/범위 동기화로 돌아간다.
    if (useSelectionRef.current && selectedPaths.size === 0) setUseSelectionAsScope(false);
  }, [selectedPaths]);
  useEffect(() => { useSelectionRef.current = useSelectionAsScope; }, [useSelectionAsScope]);
  useEffect(() => { onActiveChange?.(!!folderHandle && autoSync); }, [folderHandle, autoSync, onActiveChange]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const pathNames = useCallback((id: number | null): string[] => {
    const names: string[] = [];
    for (let cur = id, guard = 0; cur !== null && guard < 20; guard++) {
      const folder = folderById.get(cur);
      if (!folder) break;
      names.unshift(folder.name);
      cur = folder.parentId;
    }
    return names;
  }, [folderById]);
  const folderOptions = useMemo(
    () => folders.map((f) => ({ id: f.id, label: pathNames(f.id).join(" / ") })).sort((a, b) => a.label.localeCompare(b.label)),
    [folders, pathNames],
  );

  function computeTopLevelEntries(paths: string[]): { name: string; isFolder: boolean }[] {
    const map = new Map<string, boolean>();
    for (const p of paths) {
      const idx = p.indexOf("/");
      if (idx === -1) { if (!map.has(p)) map.set(p, false); } else map.set(p.slice(0, idx), true);
    }
    return Array.from(map.entries()).map(([name, isFolder]) => ({ name, isFolder })).sort((a, b) => a.name.localeCompare(b.name));
  }

  function inScope(path: string): boolean {
    if (useSelectionRef.current) {
      const prefix = pathNames(rootRef.current).join("/");
      return selectedRef.current.has(prefix ? `${prefix}/${path}` : path);
    }
    const scope = scopeRef.current;
    if (!scope) return true;
    return scope.has(path.includes("/") ? path.slice(0, path.indexOf("/")) : path);
  }

  function toggleScopeEntry(name: string) {
    setScopeSelection((prev) => {
      const next = new Set(prev ?? topLevelEntries.map((e) => e.name));
      if (next.has(name)) next.delete(name); else next.add(name);
      scopeRef.current = next;
      return next;
    });
  }
  function resetScopeToAll() { setScopeSelection(null); scopeRef.current = null; }

  async function refreshTopLevelEntries(handle: FileSystemDirectoryHandle) {
    setTopLevelEntries(computeTopLevelEntries((await readFolder(handle)).files.map((f) => f.path)));
  }

  // 다른 팀원이 겹치는 폴더를 동기화 중인지: 같은 폴더이거나 한쪽이 다른 쪽의 상위 폴더(루트는 모두의 상위).
  const overlapping = useMemo(() => {
    const mine = rootFolderId;
    const chain = (id: number | null): Set<number> => {
      const ids = new Set<number>([0]);
      for (let cur = id, guard = 0; cur !== null && guard < 20; guard++) { ids.add(cur); cur = folderById.get(cur)?.parentId ?? null; }
      return ids;
    };
    const mineChain = chain(mine);
    return others.filter((o) => {
      if (o.root === 0 || mine === null) return true;
      return mineChain.has(o.root) || chain(o.root).has(mine);
    });
  }, [others, rootFolderId, folderById]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const active = await listSyncPresence(projectId);
        if (!cancelled) setOthers(active);
      } catch { if (!cancelled) setOthers([]); }
    }
    void poll();
    const timer = setInterval(poll, PRESENCE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [projectId]);

  const runSync = useCallback(async (handle: FileSystemDirectoryHandle, initial = false, localFirst = false) => {
    if (syncingRef.current) return;
    const ctx = latest.current;
    if (!ctx.ready) return;
    syncingRef.current = true;
    try {
      const rootId = rootRef.current;
      const rootPrefix = (() => { const names: string[] = []; for (let cur = rootId, g = 0; cur !== null && g < 20; g++) { const f = ctx.folders.find((x) => x.id === cur); if (!f) break; names.unshift(f.name); cur = f.parentId; } return names; })();
      const foldersNow = [...ctx.folders];
      const folderPath = (id: number | null): string[] | null => {
        const names: string[] = [];
        for (let cur = id, g = 0; cur !== null && g < 20; g++) { const f = foldersNow.find((x) => x.id === cur); if (!f) return null; names.unshift(f.name); cur = f.parentId; }
        return names;
      };

      const { files: localEntries } = await readFolder(handle);
      const localMap = new Map(localEntries.map((f) => [f.path, f.content]));

      // 워크스페이스 쪽: 대상 폴더 아래의 글자 파일을 "대상 폴더 기준 경로"로.
      const serverMap = new Map<string, ServerEntry>();
      const fileByPath = new Map<string, WorkspaceFile>();
      for (const f of ctx.files) {
        if (!isTextFileName(f.name)) continue;
        const names = folderPath(f.folderId);
        if (!names) continue;
        if (!rootPrefix.every((n, i) => names[i] === n) || names.length < rootPrefix.length) continue;
        const version = currentVersion(f);
        if (!version) continue;
        const path = [...names.slice(rootPrefix.length), f.name].join("/");
        if (serverMap.has(path)) continue; // 같은 폴더에 같은 이름이 둘이면 먼저 만난 것만
        fileByPath.set(path, f);
        serverMap.set(path, {
          versionId: version.id,
          content: async () => {
            const cached = contentCache.current.get(version.id);
            if (cached !== undefined) return cached;
            const text = await (await ctx.load(version.id)).text();
            contentCache.current.set(version.id, text);
            return text;
          },
        });
      }

      const plan = await planSync({ local: localMap, server: serverMap, baseline: baselineRef.current, inScope, initial, localFirst });
      const next = plan.baseline;
      const result: SyncSummary = { created: 0, updated: 0, branched: 0, unchanged: 0 };

      // 대상 폴더 아래 하위 폴더를 경로대로 찾거나 만든다.
      async function folderFor(dirParts: string[]): Promise<number | null> {
        let parent = rootId;
        for (const name of dirParts) {
          const same = foldersNow.find((f) => f.parentId === parent && f.name === name);
          if (same) { parent = same.id; continue; }
          const created = await ctx.createFolder(name, parent);
          foldersNow.push(created);
          parent = created.id;
        }
        return parent;
      }

      if (!ctx.locked) {
        for (const item of plan.push) {
          const memo = branchedRef.current.get(item.path);
          if (memo && memo.content === item.content && memo.baseVersionId === item.baseVersionId) continue; // 이미 분기로 올렸다
          try {
            const parts = item.path.split("/");
            const name = parts.pop() as string;
            const folderId = await folderFor(parts);
            const existing = fileByPath.get(item.path) ?? ctx.files.find((f) => f.folderId === folderId && f.name === name);
            const file = new File([item.content], name, { type: "text/plain" });
            const res = await ctx.upload(existing
              ? { file, fileId: existing.id, folderId: existing.folderId, baseVersionId: item.baseVersionId ?? currentVersion(existing)?.id ?? null, note: "로컬 폴더 동기화", tags: existing.tags }
              : { file, folderId, note: "로컬 폴더 동기화" });
            if (res.branched) {
              result.branched++;
              branchedRef.current.set(item.path, { content: item.content, baseVersionId: item.baseVersionId });
            } else {
              branchedRef.current.delete(item.path);
              contentCache.current.set(res.versionId, item.content);
              next.set(item.path, { content: item.content, versionId: res.versionId });
              if (existing) result.updated++; else result.created++;
            }
          } catch {
            // 개별 파일 올리기 실패(파일 크기·권한 등)는 이번 주기에 건너뛴다. 이 경로는 baseline이 바뀌지 않아 다음 주기에 다시 시도한다.
          }
        }
      }

      // 개별 파일 쓰기 실패(다른 프로그램이 열어 둔 파일 등)는 흔한 일시 상황이다: 그 파일만 건너뛰고(baseline도 되돌려 다시 시도) 나머지는 진행.
      const failed: string[] = [];
      for (const entry of plan.pull) {
        try { await writeFile(handle, entry.path, entry.content); } catch { failed.push(entry.path); }
      }
      for (const path of failed) {
        const original = baselineRef.current.get(path);
        if (original) next.set(path, original); else next.delete(path);
      }
      const succeeded = plan.pull.filter((p) => !failed.includes(p.path));
      if (succeeded.length > 0) setDownloaded(succeeded.map((p) => p.path));
      result.unchanged = Math.max(0, [...localMap.keys()].filter(inScope).length - plan.push.length - succeeded.length);
      setSummary(result);

      baselineRef.current = next;
      void pingSyncPresence(projectId, rootId ?? 0).catch(() => {});
      syncFailuresRef.current = 0;
      setError(null);
    } catch {
      syncFailuresRef.current += 1;
      // 연달아 여러 번 계속 실패할 때만 "진짜 문제"로 보고 자동 동기화를 끈다.
      if (syncFailuresRef.current >= MAX_CONSECUTIVE_SYNC_FAILURES) {
        setAutoSync(false);
        setError("폴더 동기화가 계속 실패해 자동 동기화를 중지했습니다. 네트워크 상태를 확인한 뒤 다시 연동해주세요.");
      } else {
        setError("폴더 동기화 중 일시적인 오류가 발생했습니다. 다음 주기에 다시 시도합니다.");
      }
    } finally {
      syncingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pathNames]);

  useEffect(() => {
    if (!autoSync || !folderHandle) return;
    const timer = setInterval(async () => {
      if (!(await hasReadWritePermission(folderHandle))) {
        setAutoSync(false);
        setError("폴더 접근 권한이 만료되어 자동 동기화를 중지했습니다. 다시 연동해주세요.");
        return;
      }
      await runSync(folderHandle);
    }, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoSync, folderHandle, runSync]);

  function handleRootChange(id: number | null) {
    setRootFolderId(id);
    rootRef.current = id;
    baselineRef.current = new Map();
    branchedRef.current = new Map();
  }

  async function handleNewRoot() {
    const name = window.prompt("새 워크스페이스 폴더 이름")?.trim();
    if (!name) return;
    try {
      const created = await latest.current.createFolder(name, rootRef.current);
      handleRootChange(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "폴더를 만들지 못했습니다.");
    }
  }

  // localFirst=false(기본): 겹치는 파일은 워크스페이스 내용으로 로컬을 맞춘다.
  // localFirst=true("로컬 폴더 기준으로 동기화"): 겹치는 파일은 로컬 내용을 새 버전으로 올린다. 이후는 똑같이 바뀐 파일만 주고받는다.
  async function handlePickFolder(localFirst = false) {
    setError(null);
    setSyncing(true);
    try {
      const handle = await pickFolder();
      const { files: existing } = await readFolder(handle);
      if (existing.length > 0) {
        const ok = window.confirm(localFirst
          ? `선택한 폴더 안의 글자 파일 ${existing.length}개를 워크스페이스로 올립니다. 이름이 겹치는 워크스페이스 파일은 새 버전으로 올라갑니다. 계속할까요?`
          : `선택한 폴더에 이미 글자 파일이 ${existing.length}개 있습니다. 계속하면 워크스페이스와 겹치는 파일은 워크스페이스 내용으로 덮어써집니다. 계속할까요?`);
        if (!ok) return;
      }
      baselineRef.current = new Map();
      branchedRef.current = new Map();
      rootRef.current = rootFolderId;
      resetScopeToAll();
      setTopLevelEntries(computeTopLevelEntries(existing.map((f) => f.path)));
      setFolderHandle(handle);
      setAutoSync(true);
      await runSync(handle, true, localFirst);
    } catch {
      setError("폴더 연동에 실패했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleFinishWork() {
    if (!folderHandle) return;
    setSyncing(true);
    try { await runSync(folderHandle); } finally { setSyncing(false); setAutoSync(false); }
  }

  const selectedCount = selectedPaths.size;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-700">로컬 폴더 연동</h2>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>이 브라우저 탭이 열려있는 동안만 동기화돼요</span>
      </div>

      {error && <div className="text-sm mb-4 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "var(--radius-sm)" }}>{error}</div>}
      {locked && <div className="text-xs mb-3 px-3 py-2" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "var(--radius-sm)" }}>종료된 프로젝트라 로컬 → 워크스페이스 올리기는 하지 않아요(받기만 됩니다).</div>}

      {isFolderSyncSupported() ? (
        <>
          <div className="mb-4">
            <label className="text-xs font-600 block mb-1.5" style={{ color: "var(--muted-foreground)" }}>동기화 대상 워크스페이스 폴더</label>
            <select
              value={rootFolderId === null ? "" : String(rootFolderId)}
              onChange={(e) => { if (e.target.value === NEW_FOLDER_VALUE) void handleNewRoot(); else handleRootChange(e.target.value === "" ? null : Number(e.target.value)); }}
              className="w-full text-sm px-3 py-2.5 border outline-none"
              style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--muted)" }}
            >
              <option value="">워크스페이스 (루트)</option>
              {folderOptions.map((o) => <option key={o.id} value={o.id}>워크스페이스 / {o.label}</option>)}
              <option value={NEW_FOLDER_VALUE}>+ 새 폴더 만들기...</option>
            </select>

            {overlapping.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                {overlapping.map((p) => (
                  <p key={p.userId} className="text-xs px-3 py-1.5 inline-block w-fit font-600" style={{ background: "#f59e0b18", color: "#f59e0b", borderRadius: "20px" }}>
                    ⚠ {p.root === (rootFolderId ?? 0) ? "같은 폴더를" : `겹치는 폴더(${p.root === 0 ? "루트" : pathNames(p.root).join(" / ") || "다른 폴더"})를`} 다른 팀원이 지금 동기화 중
                  </p>
                ))}
              </div>
            )}

            {/* 선택 동기화 — 워크스페이스 파일 목록에서 체크한 항목만 로컬에 동기화 */}
            <label className="flex items-center gap-2 text-xs mt-3" style={{ color: selectedCount === 0 ? "var(--muted-foreground)" : "var(--foreground)", opacity: selectedCount === 0 ? 0.5 : 1 }}>
              <input type="checkbox" checked={useSelectionAsScope} disabled={selectedCount === 0} onChange={(e) => setUseSelectionAsScope(e.target.checked)} />
              선택 동기화 — 파일 목록에서 체크한 {selectedCount}개 파일만 동기화
            </label>

            {folderHandle && topLevelEntries.length > 0 && !useSelectionAsScope && (
              <div className="mt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => setShowScopePicker((v) => !v)} className="text-xs font-600 underline" style={{ color: "var(--primary)" }}>
                    {scopeSelection ? `선택한 ${scopeSelection.size}개 항목만 동기화 중 — 범위 수정` : "전체 동기화 중 — 특정 폴더/파일만 선택하기"}
                  </button>
                  <button type="button" onClick={() => void refreshTopLevelEntries(folderHandle)} className="text-xs" style={{ color: "var(--muted-foreground)" }}>목록 새로고침</button>
                </div>
                {showScopePicker && (
                  <div className="mt-2 p-3 flex flex-col gap-1.5 max-h-48 overflow-auto" style={{ background: "var(--muted)", borderRadius: "var(--radius-sm)" }}>
                    <label className="flex items-center gap-2 text-xs font-700"><input type="checkbox" checked={scopeSelection === null} onChange={resetScopeToAll} />전체 동기화</label>
                    {topLevelEntries.map((entry) => (
                      <label key={entry.name} className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={scopeSelection ? scopeSelection.has(entry.name) : true} onChange={() => toggleScopeEntry(entry.name)} />
                        {entry.isFolder ? "📁" : "📄"} {entry.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button type="button" onClick={() => void handlePickFolder(false)} disabled={syncing} className="text-sm font-700 px-5 py-2.5 transition-all" style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px", opacity: syncing ? 0.6 : 1 }}>
              {syncing ? "동기화 중..." : folderHandle ? "다른 폴더 선택" : "폴더 선택 후 동기화"}
            </button>
            {!folderHandle && (
              <button type="button" onClick={() => void handlePickFolder(true)} disabled={syncing} title="고른 로컬 폴더 안의 글자 파일을 전부 워크스페이스로 올립니다(겹치는 이름은 새 버전). 그 다음부터는 평소 동기화와 똑같이 동작해요." className="text-sm font-600 px-5 py-2.5 transition-all" style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "40px", opacity: syncing ? 0.6 : 1 }}>
                로컬 폴더 기준으로 동기화
              </button>
            )}
            {folderHandle && (
              <button type="button" onClick={() => setAutoSync((v) => !v)} className="text-sm font-600 px-5 py-2.5" style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "40px" }}>
                {autoSync ? "동기화 해제" : "자동 동기화 시작 (2초마다)"}
              </button>
            )}
            {folderHandle && (
              <button type="button" onClick={() => void handleFinishWork()} disabled={syncing} className="text-sm font-700 px-5 py-2.5 transition-all" style={{ background: "#16a34a", color: "#fff", borderRadius: "40px", opacity: syncing ? 0.6 : 1 }}>
                작업 완료
              </button>
            )}
          </div>

          {autoSync && folderHandle && <p className="text-xs mt-3 px-3 py-1.5 inline-block font-600" style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "20px" }}>자동 동기화 켜짐</p>}
          {summary && <p className="text-xs mt-4" style={{ color: "var(--muted-foreground)" }}>업로드 — 신규 {summary.created}개 · 새 버전 {summary.updated}개 · 분기 생성 {summary.branched}개 · 변경없음 {summary.unchanged}개</p>}
          {downloaded.length > 0 && <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>다운로드 반영: {downloaded.join(", ")}</p>}
          <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>글자 파일(txt·md·코드 등)만 동기화해요. pdf·이미지·오피스 파일은 업로드 버튼으로 올려 주세요.</p>
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>이 브라우저는 폴더 연동을 지원하지 않습니다 (Chrome/Edge에서 사용해주세요).</p>
      )}
    </div>
  );
}
