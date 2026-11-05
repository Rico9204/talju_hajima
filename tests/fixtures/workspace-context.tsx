import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FileUploadInput, FileVersion, WorkspaceFile } from "../../src/api/types";
import { MAX_WORKSPACE_FILE_SIZE, workspaceFileType } from "../../src/lib/workspaceFiles";
import { subscribeRealtimeEvents } from "./realtime-bus";

const Context = createContext<any>(null);

function version(id: number, baseId: number | null, current = true): FileVersion {
  return {
    id,
    baseVersionId: baseId,
    versionNumber: 1,
    uploader: "테스트 팀원",
    avatar: "팀",
    date: "2026-09-17",
    size: "1 KB",
    current,
    pinned: false,
    storagePath: `fixture/${id}`,
    originalName: "테스트.png",
  };
}

export function Fixture({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(false);
  const [errorMode, setErrorMode] = useState(false);
  type FixtureFolder = { id: number; parentId: number | null; name: string; color: string; createdBy: string; date: string; sortOrder?: number | null };

  const demo = typeof window !== "undefined" && new URLSearchParams(location.search).has("demo");
  const [folders, setFolders] = useState<FixtureFolder[]>(demo ? [
    { id: 101, parentId: null, name: "발표 자료", color: "#2563eb", createdBy: "테스트 팀원", date: "2026-09-17" },
    { id: 102, parentId: null, name: "회의록", color: "#f59e0b", createdBy: "테스트 팀원", date: "2026-09-17" },
    { id: 103, parentId: 101, name: "1차 발표", color: "#22c55e", createdBy: "테스트 팀원", date: "2026-09-17" },
  ] : []);

  const demoFile = (id: number, name: string): WorkspaceFile => ({
    id,
    name,
    type: workspaceFileType(name),
    uploader: "테스트 팀원",
    avatar: "팀",
    date: "2026-09-17",
    size: "1 KB",
    tag: "기타",
    tags: [],
    folderId: null,
    comments: [],
    versions: [{ ...version(id * 10, null, true), originalName: name }],
  });

  const [files, setFiles] = useState<WorkspaceFile[]>(demo ? [
    demoFile(11, "기획서.pdf"),
    demoFile(12, "예산.xlsx"),
    demoFile(13, "자료 조사.docx"),
    demoFile(14, "발표.pptx"),
  ] : []);

  const bytes = useRef(new Map<number, Blob>());
  const counter = useRef(200);

  const currentMember = (function () {
    if (typeof window === "undefined") return { id: "user-1", userId: "user-1", name: "팀원_1", color: "#2563eb" };
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
        if (Array.isArray(data) && data.length > 0) {
          setFiles([...data]);
        }
      })
      .catch(() => {});
  }, []);

  // 2. 실시간 파일 목록 동기화 수신
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
        projects: [{ id: "fixture", name: "탈주하지마 팀 프로젝트", org: "컴퓨터공학부", period: "2026.09 ~ 2026.12", status: done ? "done" : "active", approvalStatus: "approved", leaderName: currentMember.name, memberCount: 4 }],
        project: { id: "fixture", name: "탈주하지마 팀 프로젝트", org: "컴퓨터공학부", period: "2026.09 ~ 2026.12", status: done ? "done" : "active", approvalStatus: "approved", leaderName: currentMember.name, memberCount: 4 },
        setProjectId: () => {},
        addProject: async () => "fixture",
        deleteProject: async () => {},
        lookupProject: async () => null,
        joinProject: async () => {},
        getJoinCode: async () => "TALJU26",
        rotateJoinCode: async () => "TALJU26",
        isLeader: true,
        isViceLeader: false,
        isManager: true,
        chatUnreadTotal: 2,
        unreadMentions: 1,
        tasksUnread: 0,
        scheduleUnread: 0,
        workspaceUnread: 0,
        newTasks: [],
        newScheduleEvents: [],
        newFiles: [],
        files,
        folders,
        team: { teamLabel: "팀 프로젝트", teamSub: "컴퓨터공학부", members: [{ id: currentMember.id, userId: currentMember.userId, name: currentMember.name, color: currentMember.color, role: "팀장", links: [] }] },
        currentMember,
        viewedMemberId: null,
        setViewedMemberId: () => {},
        profileSection: null,
        setProfileSection: () => {},
        updateProfile: async () => {},
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

          try {
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

            if (res.ok) {
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
            }
          } catch {}

          // 오프라인/로컬 fallback
          const id = counter.current++;
          const fileId = input.fileId ?? id;
          const existing = files.find((f) => f.id === input.fileId);
          const branched = !!existing && existing.versions.find((v) => v.current)?.id !== input.baseVersionId;
          bytes.current.set(id, input.file);
          const v = {
            ...version(id, input.baseVersionId ?? null, !branched),
            originalName: input.file.name,
            storagePath: `fixture/${id}`,
            pinned: false,
            note: input.note ?? "",
          };
          setFiles((prev) =>
            existing
              ? prev.map((f) =>
                  f.id === fileId
                    ? { ...f, versions: [v, ...f.versions.map((old) => ({ ...old, current: branched ? old.current : false }))] }
                    : f
                )
              : [
                  ...prev,
                  {
                    id: fileId,
                    name: input.file.name,
                    type: workspaceFileType(input.file.name),
                    uploader: currentMember.name,
                    avatar: "팀",
                    date: "2026-09-17",
                    size: `${input.file.size} B`,
                    tag: "기타",
                    tags: input.tags ?? [],
                    folderId: input.folderId,
                    comments: [],
                    versions: [v],
                  },
                ]
          );
          return { fileId, versionId: id, branched };
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

          // 프레젠테이션 데모용 더미 파일
          if (id === 110) {
            const { jsPDF } = await import("jspdf");
            const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [960, 540] });
            pdf.setFillColor(245, 247, 250);
            pdf.rect(0, 0, 960, 540, "F");
            pdf.setTextColor(37, 99, 235);
            pdf.setFontSize(28);
            pdf.text("Slackerspace 팀 프로젝트 기획 발표", 60, 80);
            pdf.setTextColor(75, 85, 99);
            pdf.setFontSize(16);
            pdf.text("1. 프로젝트 개요 및 배경 설명", 60, 140);
            pdf.text("2. 주요 핵심 기능 분석", 60, 180);
            pdf.text("3. 아키텍처 및 데이터 흐름", 60, 220);
            pdf.addPage([960, 540], "landscape");
            pdf.setFillColor(240, 249, 255);
            pdf.rect(0, 0, 960, 540, "F");
            pdf.setTextColor(16, 185, 129);
            pdf.setFontSize(28);
            pdf.text("2페이지: 핵심 기술 스택 및 일정", 60, 80);
            pdf.setTextColor(75, 85, 99);
            pdf.setFontSize(16);
            pdf.text("• React 19 + Vite 8 + Tailwind CSS v4", 60, 140);
            pdf.text("• NestJS + PostgreSQL + PDF.js + OfficeParser", 60, 180);
            pdf.text("• 발표 모드 (전체화면 프레젠테이션 지원)", 60, 220);
            const blob = new Blob([pdf.output("arraybuffer")], { type: "application/pdf" });
            bytes.current.set(id, blob);
            return blob;
          }
          if (id === 140) {
            const PptxGen = (await import("pptxgenjs")).default;
            const pptx = new PptxGen();
            const s1 = pptx.addSlide();
            s1.addText("최종 프로젝트 발표 자료", { x: 1, y: 1.5, fontSize: 32, color: "2563EB", bold: true });
            s1.addText("발표자: 팀 탈주하지마", { x: 1, y: 3.0, fontSize: 18, color: "6B7280" });
            const s2 = pptx.addSlide();
            s2.addText("주요 성과 및 데모 시연", { x: 1, y: 1.0, fontSize: 26, color: "10B981", bold: true });
            s2.addText("• 윈도우 11 탐색기 스타일 레이아웃 완벽 지원\n• PDF 및 PPTX 전체화면 발표자 모드 탑재\n• 실시간 동시 협업 및 버전 관리", { x: 1, y: 2.2, fontSize: 16, color: "374151" });
            const buf = await pptx.write({ outputType: "arraybuffer" });
            const blob = new Blob([buf as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
            bytes.current.set(id, blob);
            return blob;
          }

          try {
            const res = await fetch(`/fixture-api/file/${id}`);
            if (res.ok) {
              const blob = await res.blob();
              bytes.current.set(id, blob);
              return blob;
            }
          } catch {}

          const blob = bytes.current.get(id);
          if (!blob) throw new Error("원본 없음");
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
export function useProjectManagement() { return { isAdmin: false, isOperator: false }; }
export function useAuth() {
  return {
    user: { id: "user-test", email: "test@example.com", user_metadata: { name: "테스터", avatar: "테" } },
    signOut: () => {},
    session: { access_token: "mock-token" },
  };
}
