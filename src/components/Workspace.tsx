import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../context/ProjectContext";
import {
  addFileComment,
  createFilePin,
  deleteFilePin,
  listAllSyncPresence,
  listBranches,
  listFileComments,
  listFilePins,
  listFileVersions,
  listFiles,
  promoteVersion as promoteVersionApi,
  setFileTag,
  syncFiles,
  type ActivePresence,
  type FileBranches,
  type FileComment,
  type FileVersion,
  type FileVersionPin,
  type ProjectFile,
} from "../api/backend/files";
import { MAX_FILE_SIZE } from "../lib/folderSync";

// 제품개발/frontend의 워크스페이스(ProjectWorkspacePage의 파일 로딩/승격 로직 + WorkspaceTab의
// 폴더/버전 트리/핀/태그/댓글/동시 동기화 표시 UI)를 이 앱의 화면 형식(페이지 하나 = 화면 하나,
// var(--token) 인라인 스타일)에 맞춰 그대로 이식. talju_hajima 원래의 로컬(ProjectContext) 파일
// 모델은 더 이상 쓰지 않고 실제 백엔드(api/backend/files.ts)와 직접 통신한다 — FolderSync.tsx와
// 동일한 방식.

const PRESENCE_POLL_MS = 3000;
const KEEP_FILE = ".keep";
const TAG_PALETTE = ["#3d52d5", "#f0a500", "#22c55e", "#8b5cf6", "#6b7280", "#2563eb", "#ef4444", "#06b6d4"];

interface TypeMeta {
  bg: string;
  color: string;
  label: string;
}

const TYPE_META: Record<string, TypeMeta> = {
  pdf: { bg: "#ef444418", color: "#ef4444", label: "PDF" },
  doc: { bg: "#3d52d518", color: "#3d52d5", label: "DOC" },
  docx: { bg: "#3d52d518", color: "#3d52d5", label: "DOC" },
  ppt: { bg: "#f0a50018", color: "#f0a500", label: "PPT" },
  pptx: { bg: "#f0a50018", color: "#f0a500", label: "PPT" },
  xls: { bg: "#22c55e18", color: "#22c55e", label: "XLS" },
  xlsx: { bg: "#22c55e18", color: "#22c55e", label: "XLS" },
  zip: { bg: "#8b5cf618", color: "#8b5cf6", label: "ZIP" },
  png: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  jpg: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  jpeg: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  gif: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  svg: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  md: { bg: "#2563eb18", color: "#2563eb", label: "MD" },
  ts: { bg: "#2563eb18", color: "#2563eb", label: "TS" },
  tsx: { bg: "#2563eb18", color: "#2563eb", label: "TSX" },
  js: { bg: "#f59e0b18", color: "#f59e0b", label: "JS" },
  json: { bg: "#6b728018", color: "#6b7280", label: "JSON" },
};
const DEFAULT_TYPE_META: TypeMeta = { bg: "#6b728018", color: "#6b7280", label: "FILE" };

function getTypeMeta(path: string): TypeMeta {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_META[ext] ?? DEFAULT_TYPE_META;
}

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function fileSize(content: string): number {
  return new Blob([content]).size;
}

