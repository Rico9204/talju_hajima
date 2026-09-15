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
// 형식(페이지 하나 = 화면 하나, var(--token) 인라인 스타일)에 맞춰 이식.
export default function FolderSync() {
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

  // 이미 워크스페이스에 있는 최상위 폴더 이름들 (드롭다운 후보) — Workspace 화면의 폴더 목록을 그대로 재사용
  const folderOptions = useMemo(() => folders.map((f) => f.name).sort(), [folders]);

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
    async (handle: FileSystemDirectoryHandle, initial = false) => {
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
            } else if (initial) {
              // 처음 연동하는 순간엔 워크스페이스 내용을 기준으로 로컬을 맞춘다
              toPull.push({ path, content: server.content });
              nextBaseline.set(path, server);
            } else {
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

  const rootLocked = !!folderHandle && autoSync;

  async function handlePickFolder() {
    setError(null);
    setSyncing(true);
    try {
      const handle = await pickFolder();
      const { files: existing } = await readFolder(handle);
      if (existing.length > 0) {
        const ok = window.confirm(
          `선택한 폴더에 이미 파일이 ${existing.length}개 있습니다. 계속하면 워크스페이스와 겹치는 파일은 워크스페이스 내용으로 덮어써집니다. 계속할까요?`,
        );
        if (!ok) return;
      }
      baselineRef.current = new Map();
      syncRootRef.current = syncRoot;
      setFolderHandle(handle);
      await runSync(handle, true);
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
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-7">
        <div className="text-xs font-600 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          로컬 폴더 연동 · {project.name}
        </div>
        <h1 className="text-3xl font-600" style={{ fontFamily: "var(--font-fraunces)" }}>Folder Sync</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
          이 브라우저 탭이 열려있는 동안만 동기화됩니다. 워크스페이스와는 별개의 실시간 파일 연동 기능이에요.
        </p>
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
                disabled={rootLocked}
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
                  disabled={rootLocked}
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
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handlePickFolder}
                disabled={syncing}
                className="text-sm font-700 px-5 py-2.5 transition-all"
                style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px", opacity: syncing ? 0.6 : 1 }}
              >
                {syncing ? "동기화 중..." : folderHandle ? "다른 폴더 선택" : "폴더 선택 후 동기화"}
              </button>
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
