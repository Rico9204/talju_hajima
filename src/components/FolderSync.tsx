import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../context/ProjectContext";
import {
  hasReadWritePermission,
  isFolderSyncSupported,
  pickFolder,
  readFolder,
  writeFile,
} from "../lib/folderSync";
import { listProjectFiles, syncFiles, pingSyncPresence, listSyncPresence, type SyncResult, type ActivePresence } from "../api/backend/sync";

const AUTO_SYNC_INTERVAL_MS = 2000;
const PRESENCE_POLL_MS = 3000;
const NEW_ROOT_VALUE = "__new__";
// 연속으로 이 횟수만큼 계속 실패해야 자동 동기화를 끈다 (한 번의 일시적 오류로는 안 끔).
const MAX_CONSECUTIVE_SYNC_FAILURES = 3;

interface BaselineEntry {
  content: string;
  versionId: string | null;
}

// 제품개발/frontend의 폴더 연동(ProjectWorkspacePage.runSync + FolderSyncTab)을 이 앱의 화면
// 형식(var(--token) 인라인 스타일)에 맞춰 이식. 원래는 사이드바 메뉴의 별도 페이지였는데,
// 워크스페이스 화면 안(파일 업로드 존 바로 위)에 섹션으로 옮겨졌다 — Workspace.tsx 참고.
export default function FolderSync({ selectedPaths }: { selectedPaths?: Set<string> }) {
  const { project, folders } = useProject();
  const [folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [syncRoot, setSyncRoot] = useState("");
  const [showCustomRoot, setShowCustomRoot] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activePresence, setActivePresence] = useState<ActivePresence[]>([]);
  const syncingRef = useRef(false);
  const syncRootRef = useRef("");
  const baselineRef = useRef<Map<string, BaselineEntry>>(new Map());
  // 연속으로 몇 번 실패했는지 — 네트워크 순간 끊김처럼 스쳐 지나가는 오류 때문에 자동 동기화가
  // 바로 꺼지지 않도록, 연달아 여러 번 실패했을 때만 자동 동기화를 끈다.
  const syncFailuresRef = useRef(0);
  // 선택한 동기화 범위(최상위 폴더/파일 이름 집합) — null이면 전체 동기화(기존 동작 그대로).
  // 이 집합에 든 이름 바깥의 로컬 파일/서버 파일은 올리지도 받지도 않는다.
  const [scopeSelection, setScopeSelection] = useState<Set<string> | null>(null);
  const scopeSelectionRef = useRef<Set<string> | null>(null);
  const [topLevelEntries, setTopLevelEntries] = useState<{ name: string; isFolder: boolean }[]>([]);
  const [showScopePicker, setShowScopePicker] = useState(false);
  // "선택 동기화" — 워크스페이스 파일 목록에서 체크박스로 선택한 항목만 로컬에 동기화한다. 켜져
  // 있으면 위의 폴더/파일 범위 선택은 무시하고 이 선택만 기준으로 삼는다.
  const [useSelectionAsScope, setUseSelectionAsScope] = useState(false);
  const useSelectionRef = useRef(false);
  const selectedPathsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    selectedPathsRef.current = selectedPaths ?? new Set();
    // 선택 동기화를 켜둔 채로 체크를 다 풀면(선택 0개) 아무것도 안 올라가는 채로 멈춰있는
    // 상태가 되니, 그럴 땐 선택 동기화를 자동으로 꺼서 "전체/범위 동기화"로 돌아가게 한다.
    if (useSelectionRef.current && (selectedPaths?.size ?? 0) === 0) {
      setUseSelectionAsScope(false);
    }
  }, [selectedPaths]);
  useEffect(() => {
    useSelectionRef.current = useSelectionAsScope;
  }, [useSelectionAsScope]);

  // 이미 워크스페이스에 있는 최상위 폴더 이름들 (드롭다운 후보) — Workspace 화면의 폴더 목록을 그대로 재사용
  const folderOptions = useMemo(() => folders.map((f) => f.name).sort(), [folders]);

  function computeTopLevelEntries(paths: string[]): { name: string; isFolder: boolean }[] {
    const map = new Map<string, boolean>();
    for (const p of paths) {
      const idx = p.indexOf("/");
      if (idx === -1) {
        if (!map.has(p)) map.set(p, false);
      } else {
        map.set(p.slice(0, idx), true);
      }
    }
    return Array.from(map.entries())
      .map(([name, isFolder]) => ({ name, isFolder }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function inScope(path: string): boolean {
    if (useSelectionRef.current) {
      const root = syncRootRef.current;
      const projectPath = root ? `${root}/${path}` : path;
      return selectedPathsRef.current.has(projectPath);
    }
    const scope = scopeSelectionRef.current;
    if (!scope) return true;
    const top = path.includes("/") ? path.slice(0, path.indexOf("/")) : path;
    return scope.has(top);
  }

  function toggleScopeEntry(name: string) {
    setScopeSelection((prev) => {
      const base = prev ?? new Set(topLevelEntries.map((e) => e.name));
      const next = new Set(base);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      scopeSelectionRef.current = next;
      return next;
    });
  }

  function resetScopeToAll() {
    setScopeSelection(null);
    scopeSelectionRef.current = null;
  }

  async function refreshTopLevelEntries(handle: FileSystemDirectoryHandle) {
    const { files: existing } = await readFolder(handle);
    setTopLevelEntries(computeTopLevelEntries(existing.map((f) => f.path)));
  }

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { data } = await listSyncPresence(project.id, syncRoot);
        if (!cancelled) setActivePresence(data.active);
      } catch {
        if (!cancelled) setActivePresence([]);
      }
    }
    poll();
    const timer = setInterval(poll, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [project.id, syncRoot]);

  const runSync = useCallback(
    async (handle: FileSystemDirectoryHandle, initial = false, localFirst = false) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        const root = syncRootRef.current;
        const toProjectPath = (p: string) => (root ? `${root}/${p}` : p);

        const [{ files: localEntries }, serverFilesRes] = await Promise.all([readFolder(handle), listProjectFiles(project.id)]);

        const localMap = new Map(localEntries.map((f) => [f.path, f.content]));
        const serverMap = new Map<string, { content: string; versionId: string | null }>();
        for (const f of serverFilesRes.data) {
          if (!root) {
            serverMap.set(f.path, { content: f.content, versionId: f.currentVersionId });
          } else if (f.path.startsWith(`${root}/`)) {
            serverMap.set(f.path.slice(root.length + 1), { content: f.content, versionId: f.currentVersionId });
          }
        }

        const baseline = baselineRef.current;
        const allPaths = new Set([...localMap.keys(), ...serverMap.keys(), ...baseline.keys()]);

        const toPush: { path: string; content: string; baseVersionId?: string }[] = [];
        const toPull: { path: string; content: string }[] = [];
        const nextBaseline = new Map(baseline);

        for (const path of allPaths) {
          // 동기화 범위를 특정 폴더/파일로 좁혀놨으면 그 밖의 경로는 올리지도 받지도 않고
          // 건드리지 않는다(baseline도 그대로 둬서, 범위를 다시 넓혔을 때 정상적으로 비교되게 함).
          if (!inScope(path)) continue;

          const local = localMap.get(path);
          const server = serverMap.get(path);
          const base = baseline.get(path);

          if (local === undefined) {
            if (base === undefined && server !== undefined) {
              toPull.push({ path, content: server.content });
              nextBaseline.set(path, server);
            } else {
              nextBaseline.delete(path);
            }
            continue;
          }

          if (server === undefined) {
            toPush.push({ path, content: local });
            continue;
          }

          if (base === undefined) {
            if (server.content === local) {
              nextBaseline.set(path, server);
            } else if (initial && !localFirst) {
              // 처음 연동하는 순간엔 기본적으로 워크스페이스 내용을 기준으로 로컬을 맞춘다
              toPull.push({ path, content: server.content });
              nextBaseline.set(path, server);
            } else {
              // "로컬 폴더 기준으로 동기화"로 연동했거나(localFirst), 이미 연동 중 로컬에서
              // 새로 생긴 변경이면 로컬 내용을 워크스페이스에 새 버전으로 올린다.
              toPush.push({ path, content: local, baseVersionId: server.versionId ?? undefined });
            }
            continue;
          }

          const localChanged = local !== base.content;
          const serverChanged = server.content !== base.content;
          if (!localChanged && !serverChanged) continue;

          if (!localChanged && serverChanged) {
            toPull.push({ path, content: server.content });
            nextBaseline.set(path, server);
            continue;
          }

          if (localChanged) {
            toPush.push({ path, content: local, baseVersionId: base.versionId ?? undefined });
          }
        }

        if (toPush.length > 0) {
          const { data } = await syncFiles(
            project.id,
            toPush.map((e) => ({ path: toProjectPath(e.path), content: e.content, baseVersionId: e.baseVersionId })),
          );
          setSyncResult(data);
        }
        // 파일 하나가 지금 다른 프로그램에 열려있어 쓰기가 막히는 등 개별 파일 쓰기 실패는
        // 흔한 일시적 상황이다 — 여기서 막지 않으면 예외가 바깥 catch까지 올라가 동기화
        // 전체가 중단되고 자동 동기화가 꺼진다. 실패한 파일은 이번 주기에 건너뛰고(baseline도
        // 되돌려서 다음 주기에 다시 받아쓰기 시도하게 함), 나머지는 정상 진행한다.
        const failedPulls: string[] = [];
        for (const entry of toPull) {
          try {
            await writeFile(handle, entry.path, entry.content);
          } catch {
            failedPulls.push(entry.path);
          }
        }
        for (const path of failedPulls) {
          const original = baseline.get(path);
          if (original) nextBaseline.set(path, original);
          else nextBaseline.delete(path);
        }
        const succeededPulls = toPull.filter((f) => !failedPulls.includes(f.path));
        if (succeededPulls.length > 0) setDownloaded(succeededPulls.map((f) => f.path));

        const { data: refreshed } = await listProjectFiles(project.id);
        const refreshedByPath = new Map(refreshed.map((f) => [f.path, f]));
        for (const entry of toPush) {
          const file = refreshedByPath.get(toProjectPath(entry.path));
          if (file && file.content === entry.content) {
            nextBaseline.set(entry.path, { content: file.content, versionId: file.currentVersionId });
          }
        }

        baselineRef.current = nextBaseline;
        pingSyncPresence(project.id, root).catch(() => {});
        syncFailuresRef.current = 0;
        setError(null);
      } catch {
        syncFailuresRef.current += 1;
        // 한 번 실패했다고 바로 끄지 않는다 — 네트워크가 한 번 순간적으로 끊긴 정도는 다음
        // 주기에 알아서 회복되는 경우가 대부분이다. 연달아 여러 번 계속 실패할 때만
        // "뭔가 진짜로 문제가 있다"고 보고 자동 동기화를 끈다.
        if (syncFailuresRef.current >= MAX_CONSECUTIVE_SYNC_FAILURES) {
          setAutoSync(false);
          setError("폴더 동기화가 계속 실패해 자동 동기화를 중지했습니다. 네트워크 상태를 확인한 뒤 다시 연동해주세요.");
        } else {
          setError("폴더 동기화 중 일시적인 오류가 발생했습니다. 다음 주기에 다시 시도합니다.");
        }
      } finally {
        syncingRef.current = false;
      }
    },
    [project.id],
  );

  useEffect(() => {
    if (!autoSync || !folderHandle) return;
    const timer = setInterval(async () => {
      const ok = await hasReadWritePermission(folderHandle);
      if (!ok) {
        setAutoSync(false);
        setError("폴더 접근 권한이 만료되어 자동 동기화를 중지했습니다. 다시 연동해주세요.");
        return;
      }
      await runSync(folderHandle);
    }, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoSync, folderHandle, runSync]);

  function handleSyncRootChange(value: string) {
    setSyncRoot(value);
    syncRootRef.current = value;
    baselineRef.current = new Map();
  }

  // localFirst=false(기본): 워크스페이스와 겹치는 파일은 워크스페이스 내용으로 로컬을 맞춘다.
  // localFirst=true("로컬 폴더 기준으로 동기화"): 겹치는 파일은 반대로 로컬 내용을 워크스페이스에
  // 새 버전으로 올린다 — 로컬 파일을 한 번에 업로드하는 용도. 어느 쪽이든 이후로는 똑같이
  // 자동/수동 동기화(바뀐 파일만 주고받는 평소 동작)로 이어진다.
  async function handlePickFolder(localFirst = false) {
    setError(null);
    setSyncing(true);
    try {
      const handle = await pickFolder();
      const { files: existing } = await readFolder(handle);
      if (existing.length > 0) {
        const ok = window.confirm(
          localFirst
            ? `선택한 폴더 안의 파일 ${existing.length}개를 워크스페이스로 올립니다. 이름이 겹치는 워크스페이스 파일은 새 버전으로 덮어써집니다. 계속할까요?`
            : `선택한 폴더에 이미 파일이 ${existing.length}개 있습니다. 계속하면 워크스페이스와 겹치는 파일은 워크스페이스 내용으로 덮어써집니다. 계속할까요?`,
        );
        if (!ok) return;
      }
      baselineRef.current = new Map();
      syncRootRef.current = syncRoot;
      resetScopeToAll();
      setTopLevelEntries(computeTopLevelEntries(existing.map((f) => f.path)));
      setFolderHandle(handle);
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
    try {
      await runSync(folderHandle);
    } finally {
      setSyncing(false);
      setAutoSync(false);
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-700">로컬 폴더 연동</h2>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          이 브라우저 탭이 열려있는 동안만 동기화돼요
        </span>
      </div>

      {error && (
        <div className="text-sm mb-4 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "var(--radius-sm)" }}>
          {error}
        </div>
      )}

      <div className="p-6" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
        {isFolderSyncSupported() ? (
          <>
            <div className="mb-4">
              <label className="text-xs font-600 block mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                동기화 대상 워크스페이스 폴더
              </label>
              <select
                value={showCustomRoot ? NEW_ROOT_VALUE : syncRoot}
                onChange={(e) => {
                  if (e.target.value === NEW_ROOT_VALUE) {
                    setShowCustomRoot(true);
                    handleSyncRootChange("");
                  } else {
                    setShowCustomRoot(false);
                    handleSyncRootChange(e.target.value);
                  }
                }}
                className="w-full max-w-sm text-sm px-3 py-2.5 border outline-none"
                style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--muted)" }}
              >
                <option value="">워크스페이스 (루트)</option>
                {folderOptions.map((p) => (
                  <option key={p} value={p}>
                    워크스페이스 / {p}
                  </option>
                ))}
                <option value={NEW_ROOT_VALUE}>+ 새 폴더 경로 직접 입력...</option>
              </select>
              {showCustomRoot && (
                <input
                  autoFocus
                  value={syncRoot}
                  onChange={(e) => handleSyncRootChange(e.target.value)}
                  placeholder="새 폴더 경로 (예: docs/team1)"
                  className="w-full max-w-sm text-sm px-3 py-2.5 border outline-none mt-2"
                  style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--muted)" }}
                />
              )}

              {activePresence.length > 0 && (
                <div className="flex flex-col gap-1 mt-2">
                  {activePresence.map((p) => (
                    <p key={p.userId} className="text-xs px-3 py-1.5 inline-block w-fit font-600" style={{ background: "#f59e0b18", color: "#f59e0b", borderRadius: "20px" }}>
                      ⚠ {p.root === syncRoot ? "같은 폴더를" : `상위 폴더(${p.root || "루트"})를`} 다른 팀원이 지금 동기화 중
                    </p>
                  ))}
                </div>
              )}

              {/* 선택 동기화 — 워크스페이스 파일 목록에서 체크한 항목만 로컬에 능동적으로 동기화 */}
              <label
                className="flex items-center gap-2 text-xs mt-3"
                style={{ color: (selectedPaths?.size ?? 0) === 0 ? "var(--muted-foreground)" : "var(--foreground)", opacity: (selectedPaths?.size ?? 0) === 0 ? 0.5 : 1 }}
              >
                <input
                  type="checkbox"
                  checked={useSelectionAsScope}
                  disabled={(selectedPaths?.size ?? 0) === 0}
                  onChange={(e) => setUseSelectionAsScope(e.target.checked)}
                />
                선택 동기화 — 아래 파일 목록에서 체크한 {selectedPaths?.size ?? 0}개 항목만 동기화
              </label>

              {folderHandle && topLevelEntries.length > 0 && !useSelectionAsScope && (
                <div className="mt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setShowScopePicker((v) => !v)}
                      className="text-xs font-600 underline"
                      style={{ color: "var(--primary)" }}
                    >
                      {scopeSelection ? `선택한 ${scopeSelection.size}개 항목만 동기화 중 — 범위 수정` : "전체 동기화 중 — 특정 폴더/파일만 선택하기"}
                    </button>
                    <button
                      onClick={() => refreshTopLevelEntries(folderHandle)}
                      className="text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      목록 새로고침
                    </button>
                  </div>
                  {showScopePicker && (
                    <div className="mt-2 p-3 flex flex-col gap-1.5 max-h-48 overflow-auto max-w-sm" style={{ background: "var(--muted)", borderRadius: "var(--radius-sm)" }}>
                      <label className="flex items-center gap-2 text-xs font-700">
                        <input type="checkbox" checked={scopeSelection === null} onChange={resetScopeToAll} />
                        전체 동기화
                      </label>
                      {topLevelEntries.map((entry) => (
                        <label key={entry.name} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={scopeSelection ? scopeSelection.has(entry.name) : true}
                            onChange={() => toggleScopeEntry(entry.name)}
                          />
                          {entry.isFolder ? "📁" : "📄"} {entry.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => handlePickFolder(false)}
                disabled={syncing}
                className="text-sm font-700 px-5 py-2.5 transition-all"
                style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px", opacity: syncing ? 0.6 : 1 }}
              >
                {syncing ? "동기화 중..." : folderHandle ? "다른 폴더 선택" : "폴더 선택 후 동기화"}
              </button>
              {!folderHandle && (
                <button
                  onClick={() => handlePickFolder(true)}
                  disabled={syncing}
                  title="고른 로컬 폴더 안의 파일을 전부 워크스페이스로 올립니다(겹치는 이름은 새 버전). 그 다음부터는 평소 동기화와 똑같이 동작해요."
                  className="text-sm font-600 px-5 py-2.5 transition-all"
                  style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "40px", opacity: syncing ? 0.6 : 1 }}
                >
                  로컬 폴더 기준으로 동기화
                </button>
              )}
              {folderHandle && (
                <button
                  onClick={() => setAutoSync((v) => !v)}
                  className="text-sm font-600 px-5 py-2.5"
                  style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "40px" }}
                >
                  {autoSync ? "동기화 해제" : "자동 동기화 시작 (2초마다)"}
                </button>
              )}
              {folderHandle && (
                <button
                  onClick={handleFinishWork}
                  disabled={syncing}
                  className="text-sm font-700 px-5 py-2.5 transition-all"
                  style={{ background: "#16a34a", color: "#fff", borderRadius: "40px", opacity: syncing ? 0.6 : 1 }}
                >
                  작업 완료
                </button>
              )}
            </div>

            {autoSync && folderHandle && (
              <p className="text-xs mt-3 px-3 py-1.5 inline-block font-600" style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "20px" }}>
                자동 동기화 켜짐
              </p>
            )}

            {syncResult && (
              <p className="text-xs mt-4" style={{ color: "var(--muted-foreground)" }}>
                업로드 — 신규 {syncResult.created.length}개 · 즉시 반영 {syncResult.updated.length}개 · 분기 생성 {syncResult.branched.length}개 ·
                변경없음 {syncResult.unchanged.length}개
              </p>
            )}
            {downloaded.length > 0 && (
              <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>다운로드 반영: {downloaded.join(", ")}</p>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            이 브라우저는 폴더 연동을 지원하지 않습니다 (Chrome/Edge에서 사용해주세요).
          </p>
        )}
      </div>
    </div>
  );
}