function downloadFile(path: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || path;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function rootCoversPath(root: string, path: string): boolean {
  return root === "" || path === root || path.startsWith(`${root}/`);
}

// 버전 트리 한 노드 + 그 자식들을 재귀적으로 그림 (index.css의 .version-tree가 <li>/<ul> 중첩을
// 보고 위쪽 가로/세로 연결선을 그려서 나뭇가지처럼 보이게 함). 카드를 클릭하면 그 버전이 "포커스"가
// 되어 메모/내용/버튼이 펼쳐지고, 조상·바로 아래 분기만 밝게, 나머지는 흐리게 표시된다.
function VersionNode({
  version,
  childrenByParent,
  currentVersionId,
  openBranchIds,
  pinsByVersion,
  memberNameById,
  focusedVersionId,
  highlightIds,
  onFocus,
  onPromote,
  onCreatePin,
  onUploadToPin,
}: {
  version: FileVersion;
  childrenByParent: Map<string | null, FileVersion[]>;
  currentVersionId: string | null;
  openBranchIds: Set<string>;
  pinsByVersion: Map<string, FileVersionPin[]>;
  memberNameById: Map<string, string>;
  focusedVersionId: string | null;
  highlightIds: Set<string>;
  onFocus: (versionId: string) => void;
  onPromote: (versionId: string) => void;
  onCreatePin: (versionId: string) => void;
  onUploadToPin: (pinId: string) => void;
}) {
  const isCurrent = version.id === currentVersionId;
  const isOpenBranch = openBranchIds.has(version.id);
  const pinsHere = pinsByVersion.get(version.id) ?? [];
  const expanded = version.id === focusedVersionId;
  const isDimmed = highlightIds.size > 0 && !highlightIds.has(version.id);
  const children = childrenByParent.get(version.id) ?? [];
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [expanded]);

  return (
    <li>
      <div
        ref={cardRef}
        className="text-left transition-opacity"
        style={{
          width: expanded ? 220 : "auto",
          background: isCurrent ? "var(--primary)" : "var(--card)",
          boxShadow: "var(--shadow-card)",
          borderRadius: "10px",
          border: isOpenBranch && !isCurrent ? "1px solid #ef4444" : "1px solid transparent",
          opacity: isDimmed ? 0.35 : 1,
        }}
      >
        <button onClick={() => onFocus(version.id)} className="w-full flex flex-col gap-1 text-left px-3 py-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-700 truncate" style={{ color: isCurrent ? "#fff" : "var(--foreground)" }}>
              {memberNameById.get(version.authorId) ?? version.authorId}
            </span>
            {isCurrent && (
              <span className="text-xs px-1.5 py-0.5 font-600 shrink-0" style={{ borderRadius: "4px", background: "rgba(255,255,255,0.25)", color: "#fff" }}>
                현재
              </span>
            )}
            {isOpenBranch && !isCurrent && (
              <span className="text-xs px-1.5 py-0.5 font-600 shrink-0" style={{ borderRadius: "4px", background: "#ef444418", color: "#ef4444" }}>
                분기
              </span>
            )}
            {pinsHere.map((p) => (
              <span key={p.id} className="text-xs px-1.5 py-0.5 font-600 shrink-0" style={{ borderRadius: "4px", background: "#8b5cf618", color: "#8b5cf6" }}>
                📌 {p.label}
              </span>
            ))}
          </div>
          <span className="text-xs" style={{ color: isCurrent ? "rgba(255,255,255,0.75)" : "var(--muted-foreground)" }}>
            {formatDate(version.createdAt)}
          </span>
        </button>
        {expanded && (
          <div className="px-3 pb-3">
            {version.note && (
              <div className="text-xs italic mb-1.5" style={{ color: isCurrent ? "rgba(255,255,255,0.85)" : "var(--muted-foreground)" }}>
                "{version.note}"
              </div>
            )}
            <pre
              className="text-xs whitespace-pre-wrap p-2 max-h-28 overflow-y-auto text-left"
              style={{ borderRadius: "8px", background: isCurrent ? "rgba(255,255,255,0.15)" : "var(--muted)", color: isCurrent ? "#fff" : "var(--foreground)" }}
            >
              {version.content}
            </pre>
            {!isCurrent && (
              <button
                onClick={() => onPromote(version.id)}
                className="w-full text-xs font-700 px-3 py-1.5 mt-2"
                style={{ borderRadius: "20px", color: "#fff", background: "var(--primary)" }}
              >
                이 버전을 현재로 지정
              </button>
            )}
            {pinsHere.length > 0 ? (
              <button
                onClick={() => onUploadToPin(pinsHere[0].id)}
                className="w-full text-xs font-700 px-3 py-1.5 mt-1.5"
                style={{ borderRadius: "20px", border: "2px solid #8b5cf6", color: isCurrent ? "#fff" : "#8b5cf6", background: "transparent" }}
              >
                📌 {pinsHere[0].label}로 새 버전 업로드
              </button>
            ) : (
              <button
                onClick={() => onCreatePin(version.id)}
                className="w-full text-xs font-600 px-3 py-1.5 mt-1.5"
                style={{
                  borderRadius: "20px",
                  border: `1px solid ${isCurrent ? "rgba(255,255,255,0.5)" : "var(--border)"}`,
                  color: isCurrent ? "#fff" : "var(--muted-foreground)",
                  background: "transparent",
                }}
              >
                📌 이 버전에 핀 꽂기
              </button>
            )}
          </div>
        )}
      </div>
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <VersionNode
              key={c.id}
              version={c}
              childrenByParent={childrenByParent}
              currentVersionId={currentVersionId}
              openBranchIds={openBranchIds}
              pinsByVersion={pinsByVersion}
              memberNameById={memberNameById}
              focusedVersionId={focusedVersionId}
              highlightIds={highlightIds}
              onFocus={onFocus}
              onPromote={onPromote}
              onCreatePin={onCreatePin}
              onUploadToPin={onUploadToPin}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Workspace() {
  const { project, team } = useProject();
  const memberNameById = useMemo(
    () => new Map(team.members.filter((m): m is typeof m & { userId: string } => m.userId !== null).map((m) => [m.userId, m.name])),
    [team.members],
  );

  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [branches, setBranches] = useState<FileBranches[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [currentDir, setCurrentDir] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"versions" | "comments">("versions");
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [comments, setComments] = useState<FileComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editingTagFileId, setEditingTagFileId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [uploadingNewVersion, setUploadingNewVersion] = useState(false);
  const [activePresence, setActivePresence] = useState<ActivePresence[]>([]);
  const [pins, setPins] = useState<FileVersionPin[]>([]);
  const [focusedVersionId, setFocusedVersionId] = useState<string | null>(null);
  const uploadTargetPinIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newVersionInputRef = useRef<HTMLInputElement>(null);

  async function refresh(): Promise<ProjectFile[]> {
    const [filesRes, branchesRes] = await Promise.all([listFiles(project.id), listBranches(project.id)]);
    setFiles(filesRes.data);
    setBranches(branchesRes.data);
    return filesRes.data;
  }

  useEffect(() => {
    setCurrentDir(null);
    setSelectedFileId(null);
    setTagFilter(null);
    setCreatingFolder(false);
    refresh().catch(() => setError("워크스페이스 정보를 불러오지 못했습니다."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { data } = await listAllSyncPresence(project.id);
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
  }, [project.id]);

  function isFileSyncing(path: string): boolean {
    return activePresence.some((p) => rootCoversPath(p.root, path));
  }

  const branchIdsByFile = new Map(branches.map((b) => [b.file.id, new Set(b.branches.map((v) => v.id))]));
  const openBranchCount = branches.reduce((sum, b) => sum + b.branches.length, 0);
  const knownTags = Array.from(new Set(files.map((f) => f.tag).filter((t): t is string => !!t))).sort();

  const prefix = currentDir ? `${currentDir}/` : "";
  const subfolders = new Set<string>();
  const directFilesAll: ProjectFile[] = [];
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      if (rest !== KEEP_FILE) directFilesAll.push(f);
    } else {
      subfolders.add(rest.slice(0, slash));
    }
  }
  directFilesAll.sort((a, b) => a.path.localeCompare(b.path));
  const directFiles = tagFilter ? directFilesAll.filter((f) => f.tag === tagFilter) : directFilesAll;
  const folderNames = Array.from(subfolders).sort();
  const breadcrumbParts = currentDir ? currentDir.split("/") : [];

  function countRealFilesUnder(folderPath: string): number {
    const p = `${folderPath}/`;
    return files.filter((f) => f.path.startsWith(p) && f.path.split("/").pop() !== KEEP_FILE).length;
  }

  function openFolder(name: string) {
    setCurrentDir(currentDir ? `${currentDir}/${name}` : name);
    setSelectedFileId(null);
    setTagFilter(null);
  }

  function goToBreadcrumb(index: number) {
    setCurrentDir(index < 0 ? null : breadcrumbParts.slice(0, index + 1).join("/"));
    setSelectedFileId(null);
    setTagFilter(null);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setUploadError(null);
    try {
      const path = currentDir ? `${currentDir}/${name}/${KEEP_FILE}` : `${name}/${KEEP_FILE}`;
      await syncFiles(project.id, [{ path, content: "" }]);
      setNewFolderName("");
      setCreatingFolder(false);
      await refresh();
    } catch {
      setUploadError("폴더 생성에 실패했습니다.");
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      const note = uploadNote.trim() || undefined;
      const entries: { path: string; content: string; baseVersionId?: string; note?: string }[] = [];
      for (const file of Array.from(fileList)) {
        if (file.size > MAX_FILE_SIZE) {
          setUploadError(`${file.name}은(는) 용량 제한(10MB)을 초과해 업로드할 수 없습니다.`);
          continue;
        }
        let content: string;
        try {
          content = await file.text();
        } catch {
          setUploadError(`${file.name}을(를) 텍스트로 읽을 수 없습니다 (바이너리 파일은 지원하지 않습니다).`);
          continue;
        }
        const path = currentDir ? `${currentDir}/${file.name}` : file.name;
        const existing = files.find((f) => f.path === path);
        entries.push({ path, content, baseVersionId: existing?.currentVersionId ?? undefined, note });
      }
      if (entries.length > 0) {
        await syncFiles(project.id, entries);
        setUploadNote("");
        await refresh();
      }
    } catch {
      setUploadError("파일 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadNewVersion(fileList: FileList | null) {
    if (!selectedFile || !fileList || fileList.length === 0) return;
    const file = fileList[0];
    const pinId = uploadTargetPinIdRef.current;
    uploadTargetPinIdRef.current = null;
    setUploadError(null);
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`${file.name}은(는) 용량 제한(10MB)을 초과해 업로드할 수 없습니다.`);
      return;
    }
    setUploadingNewVersion(true);
    try {
      let content: string;
      try {
        content = await file.text();
      } catch {
        setUploadError(`${file.name}을(를) 텍스트로 읽을 수 없습니다 (바이너리 파일은 지원하지 않습니다).`);
        return;
      }
      const baseVersionId = pinId ? pins.find((p) => p.id === pinId)?.versionId : (selectedFile.currentVersionId ?? undefined);
      await syncFiles(project.id, [
        { path: selectedFile.path, content, baseVersionId, note: uploadNote.trim() || undefined, pinId: pinId ?? undefined },
      ]);
      setUploadNote("");
      await refresh();
      await refreshVersionsAndPins();
    } catch {
      setUploadError("새 버전 업로드에 실패했습니다.");
    } finally {
      setUploadingNewVersion(false);
    }
  }

  async function handleSaveTag(fileId: string) {
    try {
      await setFileTag(project.id, fileId, tagDraft.trim());
      setEditingTagFileId(null);
      await refresh();
    } catch {
      setUploadError("태그 저장에 실패했습니다.");
    }
  }

  useEffect(() => {
    setFocusedVersionId(null);
    if (!selectedFileId) {
      setVersions([]);
      setComments([]);
      setPins([]);
      return;
    }
    let cancelled = false;
    setLoadingVersions(true);
    Promise.all([
      listFileVersions(project.id, selectedFileId),
      listFileComments(project.id, selectedFileId),
      listFilePins(project.id, selectedFileId),
    ])
      .then(([versionsRes, commentsRes, pinsRes]) => {
        if (cancelled) return;
        setVersions(versionsRes.data);
        setComments(commentsRes.data);
        setPins(pinsRes.data);
      })
      .catch(() => {
        if (!cancelled) {
          setVersions([]);
          setComments([]);
          setPins([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, selectedFileId]);

  async function refreshVersionsAndPins() {
    if (!selectedFileId) return;
    const [versionsRes, pinsRes] = await Promise.all([
      listFileVersions(project.id, selectedFileId),
      listFilePins(project.id, selectedFileId),
    ]);
    setVersions(versionsRes.data);
    setPins(pinsRes.data);
  }

  async function handlePromote(fileId: string, versionId: string) {
    setError(null);
    try {
      await promoteVersionApi(project.id, fileId, versionId);
      await refresh();
    } catch {
      setError("버전 지정에 실패했습니다.");
    }
  }

  async function handleCreatePin(versionId: string) {
    if (!selectedFileId) return;
    try {
      await createFilePin(project.id, selectedFileId, versionId);
      await refreshVersionsAndPins();
    } catch {
      setUploadError("핀 생성에 실패했습니다.");
    }
  }

  async function handleDeletePin(pinId: string) {
    if (!selectedFileId) return;
    try {
      await deleteFilePin(project.id, selectedFileId, pinId);
      await refreshVersionsAndPins();
    } catch {
      setUploadError("핀 삭제에 실패했습니다.");
    }
  }

  function handleUploadToPin(pinId: string) {
    uploadTargetPinIdRef.current = pinId;
    newVersionInputRef.current?.click();
  }

  async function handleAddComment() {
    if (!selectedFileId || !commentDraft.trim()) return;
    try {
      await addFileComment(project.id, selectedFileId, commentDraft.trim());
      setCommentDraft("");
      const { data } = await listFileComments(project.id, selectedFileId);
      setComments(data);
    } catch {
      setUploadError("댓글 등록에 실패했습니다.");
    }
  }

  const selectedFile = selectedFileId ? (files.find((f) => f.id === selectedFileId) ?? null) : null;
  const openBranchIds = selectedFileId ? (branchIdsByFile.get(selectedFileId) ?? new Set<string>()) : new Set<string>();

  const versionChildrenByParent = new Map<string | null, FileVersion[]>();
  for (const v of versions) {
    const list = versionChildrenByParent.get(v.parentVersionId) ?? [];
    list.push(v);
    versionChildrenByParent.set(v.parentVersionId, list);
  }
  for (const list of versionChildrenByParent.values()) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rootVersions = versionChildrenByParent.get(null) ?? [];

  const pinsByVersion = new Map<string, FileVersionPin[]>();
  for (const p of pins) {
    const list = pinsByVersion.get(p.versionId) ?? [];
    list.push(p);
    pinsByVersion.set(p.versionId, list);
  }

  const effectiveFocusId = focusedVersionId ?? selectedFile?.currentVersionId ?? null;
  const versionsById = new Map(versions.map((v) => [v.id, v]));
  const highlightIds = new Set<string>();
  if (effectiveFocusId) {
    let cur: string | null = effectiveFocusId;
    while (cur) {
      highlightIds.add(cur);
      cur = versionsById.get(cur)?.parentVersionId ?? null;
    }
    for (const child of versionChildrenByParent.get(effectiveFocusId) ?? []) highlightIds.add(child.id);
  }

  const allVisibleSelected = directFiles.length > 0 && directFiles.every((f) => selectedPaths.has(f.path));

  function toggleFile(path: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const f of directFiles) {
        if (allVisibleSelected) next.delete(f.path);
        else next.add(f.path);
      }
      return next;
    });
  }

  function handleDownloadSelected() {
    for (const f of files) {
      if (selectedPaths.has(f.path)) downloadFile(f.path, f.content);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-7">
        <div className="text-xs font-600 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          파일 워크스페이스 · {project.name}
        </div>
        <h1 className="text-3xl font-600" style={{ fontFamily: "var(--font-fraunces)" }}>Workspace</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
          파일 {files.length}개 · 해소되지 않은 분기 {openBranchCount}건
        </p>
      </div>

      {error && (
        <div className="text-sm mb-4 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "var(--radius-sm)" }}>
          {error}
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm flex-wrap">
        <button onClick={() => goToBreadcrumb(-1)} className="font-700" style={{ color: currentDir ? "var(--primary)" : "var(--foreground)" }}>
          ⬡ 워크스페이스
        </button>
        {breadcrumbParts.map((part, i) => (
          <span key={i} className="flex items-center gap-2">
            <span style={{ color: "var(--muted-foreground)" }}>/</span>
            <button onClick={() => goToBreadcrumb(i)} className="font-700" style={{ color: i === breadcrumbParts.length - 1 ? "var(--foreground)" : "var(--primary)" }}>
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* 업로드 존 */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void uploadFiles(e.dataTransfer.files);
        }}
        className="mb-3 border-2 border-dashed p-5 text-center transition-all cursor-pointer"
        style={{ borderColor: dragOver ? "var(--primary)" : "var(--border)", background: dragOver ? "var(--secondary)" : "var(--card)", borderRadius: "var(--radius)" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="text-2xl mb-2">⬆</div>
        <div className="text-sm font-600">
          {uploading ? "업로드 중..." : `${currentDir ? `"${currentDir}"에 업로드` : "워크스페이스 루트에 업로드"} — 드래그하거나 클릭`}
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>텍스트 기반 파일(코드, 문서 등), 파일당 최대 10MB</div>
      </div>
      <input
        value={uploadNote}
        onChange={(e) => setUploadNote(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder="업로드 메모 (버전 노트, 선택)..."
        className="w-full text-sm px-3.5 py-2.5 outline-none mb-6"
        style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
      />
      {uploadError && <p className="text-xs mb-4" style={{ color: "#ef4444" }}>{uploadError}</p>}

      {/* 하위 폴더 그리드 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-700">폴더</h2>
          {!creatingFolder && (
            <button
              onClick={() => setCreatingFolder(true)}
              className="text-xs font-700 px-3 py-1.5 transition-all"
              style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}
            >
              + 새 폴더 만들기
            </button>
          )}
        </div>

        {creatingFolder && (
          <div className="flex gap-2 mb-3">
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              placeholder="폴더 이름"
              className="flex-1 text-sm px-3 py-2 outline-none"
              style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--muted)" }}
            />
            <button onClick={handleCreateFolder} className="text-xs font-700 px-4 py-2" style={{ borderRadius: "var(--radius-sm)", color: "#fff", background: "var(--primary)" }}>
              만들기
            </button>
            <button
              onClick={() => {
                setCreatingFolder(false);
                setNewFolderName("");
              }}
              className="text-xs font-600 px-3 py-2"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "var(--radius-sm)" }}
            >
              취소
            </button>
          </div>
        )}

        {folderNames.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {folderNames.map((name) => (
              <button
                key={name}
                onClick={() => openFolder(name)}
                className="flex items-center gap-3 p-4 text-left transition-all"
                style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
              >
                <div className="w-10 h-10 flex items-center justify-center text-lg shrink-0" style={{ background: "var(--secondary)", borderRadius: "10px" }}>📁</div>
                <div className="min-w-0">
                  <div className="text-sm font-700 truncate">{name}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    파일 {countRealFilesUnder(currentDir ? `${currentDir}/${name}` : name)}개
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 태그 필터 */}
      {knownTags.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setTagFilter(null)}
            className="text-xs font-600 px-3 py-1.5"
            style={{ borderRadius: "20px", background: tagFilter === null ? "var(--primary)" : "var(--muted)", color: tagFilter === null ? "#fff" : "var(--muted-foreground)" }}
          >
            전체
          </button>
          {knownTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className="text-xs font-600 px-3 py-1.5"
              style={{ borderRadius: "20px", background: tagFilter === t ? tagColor(t) : `${tagColor(t)}18`, color: tagFilter === t ? "#fff" : tagColor(t) }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* 파일 목록 툴바 */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-sm font-700">파일{currentDir ? ` — ${currentDir}` : ""}</h2>
        {!selectedFile && (
          <div className="flex items-center gap-2.5">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={directFiles.length === 0} />
              전체 선택
            </label>
            <button
              onClick={handleDownloadSelected}
              disabled={selectedPaths.size === 0}
              className="text-xs font-700 px-3 py-1.5"
              style={{ borderRadius: "20px", color: "#fff", background: "var(--primary)", opacity: selectedPaths.size === 0 ? 0.4 : 1 }}
            >
              다운로드 ({selectedPaths.size})
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* 파일 목록 */}
        <div className={`${selectedFile ? "lg:col-span-2" : "lg:col-span-3"} flex flex-col gap-2`}>
          {directFiles.map((f) => {
            const meta = getTypeMeta(f.path);
            const isSelected = selectedFileId === f.id;
            const fileBranchCount = branchIdsByFile.get(f.id)?.size ?? 0;
            const name = f.path.slice(prefix.length);
            const uploaderName = memberNameById.get(f.lastEditorId ?? "") ?? "알 수 없음";
            const compact = !!selectedFile;
            return (
              <div
                key={f.id}
                className={`flex items-center gap-3 transition-all ${compact ? "p-2.5" : "p-4"}`}
                style={{ background: isSelected ? "var(--primary)" : "var(--card)", color: isSelected ? "#fff" : "var(--foreground)", boxShadow: "var(--shadow-card)", borderRadius: "var(--radius)" }}
              >
                {!compact && <input type="checkbox" checked={selectedPaths.has(f.path)} onChange={() => toggleFile(f.path)} className="shrink-0" />}
                <button onClick={() => setSelectedFileId(isSelected ? null : f.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div
                    className={`flex items-center justify-center font-700 shrink-0 ${compact ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs"}`}
                    style={{ background: isSelected ? "rgba(255,255,255,0.2)" : meta.bg, color: isSelected ? "#fff" : meta.color, borderRadius: "10px" }}
                  >
                    {meta.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isFileSyncing(f.path) && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#22c55e" }} title="지금 폴더 연동으로 동기화 중인 파일입니다" />}
                      <div className="text-sm font-600 truncate">{name}</div>
                    </div>
                    {!compact && (
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap" style={{ color: isSelected ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)" }}>
                        <span className="text-xs">{uploaderName}</span>
                        <span className="text-xs">·</span>
                        <span className="text-xs">{formatDate(f.updatedAt)}</span>
                        <span className="text-xs">·</span>
                        <span className="text-xs">{formatSize(fileSize(f.content))}</span>
                      </div>
                    )}
                  </div>
                  {fileBranchCount > 0 && (
                    <span className="text-xs font-700 px-2 py-0.5 shrink-0" style={{ borderRadius: "20px", background: isSelected ? "rgba(255,255,255,0.25)" : "#ef444418", color: isSelected ? "#fff" : "#ef4444" }}>
                      분기 {fileBranchCount}
                    </span>
                  )}
                </button>
                {editingTagFileId === f.id ? (
                  <input
                    autoFocus
                    list="workspace-tag-options"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveTag(f.id)}
                    onBlur={() => handleSaveTag(f.id)}
                    placeholder="태그"
                    className="w-24 text-xs px-2 py-1 outline-none shrink-0"
                    style={{ border: "1px solid var(--border)", borderRadius: "20px", background: isSelected ? "rgba(255,255,255,0.2)" : "var(--muted)", color: isSelected ? "#fff" : "var(--foreground)" }}
                  />
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTagFileId(f.id);
                      setTagDraft(f.tag ?? "");
                    }}
                    className="text-xs font-600 px-2.5 py-1 shrink-0"
                    style={
                      f.tag
                        ? { borderRadius: "20px", background: isSelected ? "rgba(255,255,255,0.25)" : `${tagColor(f.tag)}18`, color: isSelected ? "#fff" : tagColor(f.tag) }
                        : { borderRadius: "20px", background: isSelected ? "rgba(255,255,255,0.15)" : "var(--muted)", color: isSelected ? "rgba(255,255,255,0.8)" : "var(--muted-foreground)" }
                    }
                  >
                    {f.tag ?? "+ 태그"}
                  </button>
                )}
              </div>
            );
          })}
          {directFiles.length === 0 && folderNames.length === 0 && (
            <div className="p-8 text-center text-sm border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}>
              동기화된 파일이 없습니다.
            </div>
          )}
          {directFiles.length === 0 && directFilesAll.length > 0 && (
            <div className="p-8 text-center text-sm border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}>
              이 태그의 파일이 없습니다.
            </div>
          )}
        </div>

        {/* 버전 이력 / 댓글 패널 */}
        <div className={selectedFile ? "lg:col-span-3" : "lg:col-span-2"}>
          {selectedFile ? (
            <div className="p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
              <h3 className="text-sm font-700 mb-0.5 leading-snug break-all">{selectedFile.path}</h3>
              <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                {loadingVersions ? "불러오는 중..." : `${versions.length}개 버전 · ${formatSize(fileSize(selectedFile.content))} · 최근 수정 ${formatDate(selectedFile.updatedAt)}`}
              </p>

              {detailTab === "versions" && (
                <>
                  <input
                    ref={newVersionInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      void handleUploadNewVersion(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => {
                      uploadTargetPinIdRef.current = null;
                      newVersionInputRef.current?.click();
                    }}
                    disabled={uploadingNewVersion}
                    className="w-full text-xs font-700 py-2 mb-4"
                    style={{ borderRadius: "10px", border: "2px solid var(--primary)", color: "var(--primary)", background: "transparent", opacity: uploadingNewVersion ? 0.6 : 1 }}
                  >
                    {uploadingNewVersion ? "업로드 중..." : `+ 새 버전 업로드 (${selectedFile.path.split("/").pop()} 갱신)`}
                  </button>
                </>
              )}

              <div className="flex gap-1.5 mb-3 p-1" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                {(["versions", "comments"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDetailTab(t)}
                    className="flex-1 text-xs font-700 py-1.5 transition-all"
                    style={{ background: detailTab === t ? "var(--card)" : "transparent", color: detailTab === t ? "var(--primary)" : "var(--muted-foreground)", borderRadius: "7px", boxShadow: detailTab === t ? "var(--shadow-card)" : "none" }}
                  >
                    {t === "versions" ? `버전 이력 (${versions.length})` : `댓글 (${comments.length})`}
                  </button>
                ))}
              </div>

              {detailTab === "versions" ? (
                <>
                  {pins.length > 0 && (
                    <div className="flex gap-1.5 mb-3 flex-wrap">
                      {pins.map((p) => (
                        <span key={p.id} className="flex items-center gap-1.5 text-xs font-600 pl-2.5 pr-1.5 py-1" style={{ borderRadius: "20px", background: "#8b5cf618", color: "#8b5cf6" }}>
                          📌 {p.label}
                          <button onClick={() => handleDeletePin(p.id)} className="w-4 h-4 flex items-center justify-center rounded-full">
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="version-tree-scroll overflow-auto max-h-80">
                    <ul className="version-tree">
                      {rootVersions.map((v) => (
                        <VersionNode
                          key={v.id}
                          version={v}
                          childrenByParent={versionChildrenByParent}
                          currentVersionId={selectedFile.currentVersionId}
                          openBranchIds={openBranchIds}
                          pinsByVersion={pinsByVersion}
                          memberNameById={memberNameById}
                          focusedVersionId={effectiveFocusId}
                          highlightIds={highlightIds}
                          onFocus={setFocusedVersionId}
                          onPromote={(versionId) => handlePromote(selectedFile.id, versionId)}
                          onCreatePin={handleCreatePin}
                          onUploadToPin={handleUploadToPin}
                        />
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700 shrink-0" style={{ background: "var(--secondary)", color: "var(--primary)" }}>
                        {(memberNameById.get(c.authorId) ?? "?").slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-700">{memberNameById.get(c.authorId) ?? c.authorId}</span>
                          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{formatDate(c.createdAt)}</span>
                        </div>
                        <p className="text-xs mt-0.5 leading-relaxed px-3 py-2" style={{ background: "var(--muted)", borderRadius: "10px" }}>{c.content}</p>
                      </div>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <div className="text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>아직 댓글이 없어요. 첫 코멘트를 남겨보세요.</div>
                  )}
                  <div className="flex gap-2 mt-1">
                    <input
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                      placeholder="이 파일에 코멘트 남기기..."
                      className="flex-1 text-xs px-3 py-2 outline-none"
                      style={{ background: "var(--muted)", borderRadius: "20px" }}
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={!commentDraft.trim()}
                      className="px-3 text-xs font-700 shrink-0"
                      style={{ borderRadius: "20px", color: "#fff", background: "var(--primary)", opacity: commentDraft.trim() ? 1 : 0.4 }}
                    >
                      등록
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className="p-8 text-center h-full flex flex-col items-center justify-center border-2 border-dashed"
              style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
            >
              <div className="text-3xl mb-3">⬡</div>
              <div className="text-sm font-600">파일을 선택하면</div>
              <div className="text-sm">버전 이력과 댓글을 확인할 수 있어요</div>
            </div>
          )}
        </div>
      </div>

      <datalist id="workspace-tag-options">
        {knownTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
