import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FileUploadInput, FileVersion, WorkspaceFile } from "../../src/api/types";
import { MAX_WORKSPACE_FILE_SIZE, workspaceFileType } from "../../src/lib/workspaceFiles";
import { subscribeRealtimeEvents } from "./realtime-bus";

const Context = createContext<any>(null);

export function Fixture({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(false);
  const [errorMode, setErrorMode] = useState(false);
  type FixtureFolder = { id: number; parentId: number | null; name: string; color: string; createdBy: string; date: string; sortOrder?: number | null };

  const [folders, setFolders] = useState<FixtureFolder[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const bytes = useRef(new Map<number, Blob>());
  const counter = useRef(100);

  const currentMember = (function () {
    const u = new URLSearchParams(location.search).get("user");
    if (u) return { id: `user-${u}`, userId: `user-${u}`, name: u, color: "#2563eb" };
    let r = 0;
    try { r = Number(sessionStorage.getItem("fixture_user_id")) || 0; } catch {}
    if (!r) {
      r = Math.floor(100 + Math.random() * 900);
      try { sessionStorage.setItem("fixture_user_id", String(r)); } catch {}
    }
    const colors = ["#ef4444", "#f97316", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];
    return { id: `user-${r}`, userId: `user-${r}`, name: `팀원_${r}`, color: colors[r % colors.length] };
  })();

  // 1. 서버의 공유 파일 목록 로드
  useEffect(() => {
    fetch("/fixture-api/files")
      .then((r) => r.json())
      .then((data: WorkspaceFile[]) => {
        if (Array.isArray(data)) {
          setFiles([...data]);
        }
      })
      .catch((e) => console.error("초기 파일 목록 로드 오류:", e));
  }, []);

  // 2. 실시간 파일 목록 동기화 수신 (다른 사용자가 파일 업로드 시 즉시 반영)
  useEffect(() => {
    return subscribeRealtimeEvents((d) => {
      if (d?.kind === "files-sync" && Array.isArray(d.files)) {
        setFiles([...d.files]);
      }
    });
  }, []);

  function guard() {
    if (errorMode) throw new Error("테스트: 저장소 연결 실패");
    if (done) throw new Error("종료된 프로젝트");
  }

  return (
    <Context.Provider
      value={{
        project: { id: "fixture", name: "파일 버전관리 검증", status: done ? "done" : "active" },
        files,
        folders,
        team: { members: [{ name: currentMember.name, color: currentMember.color }] },
        currentMember,
        isLeader: true,
        isManager: true,
        deleteWorkspaceFile: async (id: number) => {
          guard();
          setFiles((prev) => prev.filter((f) => f.id !== id));
        },
        deleteWorkspaceFolder: async (id: number) => {
          guard();
          if (files.some((f) => f.folderId === id)) throw new Error("파일이 있는 폴더는 삭제할 수 없습니다.");
          setFolders((prev) => prev.filter((f) => f.id !== id));
        },
        pendingWorkspaceCleanup: async () => [],
        cleanupWorkspaceFiles: async () => {},
        markSectionViewed: async () => {},
        addFolder: async (name: string, parentId: number | null = null) => {
          guard();
          const created = { id: counter.current++, parentId, name: name.trim(), color: "#2563eb", createdBy: currentMember.name, date: "2026-09-17" };
          setFolders((prev) => [...prev, created]);
          return created;
        },
        addFileComment: async () => {},
        moveWorkspaceFiles: async (ids: number[], folderId: number | null) => {
          guard();
          setFiles((prev) => prev.map((f) => (ids.includes(f.id) ? { ...f, folderId, sortOrder: null } : f)));
          return 0;
        },
        moveWorkspaceFolder: async (id: number, parentId: number | null) => {
          guard();
          setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, parentId, sortOrder: null } : f)));
        },
        reorderWorkspaceItems: async (kind: "folder" | "file", ids: number[]) => {
          guard();
          const order = new Map(ids.map((id, i) => [id, i + 1]));
          if (kind === "folder") setFolders((prev) => prev.map((f) => (order.has(f.id) ? { ...f, sortOrder: order.get(f.id) } : f)));
          else setFiles((prev) => prev.map((f) => (order.has(f.id) ? { ...f, sortOrder: order.get(f.id) } : f)));
        },
        uploadWorkspaceFile: async (input: FileUploadInput) => {
          guard();
          if (input.file.size > MAX_WORKSPACE_FILE_SIZE) throw new Error("파일은 50MB까지 업로드할 수 있습니다.");

          // 파일 데이터를 Base64로 변환하여 서버에 영구 업로드 (모든 참가자와 공유)
          const arrayBuf = await input.file.arrayBuffer();
          let binary = "";
          const bytesArr = new Uint8Array(arrayBuf);
          for (let i = 0; i < bytesArr.byteLength; i++) {
            binary += String.fromCharCode(bytesArr[i]);
          }
          const base64 = btoa(binary);

          const res = await fetch("/fixture-api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: input.file.name,
              fileId: input.fileId,
              baseVersionId: input.baseVersionId,
              uploader: currentMember.name,
              size: input.file.size,
              tag: input.tags?.[0] || "기타",
              tags: input.tags || [],
              folderId: input.folderId,
              note: input.note || "",
              mimeType: input.file.type,
              base64,
            }),
          });

          if (!res.ok) throw new Error("파일 업로드 서버 전송 실패");
          const result = await res.json();
          bytes.current.set(result.versionId, input.file);

          try {
            const listRes = await fetch("/fixture-api/files");
            if (listRes.ok) {
              const latest = await listRes.json();
              setFiles(latest);
            }
          } catch {}

          return { fileId: result.fileId, versionId: result.versionId, branched: false };
        },
        setFileTags: async (id: number, tags: string[]) => {
          guard();
          setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, tags } : f)));
        },
        promoteFileVersion: async (fileId: number, id: number) => {
          guard();
          setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, versions: f.versions.map((v) => ({ ...v, current: v.id === id })) } : f)));
        },
        pinFileVersion: async (fileId: number, id: number, pinned: boolean) => {
          guard();
          setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, versions: f.versions.map((v) => (v.id === id ? { ...v, pinned } : v)) } : f)));
        },
        downloadFileVersion: async (id: number) => {
          if (errorMode) throw new Error("테스트: 다운로드 실패");
          const local = bytes.current.get(id);
          if (local) return local;
          // 로컬에 없으면 서버 저장소에서 다운로드
          const res = await fetch(`/fixture-api/file/${id}`);
          if (!res.ok) throw new Error("서버 원본 파일 다운로드 실패");
          const blob = await res.blob();
          bytes.current.set(id, blob);
          return blob;
        },
      }}
    >
      <div className="p-3 flex gap-4">
        <label><input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />종료 상태 테스트</label>
        <label><input type="checkbox" checked={errorMode} onChange={(e) => setErrorMode(e.target.checked)} />오류 테스트</label>
      </div>
      {children}
    </Context.Provider>
  );
}

export function useProject() { return useContext(Context); }
export function useOptionalProject() { return useContext(Context); }
