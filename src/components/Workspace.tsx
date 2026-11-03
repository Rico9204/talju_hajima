import SearchHighlight from "./SearchHighlight";
import { matchesWorkspaceSearch, currentFileText, contentSnippet } from "../lib/workspaceSearch";
import WorkspaceComments from "./WorkspaceComments";
import FileUploadDialog from "./FileUploadDialog";
import { folderSubtree, isCodeFile, latestFileUploadTime, reorderIds, sortFolders, sortWorkspaceFiles, extBadgeLabel, type FileSortOption } from "../lib/workspaceFiles";
import { lazy, Suspense, useEffect, useLayoutEffect, useState, useRef } from "react";
import WorkspaceDeleteActions, { WorkspaceCleanupNotice } from "./WorkspaceDeleteActions";
import FileTagEditor from "./FileTagEditor";
import FileVersionPanel from "./FileVersionPanel";
import WorkspaceLocalSync, { type LocalSyncHandle } from "./WorkspaceLocalSync";
import { useConfirm } from "./ConfirmDialog";
import QuickEditModal from "./QuickEditModal";
import { isRichDocName, newRichDocBytes, RICH_DOC_EXT, RICH_DOC_MIME } from "../lib/richDoc";
import { isSlidesName, newSlidesBytes, SLIDES_EXT, SLIDES_MIME } from "../lib/slidesDoc";
import { collabImageName, type CollabImageStore } from "../lib/collabImages";
import { MAX_SEARCH_TEXT } from "../lib/workspaceSearch";
import EditorAvatars from "./EditorAvatars";
import { joinCollabPresence, type CollabEditor, type CollabMode, type CollabPresence } from "../lib/collab";
import OfficeEditorModal, { isOfficeEditable, officeEditorEnabled } from "./OfficeEditorModal";
import { type OfficeFileKind, OFFICE_FILE_CONFIG, createEmptyOfficeBytes } from "../lib/newOfficeFiles.ts";

export type NewItemKind = CollabFileKind | OfficeFileKind;

export interface NewItemState {
  kind: NewItemKind;
  name: string;
}
import { useProject, type FileVersion, type Folder, type WorkspaceFile } from "../context/ProjectContext";
import { useAccountBackground } from "../lib/useAccountBackground";

const typeColors: Record<string, { bg: string; color: string; label: string }> = {
  pdf: { bg: "#ef444418", color: "#ef4444", label: "PDF" },
  doc: { bg: "#3d52d518", color: "#3d52d5", label: "DOC" },
  ppt: { bg: "#f0a50018", color: "#f0a500", label: "PPT" },
  xls: { bg: "#22c55e18", color: "#22c55e", label: "XLS" },
  zip: { bg: "#8b5cf618", color: "#8b5cf6", label: "ZIP" },
  img: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  code: { bg: "#0d948818", color: "#0d9488", label: "CODE" },
  text: { bg: "#64748b18", color: "#64748b", label: "TXT" },
};
// 텍스트·코드·이미지 파일은 DOC·IMG 대신 확장자 이름(TXT, CSV, JAVA, PNG …)으로 표시한다. 색은 코드 / CSV(표) / 이미지 / 그 밖의 글로 나눈다.
function fileBadge(f: { name: string; type: string }) {
  const label = extBadgeLabel(f.name);
  if (!label) return typeColors[f.type] || typeColors.doc;
  const tone = isCodeFile(f.name) ? typeColors.code : f.type === "xls" || f.type === "img" ? typeColors[f.type] : typeColors.text;
  return { ...tone, label };
}

const tagColors: Record<string, string> = {
  보고서: "#3d52d5",
  기획: "#f0a500",
  데이터: "#22c55e",
  사진: "#8b5cf6",
  회의록: "#6b7280",
  전사: "#2563eb",
  영상: "#ef4444",
};

// 문서 편집기(TipTap)는 무거워서 문서를 열 때만 불러온다.
const DocEditorModal = lazy(() => import("./DocEditorModal"));
const SlidesEditorModal = lazy(() => import("./SlidesEditorModal"));
const PresentationModal = lazy(() => import("./PresentationModal"));
import { isPresentationFile } from "./PresentationModal";

// 앱 안에서 함께 편집하는 파일 종류: 문서(.rtdoc), 슬라이드(.slides)
type CollabFileKind = "doc" | "slides";
const COLLAB_FILE = {
  doc: { ext: RICH_DOC_EXT, mime: RICH_DOC_MIME, label: "문서", newBytes: newRichDocBytes },
  slides: { ext: SLIDES_EXT, mime: SLIDES_MIME, label: "슬라이드", newBytes: newSlidesBytes },
} as const;
const collabKindOf = (name: string): CollabFileKind | null => (isRichDocName(name) ? "doc" : isSlidesName(name) ? "slides" : null);

// 워크스페이스 안에서 끄는 항목(바탕화면에서 끌어온 새 파일과 구분하는 표시).
const ITEM_DRAG_TYPE = "application/x-talju-workspace-item";
type DragItem = { kind: "files"; ids: number[] } | { kind: "folder"; id: number };
type DropSpot = { into: number | "root" } | { kind: "folder" | "file"; id: number; place: "before" | "after" };

export interface WorkspaceFocus {
  fileId: number;
  folderId: number | null;
}

export interface FileClipboard {
  action: "copy" | "cut";
  files: WorkspaceFile[];
}

function createDragGhost(name: string, count: number, isCollab: boolean): HTMLElement {
  const ghost = document.createElement("div");
  ghost.style.position = "fixed";
  ghost.style.top = "-9999px";
  ghost.style.left = "-9999px";
  ghost.style.zIndex = "99999";
  ghost.style.display = "flex";
  ghost.style.alignItems = "center";
  ghost.style.gap = "8px";
  ghost.style.padding = "8px 14px";
  ghost.style.borderRadius = "12px";
  ghost.style.background = "#1e293b";
  ghost.style.color = "#ffffff";
  ghost.style.boxShadow = "0 10px 25px -3px rgba(0, 0, 0, 0.45), 0 0 0 2px #3b82f6";
  ghost.style.fontFamily = "system-ui, -apple-system, sans-serif";
  ghost.style.fontSize = "13px";
  ghost.style.fontWeight = "600";
  ghost.style.pointerEvents = "none";
  ghost.style.whiteSpace = "nowrap";

  const icon = document.createElement("span");
  icon.style.fontSize = "16px";
  icon.textContent = count > 1 ? "📑" : (isCollab ? "📝" : "📄");
  ghost.appendChild(icon);

  const nameSpan = document.createElement("span");
  nameSpan.style.maxWidth = "220px";
  nameSpan.style.overflow = "hidden";
  nameSpan.style.textOverflow = "ellipsis";
  nameSpan.textContent = count > 1 ? (name + " 외 " + (count - 1) + "개") : name;
  ghost.appendChild(nameSpan);

  if (count > 1) {
    const badge = document.createElement("span");
    badge.style.background = "#3b82f6";
    badge.style.color = "#ffffff";
    badge.style.padding = "1px 7px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "11px";
    badge.style.fontWeight = "700";
    badge.textContent = "+" + (count - 1);
    ghost.appendChild(badge);
  }

  document.body.appendChild(ghost);
  return ghost;
}

function getCopyFileName(originalName: string, existingNames: Set<string>, isSameFolder: boolean): string {
  const dotIndex = originalName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
  const ext = dotIndex > 0 ? originalName.slice(dotIndex) : "";

  // 다른 폴더로 복사할 때 동일한 이름의 파일이 없다면 기존 이름 유지
  if (!isSameFolder && !existingNames.has(originalName)) {
    return originalName;
  }

  // 동일한 폴더이거나 대상 폴더에 이미 동일 이름이 있는 경우 " - 복사본" 추가
  const firstCandidate = `${baseName} - 복사본${ext}`;
  if (!existingNames.has(firstCandidate)) {
    return firstCandidate;
  }

  let counter = 2;
  while (existingNames.has(`${baseName} - 복사본 (${counter})${ext}`)) {
    counter++;
  }
  return `${baseName} - 복사본 (${counter})${ext}`;
}

function getFileTypeDescription(f: WorkspaceFile): string {
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  if (isRichDocName(f.name)) return "문서 (Slackerspace Doc)";
  if (isSlidesName(f.name)) return "슬라이드 (Slackerspace Slides)";
  if (ext === "pdf") return "PDF 문서";
  if (["doc", "docx"].includes(ext)) return "Microsoft Word 문서";
  if (["ppt", "pptx"].includes(ext)) return "PowerPoint 프레젠테이션";
  if (["xls", "xlsx", "csv"].includes(ext)) return "Excel 스프레드시트";
  if (["hwp", "hwpx"].includes(ext)) return "한글 문서 (HWP)";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return `${ext.toUpperCase()} 이미지`;
  if (["zip", "7z", "tar", "gz", "rar"].includes(ext)) return "압축(ZIP) 폴더";
  if (["md", "markdown"].includes(ext)) return "Markdown 문서";
  if (["txt", "log"].includes(ext)) return "텍스트 문서";
  if (isCodeFile(f.name)) return `${ext.toUpperCase()} 소스 코드`;
  return `${ext ? ext.toUpperCase() + " " : ""}파일`;
}

export default function Workspace({ focusFile }: { focusFile?: WorkspaceFocus | null }) {
  const { project, folders, files, addFolder, uploadWorkspaceFile, currentMember, isManager, deleteWorkspaceFile, deleteWorkspaceFolder, markSectionViewed, downloadFileVersion, moveWorkspaceFiles, moveWorkspaceFolder, reorderWorkspaceItems, loading } = useProject();
  const { lineSafeStyle } = useAccountBackground();
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [ask, confirmDialog] = useConfirm();
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState("");
  const folderPending = useRef(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState("");
  const [detailTab, setDetailTab] = useState<"versions" | "comments">("versions");
  // 버전 "페이지" 보기에서 지금 보고 있는 버전 — 댓글 탭의 "이 버전" 기준. null이면 현재 버전.
  const [viewingVersionId, setViewingVersionId] = useState<number | null>(null);
  // 바로 수정(동시 편집): 프로젝트 단위 presence로 "누가 어떤 파일을 수정 중인지"를 공유한다.
  const [editors, setEditors] = useState<CollabEditor[]>([]);
  const presenceRef = useRef<CollabPresence | null>(null);
  const [editing, setEditing] = useState<{ fileId: number; room: number; mode: CollabMode; initialText: string } | null>(null);
  const [docEditing, setDocEditing] = useState<{ kind: CollabFileKind; fileId: number; room: number; mode: CollabMode; bytes: Uint8Array } | null>(null);
  const [newItem, setNewItem] = useState<NewItemState | null>(null); // null = 새 항목 입력창 닫힘
  const [docBusy, setDocBusy] = useState(false);
  const [officeEnabled, setOfficeEnabled] = useState(false);
  const [officeEditingFile, setOfficeEditingFile] = useState<{ id: number; name: string } | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void officeEditorEnabled().then((on) => { if (active) setOfficeEnabled(on); });
    return () => { active = false; };
  }, []);

  function startCreatingFolder() {
    setNewItem(null);
    setNewFolderName("");
    setFolderError("");
    setCreatingFolder(true);
    setTimeout(() => newFolderInputRef.current?.focus(), 0);
  }

  function startCreatingItem(kind: NewItemKind) {
    setCreatingFolder(false);
    setNewFolderName("");
    setFolderError("");
    setNewItem({ kind, name: "" });
    setTimeout(() => newItemInputRef.current?.focus(), 0);
  }

  function cancelCreation() {
    setCreatingFolder(false);
    setNewFolderName("");
    setFolderError("");
    setNewItem(null);
  }

  function getItemMeta(kind: NewItemKind) {
    if (kind === "doc") {
      return {
        icon: "📄",
        placeholder: "새 문서 이름 (예: 회의록)",
        label: "문서 (Slackerspace Doc)",
        ext: "rtdoc",
        defaultName: "새 문서",
        isOffice: false,
      };
    }
    if (kind === "slides") {
      return {
        icon: "🖼️",
        placeholder: "새 슬라이드 이름 (예: 중간발표)",
        label: "슬라이드 (Slackerspace Slides)",
        ext: "rtslides",
        defaultName: "새 슬라이드",
        isOffice: false,
      };
    }
    const cfg = OFFICE_FILE_CONFIG[kind];
    return {
      icon: cfg.icon,
      placeholder: cfg.placeholder,
      label: cfg.label,
      ext: cfg.ext,
      defaultName: cfg.defaultName,
      mime: cfg.mime,
      isOffice: true,
    };
  }
  // 끌어서 옮기기·순서 바꾸기: 끌고 있는 것(파일 여러 개 또는 폴더 하나)과 지금 놓으려는 곳.
  // into = 그 폴더 안으로("root" = 워크스페이스 루트), before/after = 같은 목록에서 그 항목 앞/뒤로(순서 바꾸기).
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [dropSpot, setDropSpot] = useState<DropSpot | null>(null);
  // 끌어서 여러 파일 고르기(빈 곳에서 시작한 사각형). 화면 좌표가 아니라 목록 안쪽(스크롤 포함) 좌표.
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const bandRef = useRef<{ x0: number; y0: number; base: Set<number>; moved: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<LocalSyncHandle>(null);
  const anchorRef = useRef<number | null>(null); // Shift+클릭 범위 선택의 시작 파일
  const [moveError, setMoveError] = useState("");
  const [editError, setEditError] = useState("");
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [detailPanelHeight, setDetailPanelHeight] = useState<{ key: string; height: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<FileSortOption>("manual");
  const [dragOver, setDragOver] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const activeProjectRef = useRef(project.id);
  activeProjectRef.current = project.id;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Windows 탐색기 스타일 새로 만들기 드롭다운 및 우클릭 컨텍스트 메뉴 상태
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target?: { kind: "folder"; folder: Folder } | { kind: "file"; file: WorkspaceFile } | null;
  } | null>(null);
  const [showDetailsPane, setShowDetailsPane] = useState(true);
  const [presentingFile, setPresentingFile] = useState<WorkspaceFile | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 파일 클립보드 (복사 / 잘라내기 / 붙여넣기)
  const [clipboard, setClipboard] = useState<FileClipboard | null>(null);
  const [clipboardBusy, setClipboardBusy] = useState(false);
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);

  const handleCopyRef = useRef<(file?: WorkspaceFile) => void>(() => {});
  const handleCutRef = useRef<(file?: WorkspaceFile) => void>(() => {});
  const handlePasteRef = useRef<(targetFolderId: number | null) => Promise<void>>(async () => {});
  const currentFolderIdRef = useRef<number | null>(null);
  currentFolderIdRef.current = currentFolderId;
  const clipboardRef = useRef<FileClipboard | null>(null);
  clipboardRef.current = clipboard;

  // 프로젝트 변경 시 클립보드 초기화
  useEffect(() => {
    setClipboard(null);
  }, [project.id]);

  // 클립보드 알림 메시지 3초 후 자동 소멸
  useEffect(() => {
    if (!clipboardMessage) return;
    const t = setTimeout(() => setClipboardMessage(null), 3000);
    return () => clearTimeout(t);
  }, [clipboardMessage]);

  // 폴더 이동 히스토리 (뒤로 / 앞으로)
  const [folderHistory, setFolderHistory] = useState<{ past: (number | null)[]; future: (number | null)[] }>({
    past: [],
    future: [],
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (contextMenu && !contextMenuRef.current?.contains(e.target as Node)) {
        setContextMenu(null);
      }
      if (showNewMenu && !newMenuRef.current?.contains(e.target as Node)) {
        setShowNewMenu(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (contextMenu) {
          setContextMenu(null);
        } else if (clipboardRef.current) {
          setClipboard(null);
        }
        setShowNewMenu(false);
        return;
      }
      // 입력 폼이나 텍스트 편집 중에는 단축키 가로채지 않음
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      // 모달 편집창 열려있을 때 방지
      if (editing || docEditing || presentingFile) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopyRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        handleCutRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void handlePasteRef.current(currentFolderIdRef.current);
      }
    }
    window.addEventListener("pointerdown", handleClickOutside, true);
    window.addEventListener("mousedown", handleClickOutside, true);
    window.addEventListener("click", handleClickOutside, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handleClickOutside, true);
      window.removeEventListener("mousedown", handleClickOutside, true);
      window.removeEventListener("click", handleClickOutside, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu, showNewMenu, editing, docEditing, presentingFile]);

  // Keep enough scrollable space when filters, deletion or a shorter detail
  // panel remove content. Observe child-driven changes as well as React renders.
  useLayoutEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    let width = 0;
    let height = 0;
    function retainHeight() {
      if (!element) return;
      const nextWidth = element.getBoundingClientRect().width;
      if (nextWidth !== width) {
        width = nextWidth;
        height = 0;
        element.style.minHeight = "";
      }
      height = Math.max(height, Math.ceil(element.getBoundingClientRect().height));
      const minimum = `${height}px`;
      if (element.style.minHeight !== minimum) element.style.minHeight = minimum;
    }
    retainHeight();
    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(retainHeight);
    });
    observer.observe(element);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      element.style.minHeight = "";
    };
  }, [project.id]);

  useEffect(() => {
    setSearchQuery("");
    setPendingUpload(null);
    setCurrentFolderId(null);
    setSelected(null);
    setFilterTag(null);
    setSortBy("manual");
    cancelCreation();
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkDeleteError("");
  }, [project.id]);

  useEffect(() => {
    if (!currentMember) return;
    const memberId = String(currentMember.id ?? (currentMember as unknown as { userId?: string }).userId ?? "1");
    const memberName = currentMember.name ?? "나";
    const presence = joinCollabPresence(project.id, { id: memberId, name: memberName }, setEditors);
    presenceRef.current = presence;
    return () => { presence.leave(); presenceRef.current = null; setEditors([]); setEditing(null); setDocEditing(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, currentMember?.id]);

  async function startQuickEdit(f: WorkspaceFile, mode: CollabMode, pinVersion?: FileVersion) {
    setEditError("");
    try {
      const room = mode === "pin"
        ? pinVersion?.id
        : editors.find((e) => e.fileId === f.id && e.mode === "main")?.room ?? f.versions.find((v) => v.current)?.id;
      const base = f.versions.find((v) => v.id === room);
      if (!base) throw new Error("수정할 버전을 찾지 못했습니다.");
      const blob = await downloadFileVersion(base.id);
      const kind = collabKindOf(base.originalName ?? f.name);
      if (kind) {
        setDocEditing({ kind, fileId: f.id, room: base.id, mode, bytes: new Uint8Array(await blob.arrayBuffer()) });
        return;
      }
      setEditing({ fileId: f.id, room: base.id, mode, initialText: await blob.text() });
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "바로 수정을 시작하지 못했습니다.");
    }
  }

  // 문서·슬라이드 저장: 문서 상태 바이트를 새 버전으로 올리고, 검색·버전 비교용 글자를 함께 넘긴다.
  async function saveCollabFile(kind: CollabFileKind, f: WorkspaceFile, bytes: Uint8Array, text: string, baseVersionId: number, auto: boolean): Promise<number> {
    const { mime, label } = COLLAB_FILE[kind];
    const result = await uploadWorkspaceFile({
      file: new File([new Uint8Array(bytes)], f.name, { type: mime }),
      fileId: f.id, folderId: f.folderId, baseVersionId, note: auto ? `${label} 자동 저장` : `${label} 저장`, tags: f.tags,
      extractedText: { text: text.slice(0, MAX_SEARCH_TEXT), status: text.length > MAX_SEARCH_TEXT ? "partial" : "ready" },
    });
    return result.versionId;
  }

  // 문서·슬라이드에 넣는 이미지: 그 문서와 같은 폴더에 워크스페이스 이미지로 올린다(이미지는 태그가 하나 이상 필요).
  function collabImages(kind: CollabFileKind, f: WorkspaceFile): CollabImageStore {
    const { label } = COLLAB_FILE[kind];
    return {
      upload: async (image) => {
        const result = await uploadWorkspaceFile({
          file: new File([image], collabImageName(f.name, image), { type: image.type }),
          folderId: f.folderId, note: `${f.name}에 넣은 이미지`, tags: [`${label} 이미지`],
        });
        return result.versionId;
      },
      load: downloadFileVersion,
    };
  }

  // 새 문서·슬라이드 또는 MS 오피스 파일: 빈 파일을 지금 폴더에 올리고 바로 편집기를 연다.
  async function handleCreateItem() {
    if (!newItem || locked || docBusy) return;
    const meta = getItemMeta(newItem.kind);
    const rawName = newItem.name.trim().replace(/[\\/]/g, "") || meta.defaultName;
    const finalName = rawName.toLowerCase().endsWith(`.${meta.ext}`) ? rawName : `${rawName}.${meta.ext}`;

    setDocBusy(true);
    setEditError("");
    try {
      if (meta.isOffice) {
        const bytes = createEmptyOfficeBytes(newItem.kind as OfficeFileKind);
        const result = await uploadWorkspaceFile({
          file: new File([bytes as unknown as BlobPart], finalName, { type: meta.mime }),
          folderId: currentFolderId,
          note: `새 ${meta.label}`,
          tags: [],
          extractedText: { text: "", status: "ready" },
        });
        cancelCreation();
        setSelected(result.fileId);
        setDetailTab("versions");
        if (officeEnabled) {
          setOfficeEditingFile({ id: result.fileId, name: finalName });
        }
      } else {
        const kind = newItem.kind as CollabFileKind;
        const { mime, label, newBytes } = COLLAB_FILE[kind];
        const bytes = newBytes();
        const result = await uploadWorkspaceFile({
          file: new File([new Uint8Array(bytes)], finalName, { type: mime }),
          folderId: currentFolderId,
          note: `새 ${label}`,
          tags: [],
          extractedText: { text: "", status: "ready" },
        });
        cancelCreation();
        setSelected(result.fileId);
        setDetailTab("versions");
        setDocEditing({ kind, fileId: result.fileId, room: result.versionId, mode: "main", bytes });
      }
    } catch (e) {
      setEditError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? `${meta.label}를 만들지 못했습니다.`);
    } finally {
      setDocBusy(false);
    }
  }

  const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? fallback);

  // 복사 (Ctrl+C / 우클릭 메뉴)
  function handleCopy(targetFile?: WorkspaceFile) {
    let toCopy: WorkspaceFile[] = [];
    if (targetFile) {
      if (selectedIds.has(targetFile.id) && visibleSelected.length > 1) {
        toCopy = visibleSelected;
      } else {
        toCopy = [targetFile];
      }
    } else if (visibleSelected.length > 0) {
      toCopy = visibleSelected;
    } else if (selected) {
      const f = files.find((x) => x.id === selected);
      if (f) toCopy = [f];
    }
    if (toCopy.length === 0) return;

    setClipboard({ action: "copy", files: toCopy });
    setClipboardMessage(`${toCopy.length === 1 ? `"${toCopy[0].name}"` : `${toCopy.length}개 파일`} 복사됨`);
  }
  handleCopyRef.current = handleCopy;

  // 잘라내기 (Ctrl+X / 우클릭 메뉴)
  function handleCut(targetFile?: WorkspaceFile) {
    let toCut: WorkspaceFile[] = [];
    if (targetFile) {
      if (selectedIds.has(targetFile.id) && visibleSelected.length > 1) {
        toCut = visibleSelected;
      } else {
        toCut = [targetFile];
      }
    } else if (visibleSelected.length > 0) {
      toCut = visibleSelected;
    } else if (selected) {
      const f = files.find((x) => x.id === selected);
      if (f) toCut = [f];
    }
    if (toCut.length === 0) return;

    setClipboard({ action: "cut", files: toCut });
    setClipboardMessage(`${toCut.length === 1 ? `"${toCut[0].name}"` : `${toCut.length}개 파일`} 잘라내기됨`);
  }
  handleCutRef.current = handleCut;

  // 붙여넣기 (Ctrl+V / 우클릭 메뉴 / 인라인 바)
  async function handlePaste(targetFolderId: number | null) {
    if (!clipboard || clipboard.files.length === 0 || clipboardBusy || locked) return;

    setClipboardBusy(true);
    setMoveError("");
    try {
      if (clipboard.action === "cut") {
        const actuallyMoving = clipboard.files.filter((f) => f.folderId !== targetFolderId);
        if (actuallyMoving.length > 0) {
          const failed = await moveWorkspaceFiles(actuallyMoving.map((f) => f.id), targetFolderId);
          if (failed > 0) {
            setMoveError(`${failed}개 파일을 옮기지 못했습니다.`);
          } else {
            setClipboardMessage(`${actuallyMoving.length === 1 ? `"${actuallyMoving[0].name}"` : `${actuallyMoving.length}개 파일`} 이동 완료`);
          }
        }
        setClipboard(null);
      } else if (clipboard.action === "copy") {
        const existingNames = new Set(
          files.filter((f) => f.folderId === targetFolderId).map((f) => f.name)
        );

        for (const file of clipboard.files) {
          const cur = file.versions.find((v) => v.current) ?? file.versions[0];
          if (!cur) continue;

          const blob = await downloadFileVersion(cur.id);
          const isSameFolder = file.folderId === targetFolderId;
          const newName = getCopyFileName(cur.originalName ?? file.name, existingNames, isSameFolder);
          existingNames.add(newName);

          const newFile = new File([blob], newName, { type: blob.type || "application/octet-stream" });
          await uploadWorkspaceFile({
            file: newFile,
            folderId: targetFolderId,
            note: `${file.name} 복사본`,
            tags: file.tags,
          });
        }

        setClipboardMessage(
          `${clipboard.files.length === 1 ? `"${clipboard.files[0].name}"` : `${clipboard.files.length}개 파일`} 복사 완료`
        );
      }
    } catch (e) {
      setMoveError(errorText(e, "붙여넣기에 실패했습니다."));
    } finally {
      setClipboardBusy(false);
    }
  }
  handlePasteRef.current = handlePaste;

  // 파일들을 다른 폴더(null = 워크스페이스 루트)로 옮긴다. 끌어서 놓기와 상세 패널의 "폴더 이동"이 함께 쓴다.
  async function moveFiles(ids: number[], folderId: number | null) {
    const moving = ids.filter((id) => files.find((f) => f.id === id)?.folderId !== folderId);
    if (locked || moving.length === 0) return;
    setMoveError("");
    try {
      const failed = await moveWorkspaceFiles(moving, folderId);
      if (failed > 0) setMoveError(`${failed}개 파일을 옮기지 못했습니다. 다시 시도해 주세요.`);
    } catch (e) {
      setMoveError(errorText(e, "파일을 옮기지 못했습니다."));
    }
  }

  // 폴더를 다른 폴더 안(null = 루트)으로. 자기 자신·하위 폴더 안으로는 화면에서도 막는다(DB도 다시 검사).
  async function moveFolder(id: number, parentId: number | null) {
    const folder = folders.find((f) => f.id === id);
    if (locked || !folder || folder.parentId === parentId) return;
    if (parentId !== null && folderSubtree(folders, id).has(parentId)) { setMoveError("폴더를 자기 자신이나 하위 폴더 안으로 옮길 수 없습니다."); return; }
    setMoveError("");
    try {
      await moveWorkspaceFolder(id, parentId);
    } catch (e) {
      setMoveError(errorText(e, "폴더를 옮기지 못했습니다."));
    }
  }

  async function reorder(kind: "folder" | "file", ids: number[]) {
    setMoveError("");
    try {
      await reorderWorkspaceItems(kind, ids);
    } catch (e) {
      setMoveError(errorText(e, "순서를 바꾸지 못했습니다."));
    }
  }

  // 놓을 수 있는지: 폴더는 자기 자신·하위 폴더 안으로 못 들어간다.
  function canDropInto(item: DragItem | null, target: number | "root"): boolean {
    if (!item || locked) return false;
    if (item.kind === "folder" && target !== "root" && folderSubtree(folders, item.id).has(target)) return false;
    return true;
  }
  function dropInto(item: DragItem, target: number | "root") {
    const folderId = target === "root" ? null : target;
    if (item.kind === "files") { void moveFiles(item.ids, folderId); setSelectedIds(new Set()); }
    else void moveFolder(item.id, folderId);
  }
  function endDrag() { setDragging(null); setDropSpot(null); }

  // 폴더·경로·"상위 폴더로" 버튼에 놓으면 그 안으로 옮긴다.
  // 끌고 있는 것이 워크스페이스 항목일 때만 반응한다(바탕화면에서 끌어온 새 파일 업로드와 구분).
  function dropHandlers(target: number | "root") {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(ITEM_DRAG_TYPE) || !canDropInto(dragging, target)) return;
        e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropSpot({ into: target });
      },
      onDragLeave: () => setDropSpot((cur) => (cur && "into" in cur && cur.into === target ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        if (!dragging || !canDropInto(dragging, target)) return;
        e.preventDefault(); e.stopPropagation();
        const item = dragging; endDrag();
        dropInto(item, target);
      },
    };
  }
  const isInto = (target: number | "root") => !!dropSpot && "into" in dropSpot && dropSpot.into === target;
  const dropStyle = (target: number | "root") =>
    isInto(target)
      ? {
          outline: "2px solid var(--primary)",
          outlineOffset: "-2px",
          background: "color-mix(in srgb, var(--primary) 22%, var(--card))",
          boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.35)",
          transform: "scale(1.015)",
          transition: "all 0.15s ease",
        }
      : {};
  const isSpot = (kind: "folder" | "file", id: number, place: "before" | "after") => !!dropSpot && !("into" in dropSpot) && dropSpot.kind === kind && dropSpot.id === id && dropSpot.place === place;

  // 폴더 카드: 폴더를 끌어 카드 왼쪽·오른쪽 가장자리에 놓으면 순서 바꾸기, 가운데(또는 파일)는 그 폴더 안으로.
  function folderCardDragOver(e: React.DragEvent, target: Folder) {
    if (!e.dataTransfer.types.includes(ITEM_DRAG_TYPE) || !dragging || locked) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratioY = (e.clientY - rect.top) / rect.height;
    if (dragging.kind === "folder" && dragging.id !== target.id && (ratioY < 0.25 || ratioY > 0.75)) {
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      setDropSpot({ kind: "folder", id: target.id, place: ratioY < 0.25 ? "before" : "after" });
      return;
    }
    if (!canDropInto(dragging, target.id)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropSpot({ into: target.id });
  }
  function folderCardDrop(e: React.DragEvent, target: Folder) {
    if (!dragging || !dropSpot) return;
    e.preventDefault(); e.stopPropagation();
    const item = dragging, spot = dropSpot; endDrag();
    if ("into" in spot) { if (canDropInto(item, target.id)) dropInto(item, target.id); return; }
    if (item.kind === "folder") void reorder("folder", reorderIds(childFolders.map((f) => f.id), [item.id], target.id, spot.place));
  }

  // 파일 줄: 같은 목록 안에서 위·아래 절반에 놓으면 순서 바꾸기. 검색·태그로 일부만 보일 때는 순서를 바꾸지 않는다.
  function fileRowDragOver(e: React.DragEvent, target: WorkspaceFile) {
    if (!e.dataTransfer.types.includes(ITEM_DRAG_TYPE) || dragging?.kind !== "files" || !canReorderFiles || dragging.ids.includes(target.id)) return;
    if (!dragging.ids.every((id) => scoped.some((f) => f.id === id))) return; // 다른 폴더의 파일(검색 결과에서 끈 것)
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropSpot({ kind: "file", id: target.id, place: e.clientY - rect.top < rect.height / 2 ? "before" : "after" });
  }
  function fileRowDrop(e: React.DragEvent, target: WorkspaceFile) {
    if (dragging?.kind !== "files" || !dropSpot || "into" in dropSpot || dropSpot.kind !== "file") return;
    e.preventDefault(); e.stopPropagation();
    const item = dragging, spot = dropSpot; endDrag();
    // 지금 보이는 순서(정렬 기준이 무엇이든)를 바탕으로 바꾸고, 그때부터는 "직접 정렬"로 보여 준다.
    void reorder("file", reorderIds(sortedFiles.map((f) => f.id), item.ids, target.id, spot.place));
    setSortBy("manual");
  }

  // 파일을 끌기 시작: 여러 개를 골라 둔 상태에서 그중 하나를 끌면 고른 파일 전부를 함께 옮긴다.
  function startFileDrag(e: React.DragEvent, f: WorkspaceFile) {
    const ids = selectedIds.has(f.id) && visibleSelected.length > 1 ? visibleSelected.map((x) => x.id) : [f.id];
    e.dataTransfer.setData(ITEM_DRAG_TYPE, "files");
    e.dataTransfer.effectAllowed = "move";
    const ghost = createDragGhost(f.name, ids.length, !!collabKindOf(f.name));
    e.dataTransfer.setDragImage(ghost, 20, 20);
    setTimeout(() => ghost.remove(), 0);
    setDragging({ kind: "files", ids });
  }

  // 파일 누르기: 그냥 누르면 하나만 열고, Ctrl/⌘는 하나씩 더하거나 빼고, Shift는 마지막으로 누른 파일부터 범위로 고른다.
  function clickFile(e: React.MouseEvent, f: WorkspaceFile, deletable: boolean) {
    if (contextMenu) setContextMenu(null);
    if (selectMode) { if (deletable) toggleSelected(f.id); return; }
    if (e.shiftKey && anchorRef.current !== null) {
      const order = sortedFiles.map((x) => x.id);
      const [from, to] = [order.indexOf(anchorRef.current), order.indexOf(f.id)].sort((a, b) => a - b);
      if (from >= 0) { setSelectedIds(new Set(order.slice(from, to + 1))); return; }
    }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedIds);
      if (selected !== null && next.size === 0) next.add(selected); // 열어 둔 파일부터 함께 고른다
      if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
      setSelectedIds(next);
      anchorRef.current = f.id;
      return;
    }
    anchorRef.current = f.id;
    setSelectedIds(new Set());
    setSelected(selected === f.id ? null : f.id); setDetailTab("versions");
  }

  // 목록의 빈 곳(파일 사이·아래)에서 끌기 시작하면 사각형으로 여러 파일을 고른다. Ctrl/⌘/Shift를 누르고 있으면 기존 선택에 더한다.
  function startBand(e: React.PointerEvent<HTMLDivElement>) {
    if (contextMenu) {
      setContextMenu(null);
      return;
    }
    const list = listRef.current;
    // 마우스로만(터치로 시작하면 목록을 스크롤할 수 없다). 파일 줄·폴더 줄·새로만들기 줄·버튼·입력창 위에서 누른 것은 제외.
    const target = e.target as HTMLElement | null;
    if (
      e.pointerType !== "mouse" ||
      e.button !== 0 ||
      !list ||
      !target ||
      target.closest("[data-file-row], [data-folder-row], [data-creation-row], input, textarea, button, a, select")
    ) {
      return;
    }
    const rect = list.getBoundingClientRect();
    if (e.clientX - rect.left >= list.clientWidth) return; // 스크롤 막대
    e.preventDefault();
    const x = e.clientX - rect.left + list.scrollLeft, y = e.clientY - rect.top + list.scrollTop;
    bandRef.current = { x0: x, y0: y, base: e.ctrlKey || e.metaKey || e.shiftKey ? new Set(selectedIds) : new Set(), moved: false };
    const move = (ev: PointerEvent) => {
      const start = bandRef.current;
      if (!start) return;
      const r = list.getBoundingClientRect();
      // 목록 위·아래 끝 너머로 끌면 그쪽으로 스크롤한다.
      if (ev.clientY > r.bottom - 12) list.scrollTop += 16; else if (ev.clientY < r.top + 12) list.scrollTop -= 16;
      const x1 = Math.max(0, Math.min(list.scrollWidth, ev.clientX - r.left + list.scrollLeft));
      const y1 = Math.max(0, Math.min(list.scrollHeight, ev.clientY - r.top + list.scrollTop));
      if (!start.moved && Math.abs(x1 - start.x0) + Math.abs(y1 - start.y0) < 4) return;
      start.moved = true;
      const box = { left: Math.min(start.x0, x1), right: Math.max(start.x0, x1), top: Math.min(start.y0, y1), bottom: Math.max(start.y0, y1) };
      setBand({ x0: start.x0, y0: start.y0, x1, y1 });
      const hits = new Set(start.base);
      list.querySelectorAll<HTMLElement>("[data-file-row]").forEach((row) => {
        const rr = row.getBoundingClientRect();
        const top = rr.top - r.top + list.scrollTop, left = rr.left - r.left + list.scrollLeft;
        if (top < box.bottom && top + rr.height > box.top && left < box.right && left + rr.width > box.left) hits.add(Number(row.dataset.fileRow));
      });
      setSelectedIds(hits);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const start = bandRef.current;
      bandRef.current = null;
      setBand(null);
      if (start && !start.moved && start.base.size === 0) { setSelectedIds(new Set()); } // 빈 곳을 그냥 누르면 선택 해제
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  async function saveQuickEdit(f: WorkspaceFile, room: number, text: string, baseVersionId: number, auto: boolean): Promise<number> {
    const base = f.versions.find((v) => v.id === room);
    const result = await uploadWorkspaceFile({
      file: new File([text], base?.originalName ?? f.name, { type: base?.mimeType ?? "text/plain" }),
      fileId: f.id, folderId: f.folderId, baseVersionId, note: auto ? "바로 수정 자동 저장" : "바로 수정으로 저장", tags: f.tags,
    });
    return result.versionId;
  }

  useEffect(() => {
    if (currentMember) void markSectionViewed("workspace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, currentMember?.id]);

  useEffect(() => {
    if (focusFile) {
      setCurrentFolderId(focusFile.folderId);
      setSelected(focusFile.fileId);
      setDetailTab("versions");
      setFilterTag(null);
    }
  }, [focusFile]);

  const currentFolder = currentFolderId !== null ? folders.find((f) => f.id === currentFolderId) || null : null;
  const scoped = files.filter((f) => f.folderId === currentFolderId);
  const folderById = new Map(folders.map((f) => [f.id, f]));
  // 루트부터 한 폴더까지의 경로. 깊이는 DB가 10단계로 막으므로 짧다(상한은 목록이 꼬였을 때의 안전장치).
  function pathOf(folder: Folder | null): Folder[] {
    const path: Folder[] = [];
    for (let f = folder; f && path.length < 10; f = f.parentId !== null ? folderById.get(f.parentId) ?? null : null) path.unshift(f);
    return path;
  }
  const folderPath = pathOf(currentFolder);
  const parentFolder = folderPath.length > 1 ? folderPath[folderPath.length - 2] : null;
  const childFolders = sortFolders(folders.filter((f) => f.parentId === (currentFolder?.id ?? null)));
  const displayFolders = sortBy === "nameDesc" ? [...childFolders].reverse() : childFolders;
  const canNestFolder = folderPath.length < 10;
  const searchScope = searchQuery.trim() ? files.filter((f) => matchesWorkspaceSearch(f, searchQuery)) : scoped;
  const tags = [null, ...Array.from(new Set(searchScope.flatMap((f) => f.tags)))];
  const filtered = filterTag === null ? searchScope : searchScope.filter((f) => f.tags.includes(filterTag));
  const sortedFiles = sortWorkspaceFiles(filtered, sortBy);
  // 고른 파일 중 지금 보이는 것만(다른 폴더로 옮겼거나 검색으로 가려진 파일이 몰래 지워지거나 옮겨지지 않게).
  const visibleSelected = sortedFiles.filter((f) => selectedIds.has(f.id));
  const selFile = selected !== null ? files.find((f) => f.id === selected) || null : null;
  const locked = project.status === "done";
  const canReorderFiles = !locked && !searchQuery.trim() && filterTag === null;
  const movableFolderTargets = currentFolder ? folders.filter((f) => !folderSubtree(folders, currentFolder.id).has(f.id)) : [];
  useEffect(() => {
    if (filterTag !== null && !searchScope.some((f) => f.tags.includes(filterTag))) setFilterTag(null);
  }, [files, currentFolderId, filterTag, searchQuery]);

  function openFolder(id: number | null, recordHistory = true) {
    if (contextMenu) setContextMenu(null);
    cancelCreation();
    if (recordHistory && id !== currentFolderId) {
      setFolderHistory((prev) => ({
        past: [...prev.past, currentFolderId],
        future: [],
      }));
    }
    setCurrentFolderId(id);
    setSelected(null);
    setFilterTag(null);
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkDeleteError("");
  }

  function goBackFolder() {
    if (folderHistory.past.length === 0) return;
    const prevFolder = folderHistory.past[folderHistory.past.length - 1];
    setFolderHistory((prev) => ({
      past: prev.past.slice(0, -1),
      future: [currentFolderId, ...prev.future],
    }));
    openFolder(prevFolder, false);
  }

  function goForwardFolder() {
    if (folderHistory.future.length === 0) return;
    const nextFolder = folderHistory.future[0];
    setFolderHistory((prev) => ({
      past: [...prev.past, currentFolderId],
      future: prev.future.slice(1),
    }));
    openFolder(nextFolder, false);
  }

  function canDeleteFile(f: WorkspaceFile): boolean {
    return !locked && !!currentMember && (isManager || (!!f.ownerUserId && f.ownerUserId === currentMember.userId));
  }

  function canDeleteFolder(f: Folder): boolean {
    return !locked && !!currentMember && (isManager || (!!f.ownerUserId && f.ownerUserId === currentMember.userId));
  }

  async function handleDeleteFolder(f: Folder) {
    const childCount = files.filter((x) => x.folderId === f.id).length + folders.filter((x) => x.parentId === f.id).length;
    if (
      !(await ask({
        title: `“${f.name}” 폴더를 삭제할까요?`,
        message: childCount > 0 ? `폴더 안의 모든 파일과 하위 폴더(${childCount}개)도 함께 삭제됩니다.` : "빈 폴더가 삭제됩니다.",
      }))
    )
      return;
    try {
      await deleteWorkspaceFolder(f.id);
      if (currentFolderId === f.id) openFolder(f.parentId);
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : "폴더 삭제에 실패했습니다.");
    }
  }

  async function handleDeleteSingleFile(f: WorkspaceFile) {
    if (
      !(await ask({
        title: `“${f.name}” 파일을 삭제할까요?`,
        message: "모든 버전과 댓글도 함께 삭제되며 복구할 수 없습니다.",
      }))
    )
      return;
    try {
      await deleteWorkspaceFile(f.id);
      if (selected === f.id) setSelected(null);
    } catch (e) {
      setBulkDeleteError(e instanceof Error ? e.message : "파일 삭제에 실패했습니다.");
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 고른 파일 중 지울 수 있는 것(팀장·부팀장 또는 올린 사람)만 지운다.
  async function bulkDelete() {
    const ids = visibleSelected.filter(canDeleteFile).map((f) => f.id);
    if (bulkDeleting || ids.length === 0) return;
    const skipped = visibleSelected.length - ids.length;
    if (!(await ask({ title: `파일 ${ids.length}개를 삭제할까요?`, message: `모든 버전과 댓글도 함께 삭제되며 복구할 수 없습니다.${skipped > 0 ? ` (내가 지울 수 없는 ${skipped}개는 남겨 둡니다)` : ""}` }))) return;
    setBulkDeleting(true);
    setBulkDeleteError("");
    const results = await Promise.allSettled(ids.map((id) => deleteWorkspaceFile(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkDeleting(false);
    if (failed > 0) setBulkDeleteError(`${failed}개 파일을 삭제하지 못했습니다. 다시 시도해 주세요.`);
  }

  async function handleAddFolder() {
    if (!newFolderName.trim() || locked || folderPending.current) return;
    const targetProject = project.id;
    folderPending.current = true; setFolderBusy(true); setFolderError("");
    try {
      await addFolder(newFolderName, currentFolder?.id ?? null);
      if (activeProjectRef.current === targetProject) {
        setNewFolderName(""); setCreatingFolder(false);
      }
    } catch (e) {
      if (activeProjectRef.current === targetProject) setFolderError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "폴더 생성에 실패했습니다. 다시 시도해 주세요.");
    } finally { folderPending.current = false; setFolderBusy(false); }
  }

  async function uploadBinary(binary: File, tags: string[], note: string) {
    if (locked) throw new Error("종료된 프로젝트에는 업로드할 수 없습니다.");
    if (uploadingRef.current) return;
    const uploadProject = project.id;
    uploadingRef.current = true; setUploading(true);
    try {
      const result = await uploadWorkspaceFile({ file: binary, folderId: currentFolderId, note, tags });
      if (activeProjectRef.current === uploadProject) { setSelected(result.fileId); setDetailTab("versions"); setPendingUpload(null); }
    } catch (e) {
      throw e;
    } finally { uploadingRef.current = false; setUploading(false); }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && !locked && !uploadingRef.current) setPendingUpload(dropped);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const binary = e.target.files?.[0]; e.target.value = "";
    if (binary && !locked && !uploadingRef.current) setPendingUpload(binary);
  }

  return (
    <div ref={workspaceRef} className="p-3 md:p-6 max-w-7xl mx-auto" style={{ overflowAnchor: "none" }}>
      <input ref={fileInputRef} type="file" aria-label="새 파일 업로드" disabled={uploading} className="hidden" onChange={handleFileInput} />
      {pendingUpload && (
        <FileUploadDialog
          key={project.id}
          file={pendingUpload}
          destination={currentFolder ? `“${currentFolder.name}” 폴더` : "워크스페이스 루트"}
          onCancel={() => setPendingUpload(null)}
          onConfirm={(tags, note) => uploadBinary(pendingUpload, tags, note)}
        />
      )}
      <WorkspaceCleanupNotice />

      {/* Header */}
      <div className="mb-4">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          파일 워크스페이스 · {project.name}
        </div>
        <h1 className="text-xl md:text-2xl font-700 flex items-center gap-2">
          <span>파일 탐색기</span>
          {locked && <span className="text-xs px-2.5 py-0.5 font-600 rounded-full bg-amber-500/10 text-amber-500">종료된 프로젝트 (읽기 전용)</span>}
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          전체 폴더 {folders.length}개 · 전체 파일 {files.length}개
        </p>
      </div>

      {/* Windows Explorer Style Navigation & Path Bar */}
      <div className="flex items-center gap-2 mb-3">
        {/* Navigation buttons: Back, Forward, Up, Refresh */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={goBackFolder}
            disabled={folderHistory.past.length === 0}
            title="뒤로 (Alt+←)"
            aria-label="뒤로 가기"
            className="w-8 h-8 flex items-center justify-center rounded-lg border transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--secondary)] cursor-pointer"
            style={{ borderColor: "var(--border)", background: "var(--card-glass)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goForwardFolder}
            disabled={folderHistory.future.length === 0}
            title="앞으로 (Alt+→)"
            aria-label="앞으로 가기"
            className="w-8 h-8 flex items-center justify-center rounded-lg border transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--secondary)] cursor-pointer"
            style={{ borderColor: "var(--border)", background: "var(--card-glass)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => openFolder(parentFolder?.id ?? null)}
            disabled={!currentFolder}
            {...(!locked && currentFolder ? dropHandlers(parentFolder?.id ?? "root") : {})}
            title="상위 폴더로 (Alt+↑)"
            aria-label="상위 폴더로 이동"
            className="w-8 h-8 flex items-center justify-center rounded-lg border transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--secondary)] cursor-pointer"
            style={{ borderColor: "var(--border)", background: "var(--card-glass)", ...dropStyle(parentFolder?.id ?? "root") }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => void markSectionViewed("workspace")}
            title="새로고침 (F5)"
            aria-label="새로고침"
            className="w-8 h-8 flex items-center justify-center rounded-lg border transition-all hover:bg-[var(--secondary)] cursor-pointer"
            style={{ borderColor: "var(--border)", background: "var(--card-glass)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
            </svg>
          </button>
        </div>

        {/* Address Bar (Breadcrumb) */}
        <div
          className="flex-1 flex items-center gap-1.5 px-3 py-1.5 border rounded-lg overflow-x-auto min-w-0 text-xs shadow-xs"
          style={{ borderColor: "var(--border)", background: "var(--card-glass)" }}
        >
          <span className="text-sm shrink-0">📁</span>
          <button
            type="button"
            onClick={() => openFolder(null)}
            {...(!locked && currentFolder ? dropHandlers("root") : {})}
            className="font-600 shrink-0 hover:underline transition-colors flex items-center gap-1 cursor-pointer"
            style={{ color: currentFolder ? "var(--muted-foreground)" : "var(--foreground)", ...dropStyle("root") }}
          >
            <span>{project.name}</span>
          </button>
          {folderPath.map((f) => (
            <span key={f.id} className="contents">
              <span className="text-muted-foreground select-none shrink-0" style={{ color: "var(--muted-foreground)" }}>›</span>
              {f.id === currentFolder?.id ? (
                <span className="font-700 flex items-center gap-1 min-w-0 shrink-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color }} />
                  <span className="truncate">{f.name}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => openFolder(f.id)}
                  {...(!locked ? dropHandlers(f.id) : {})}
                  className="font-600 truncate min-w-0 hover:underline shrink-0 cursor-pointer"
                  style={{ color: "var(--muted-foreground)", ...dropStyle(f.id) }}
                >
                  {f.name}
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Search box */}
        <div className="relative w-40 sm:w-60 shrink-0">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setFilterTag(null); }}
            placeholder="검색"
            className="w-full text-xs pl-8 pr-7 py-2 border rounded-lg outline-none transition-all"
            style={{ borderColor: "var(--border)", background: "var(--card-glass)", color: "var(--foreground)" }}
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-50 hover:opacity-100 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Command Toolbar */}
      <div
        className="relative z-30 flex items-center justify-between gap-3 mb-4 px-3 py-2 border rounded-xl flex-wrap shadow-xs"
        style={{ borderColor: "var(--border)", background: "var(--card-glass)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* + 새로 만들기 ˅ (좌상단 드롭다운) */}
          <div className="relative z-40" ref={newMenuRef}>
            <button
              type="button"
              onClick={() => setShowNewMenu((v) => !v)}
              disabled={locked}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-700 transition-all shadow-xs disabled:opacity-40 cursor-pointer"
              style={{
                background: "var(--primary)",
                color: "#fff",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <span className="text-sm leading-none font-bold">+</span>
              <span>새로 만들기</span>
              <span className="text-[9px] opacity-80">▼</span>
            </button>
            {showNewMenu && (
              <div
                className="absolute left-0 top-full mt-1.5 w-56 py-1.5 border z-50 shadow-2xl rounded-xl"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
                }}
              >
                <button
                  type="button"
                  onClick={() => { setShowNewMenu(false); startCreatingFolder(); }}
                  disabled={!canNestFolder}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-600 text-left hover:bg-[var(--secondary)] transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <span className="text-base">📁</span>
                  <span className="flex-1">새 폴더</span>
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                <div className="px-3.5 py-1 text-[10px] font-700 text-muted-foreground uppercase tracking-wider">
                  웹 실시간 협업
                </div>
                <button
                  type="button"
                  onClick={() => { setShowNewMenu(false); startCreatingItem("doc"); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                >
                  <span className="text-base">📄</span>
                  <span className="flex-1">새 문서 (Slackerspace Doc)</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewMenu(false); startCreatingItem("slides"); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                >
                  <span className="text-base">🖼️</span>
                  <span className="flex-1">새 슬라이드 (Slackerspace Slides)</span>
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                <div className="px-3.5 py-1 text-[10px] font-700 text-muted-foreground uppercase tracking-wider">
                  MS 오피스
                </div>
                <button
                  type="button"
                  onClick={() => { setShowNewMenu(false); startCreatingItem("docx"); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                >
                  <span className="text-base">📘</span>
                  <span className="flex-1">Word 문서 (.docx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewMenu(false); startCreatingItem("xlsx"); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                >
                  <span className="text-base">📗</span>
                  <span className="flex-1">Excel 스프레드시트 (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewMenu(false); startCreatingItem("pptx"); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                >
                  <span className="text-base">📙</span>
                  <span className="flex-1">PowerPoint 프레젠테이션 (.pptx)</span>
                </button>
                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                <button
                  type="button"
                  onClick={() => { setShowNewMenu(false); cancelCreation(); fileInputRef.current?.click(); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                >
                  <span className="text-base">⬆</span>
                  <span className="flex-1">파일 업로드</span>
                </button>
              </div>
            )}
          </div>

          {/* Selection Action Toolbar Buttons */}
          {visibleSelected.length > 0 && !selectMode && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-600" style={{ color: "var(--primary)" }}>
                {visibleSelected.length}개 선택됨
              </span>
              {visibleSelected.some(canDeleteFile) && (
                <button
                  type="button"
                  onClick={() => void bulkDelete()}
                  disabled={bulkDeleting}
                  className="flex items-center gap-1 text-xs font-700 px-2.5 py-1.5 rounded-lg border transition-all text-red-500 hover:bg-red-500/10 cursor-pointer"
                  style={{ borderColor: "#ef444440" }}
                >
                  <span>🗑️</span>
                  <span>{bulkDeleting ? "삭제 중…" : `선택 삭제 (${visibleSelected.filter(canDeleteFile).length})`}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => syncRef.current?.addDownload(visibleSelected.map((f) => f.id))}
                className="flex items-center gap-1 text-xs font-600 px-2.5 py-1.5 rounded-lg border transition-all hover:bg-[var(--secondary)] cursor-pointer"
                style={{ borderColor: "var(--border)" }}
              >
                <span>💻</span>
                <span>로컬 동기화</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs font-600 px-2 py-1 rounded-lg hover:underline cursor-pointer"
                style={{ color: "var(--muted-foreground)" }}
              >
                선택 해제
              </button>
            </div>
          )}

          {/* Quick presentation button for selected file */}
          {(() => {
            const candidate = selFile ?? (visibleSelected.length === 1 ? visibleSelected[0] : null);
            if (!candidate || !isPresentationFile(candidate.name)) return null;
            return (
              <button
                type="button"
                onClick={() => setPresentingFile(candidate)}
                className="flex items-center gap-1.5 text-xs font-700 px-3 py-1.5 rounded-lg border transition-all cursor-pointer shadow-xs text-white hover:brightness-110 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                  borderColor: "transparent",
                }}
                title={`${candidate.name} 전체화면 발표 시작`}
              >
                <span>🖥️</span>
                <span>발표</span>
              </button>
            );
          })()}

          {/* Multi-selection toggle */}
          {filtered.some(canDeleteFile) && visibleSelected.length === 0 && (
            <button
              type="button"
              onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); setBulkDeleteError(""); }}
              title={selectMode ? "선택 모드 해제" : "여러 파일 선택해서 삭제"}
              className="flex items-center gap-1.5 text-xs font-600 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer"
              style={{
                background: selectMode ? "var(--primary)18" : "transparent",
                borderColor: selectMode ? "var(--primary)" : "var(--border)",
                color: selectMode ? "var(--primary)" : "var(--foreground)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>{selectMode ? "선택 모드 켜짐" : "선택"}</span>
            </button>
          )}

          {selectMode && visibleSelected.some(canDeleteFile) && (
            <button
              type="button"
              onClick={() => void bulkDelete()}
              disabled={bulkDeleting}
              className="flex items-center gap-1 text-xs font-700 px-2.5 py-1.5 rounded-lg border transition-all text-red-500 hover:bg-red-500/10 cursor-pointer"
              style={{ borderColor: "#ef444440" }}
            >
              <span>🗑️</span>
              <span>{bulkDeleting ? "삭제 중…" : `선택 삭제 (${visibleSelected.filter(canDeleteFile).length})`}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Sort selector */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="workspace-file-sort" className="text-xs shrink-0 font-600" style={{ color: "var(--muted-foreground)" }}>
              정렬
            </label>
            <select
              id="workspace-file-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as FileSortOption)}
              className="text-xs px-2.5 py-1 border rounded-lg outline-none cursor-pointer transition-all"
              style={{
                background: "var(--card-glass)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
                fontFamily: "var(--font-outfit)",
              }}
            >
              <option value="manual">직접 정렬 (끌어서 순서 변경)</option>
              <option value="latest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="nameAsc">이름 오름차순</option>
              <option value="nameDesc">이름 내림차순</option>
              <option value="sizeDesc">크기 큰순</option>
              <option value="sizeAsc">크기 작은순</option>
            </select>
          </div>

          {/* Toggle Details Pane (세부 정보 창) */}
          <button
            type="button"
            onClick={() => setShowDetailsPane((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-600 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer"
            style={{
              background: showDetailsPane ? "var(--primary)18" : "transparent",
              borderColor: showDetailsPane ? "var(--primary)" : "var(--border)",
              color: showDetailsPane ? "var(--primary)" : "var(--foreground)",
            }}
            title="세부 정보 창 토글"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            <span>세부 정보</span>
          </button>
        </div>
      </div>

      {/* Tags row */}
      {tags.length > 1 && (
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {tags.map((t) => (
            <button
              key={t === null ? "all-tags" : `tag:${t}`}
              onClick={() => setFilterTag(t)}
              className="text-xs font-600 px-2.5 py-1 border transition-all cursor-pointer"
              style={{
                background: filterTag === t ? "var(--primary)" : "var(--card)",
                borderColor: filterTag === t ? "var(--primary)" : "var(--border)",
                color: filterTag === t ? "#fff" : "var(--foreground)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {t ?? "전체"}
              {t !== null && (
                <span
                  className="ml-1 px-1 py-0.2 text-[10px]"
                  style={{ background: filterTag === t ? "rgba(255,255,255,0.25)" : "var(--muted)", borderRadius: "2px" }}
                >
                  {searchScope.filter((f) => f.tags.includes(t)).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Error & Status messages */}
      {folderError && <p role="alert" className="mb-3 text-xs text-red-500 bg-red-500/10 p-2.5 rounded-lg">{folderError}</p>}
      {moveError && <p role="alert" className="mb-3 text-xs text-red-500 bg-red-500/10 p-2.5 rounded-lg">{moveError}</p>}
      {clipboardMessage && (
        <div className="mb-3 flex items-center gap-2 text-xs text-primary bg-primary/10 border border-primary/20 p-2.5 rounded-lg font-600 animate-fadeIn">
          <span>✨</span>
          <span>{clipboardMessage}</span>
        </div>
      )}
      {bulkDeleteError && <p role="alert" className="mb-3 text-xs text-red-500 bg-red-500/10 p-2.5 rounded-lg">{bulkDeleteError}</p>}
      {uploading && <p role="status" className="mb-3 text-xs text-primary bg-primary/10 p-2.5 rounded-lg">파일을 업로드하고 있습니다…</p>}

      {/* Main Split Layout: File Explorer Table on Left + Details Pane on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Table View (Windows 11 Explorer details view) */}
        <div
          className={`${showDetailsPane ? "lg:col-span-8" : "col-span-12"} relative z-0 flex flex-col border rounded-xl overflow-hidden transition-all shadow-sm`}
          style={{
            background: "var(--card-glass)",
            borderColor: "var(--border)",
            backdropFilter: "var(--panel-blur)",
            WebkitBackdropFilter: "var(--panel-blur)",
          }}
        >
          {/* Clipboard Notification Bar */}
          {clipboard && (
            <div
              className="flex items-center justify-between px-4 py-2 border-b text-xs font-semibold animate-fadeIn"
              style={{
                background: "color-mix(in srgb, var(--primary) 12%, var(--card))",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <div className="flex items-center gap-2">
                <span>{clipboard.action === "cut" ? "✂️" : "📋"}</span>
                <span>
                  {clipboard.files.length === 1 ? `"${clipboard.files[0].name}"` : `${clipboard.files.length}개 파일`}
                  {clipboard.action === "cut" ? " 잘라내기됨" : " 복사됨"}
                  <span className="font-normal opacity-70 ml-1.5 hidden sm:inline">
                    (원하는 위치에서 붙여넣기 또는 Ctrl+V)
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={clipboardBusy || locked}
                  onClick={() => void handlePaste(currentFolderId)}
                  className="px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  style={{
                    background: "var(--primary)",
                    color: "white",
                  }}
                >
                  {clipboardBusy ? "붙여넣는 중…" : "여기에 붙여넣기"}
                </button>
                <button
                  type="button"
                  disabled={clipboardBusy}
                  onClick={() => setClipboard(null)}
                  className="px-2 py-1 rounded-md text-xs hover:bg-[var(--secondary)] transition-colors cursor-pointer text-muted-foreground"
                >
                  취소 (Esc)
                </button>
              </div>
            </div>
          )}

          {/* Table Header */}
          <div
            className="flex items-center px-4 py-2.5 text-xs font-700 border-b select-none sticky top-0 z-10"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--muted-foreground)" }}
          >
            {selectMode && <div className="w-6 shrink-0" />}
            <button
              type="button"
              onClick={() => setSortBy(sortBy === "nameAsc" ? "nameDesc" : "nameAsc")}
              className="flex-1 min-w-0 flex items-center gap-1 hover:text-[var(--foreground)] text-left cursor-pointer"
            >
              <span>이름</span>
              {sortBy === "nameAsc" && <span className="text-[10px]">▲</span>}
              {sortBy === "nameDesc" && <span className="text-[10px]">▼</span>}
            </button>
            <button
              type="button"
              onClick={() => setSortBy(sortBy === "latest" ? "oldest" : "latest")}
              className="w-36 hidden sm:flex items-center gap-1 hover:text-[var(--foreground)] shrink-0 cursor-pointer"
            >
              <span>수정한 날짜</span>
              {sortBy === "latest" && <span className="text-[10px]">▼</span>}
              {sortBy === "oldest" && <span className="text-[10px]">▲</span>}
            </button>
            <div className="w-40 hidden md:flex items-center shrink-0">
              <span>유형</span>
            </div>
            <button
              type="button"
              onClick={() => setSortBy(sortBy === "sizeDesc" ? "sizeAsc" : "sizeDesc")}
              className="w-24 flex items-center justify-end gap-1 hover:text-[var(--foreground)] shrink-0 text-right cursor-pointer"
            >
              <span>크기</span>
              {sortBy === "sizeDesc" && <span className="text-[10px]">▼</span>}
              {sortBy === "sizeAsc" && <span className="text-[10px]">▲</span>}
            </button>
          </div>

          {/* Table Body */}
          <div
            ref={listRef}
            onPointerDown={startBand}
            onContextMenu={(e) => {
              e.preventDefault();
              const x = Math.min(e.clientX, window.innerWidth - 240);
              const y = Math.min(e.clientY, window.innerHeight - 300);
              setContextMenu({ x, y, target: null });
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(ITEM_DRAG_TYPE)) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className="relative min-h-[420px] max-h-[640px] overflow-y-auto divide-y divide-[var(--border)]"
            style={{ userSelect: band ? "none" : undefined }}
          >
            {/* Desktop file drop overlay */}
            {dragOver && (
              <div
                className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 border-2 border-dashed pointer-events-none"
                style={{
                  borderColor: "var(--primary)",
                  background: "var(--card)",
                  opacity: 0.95,
                }}
              >
                <div className="text-4xl mb-2">⬆</div>
                <div className="text-base font-700">이곳에 파일을 드롭하여 업로드</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {currentFolder ? `“${currentFolder.name}” 폴더에 저장됩니다` : "워크스페이스 루트에 저장됩니다"}
                </div>
              </div>
            )}

            {/* Inline Creating Folder Row */}
            {creatingFolder && (
              <div
                data-creation-row="folder"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => newFolderInputRef.current?.focus()}
                className="flex items-center gap-3 px-4 py-3 bg-[var(--primary)]/5 cursor-text"
              >
                <span className="text-xl shrink-0 select-none">📁</span>
                <input
                  ref={newFolderInputRef}
                  autoFocus
                  disabled={folderBusy}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleAddFolder();
                    if (e.key === "Escape") cancelCreation();
                  }}
                  placeholder="새 폴더 이름"
                  className="flex-1 text-xs px-2.5 py-1.5 border outline-none rounded bg-[var(--surface-opaque)] text-foreground cursor-text"
                  style={{ borderColor: "var(--border)" }}
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleAddFolder(); }}
                  disabled={folderBusy || !newFolderName.trim()}
                  className="text-xs font-700 px-3 py-1.5 rounded cursor-pointer"
                  style={{
                    background: newFolderName.trim() ? "var(--primary)" : "var(--muted)",
                    color: newFolderName.trim() ? "#fff" : "var(--muted-foreground)",
                  }}
                >
                  {folderBusy ? "생성 중…" : "만들기"}
                </button>
                <button
                  type="button"
                  disabled={folderBusy}
                  onClick={(e) => { e.stopPropagation(); cancelCreation(); }}
                  className="text-xs font-600 px-2.5 py-1.5 rounded cursor-pointer"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  취소
                </button>
              </div>
            )}

            {/* Inline Creating Item Row (Doc / Slides / MS Office) */}
            {newItem !== null && (
              <div
                data-creation-row="item"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => newItemInputRef.current?.focus()}
                className="flex items-center gap-3 px-4 py-3 bg-[var(--primary)]/5 cursor-text"
              >
                <span className="text-xl shrink-0 select-none">{getItemMeta(newItem.kind).icon}</span>
                <input
                  ref={newItemInputRef}
                  autoFocus
                  disabled={docBusy}
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleCreateItem();
                    if (e.key === "Escape") cancelCreation();
                  }}
                  placeholder={getItemMeta(newItem.kind).placeholder}
                  maxLength={100}
                  className="flex-1 text-xs px-2.5 py-1.5 border outline-none rounded bg-[var(--surface-opaque)] text-foreground cursor-text"
                  style={{ borderColor: "var(--border)" }}
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleCreateItem(); }}
                  disabled={docBusy}
                  className="text-xs font-700 px-3 py-1.5 rounded cursor-pointer"
                  style={{ background: "var(--primary)", color: "#fff" }}
                >
                  {docBusy ? "만드는 중…" : "만들기"}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); cancelCreation(); }}
                  disabled={docBusy}
                  className="text-xs font-600 px-2.5 py-1.5 rounded cursor-pointer"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  취소
                </button>
              </div>
            )}

            {/* FOLDERS (displayed together with files) */}
            {displayFolders.map((f) => {
              const fileCount = files.filter((x) => x.folderId === f.id).length;
              const subFolderCount = folders.filter((x) => x.parentId === f.id).length;
              const totalItems = fileCount + subFolderCount;
              return (
                <div
                  key={`folder:${f.id}`}
                  data-folder-row={f.id}
                  onClick={() => openFolder(f.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const x = Math.min(e.clientX, window.innerWidth - 240);
                    const y = Math.min(e.clientY, window.innerHeight - 300);
                    setContextMenu({ x, y, target: { kind: "folder", folder: f } });
                  }}
                  draggable={!locked}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(ITEM_DRAG_TYPE, "folder");
                    e.dataTransfer.effectAllowed = "move";
                    const ghost = createDragGhost(f.name, 1, false);
                    e.dataTransfer.setDragImage(ghost, 20, 20);
                    setTimeout(() => ghost.remove(), 0);
                    setDragging({ kind: "folder", id: f.id });
                  }}
                  onDragEnd={endDrag}
                  onDragOver={(e) => folderCardDragOver(e, f)}
                  onDragLeave={() => setDropSpot((cur) => (cur && ("into" in cur ? cur.into === f.id : cur.kind === "folder" && cur.id === f.id) ? null : cur))}
                  onDrop={(e) => folderCardDrop(e, f)}
                  title={!locked ? "클릭하여 폴더 열기 · 끌어서 순서를 바꾸거나 다른 폴더로 이동" : "클릭하여 폴더 열기"}
                  className="flex items-center px-4 py-2 text-xs transition-colors group cursor-pointer hover:bg-[var(--secondary)]/60"
                  style={{
                    ...dropStyle(f.id),
                    borderTop: isSpot("folder", f.id, "before") ? "3px solid var(--primary)" : undefined,
                    borderBottom: isSpot("folder", f.id, "after") ? "3px solid var(--primary)" : undefined,
                    boxShadow: dragging?.kind === "folder" && dragging.id === f.id
                      ? "0 0 0 2px var(--primary), inset 0 0 12px rgba(37, 99, 235, 0.2)"
                      : dropStyle(f.id).boxShadow,
                    borderRadius: dragging?.kind === "folder" && dragging.id === f.id ? 8 : undefined,
                    opacity: dragging?.kind === "folder" && dragging.id === f.id ? 0.75 : 1,
                  }}
                >
                  {selectMode && <div className="w-6 shrink-0" />}

                  {/* Name Column */}
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                    <span
                      className="w-7 h-7 flex items-center justify-center rounded-md text-sm shrink-0"
                      style={{ background: `${f.color}20`, color: f.color }}
                    >
                      📁
                    </span>
                    <span className="font-600 truncate text-[13px] text-foreground group-hover:underline">
                      <SearchHighlight text={f.name} query={searchQuery} />
                    </span>
                    {isInto(f.id) && (
                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--primary)] text-white animate-bounce shadow-xs">
                        📥 여기에 넣기
                      </span>
                    )}
                    {dragging?.kind === "folder" && dragging.id === f.id && (
                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--primary)] text-white animate-pulse">
                        이동 중
                      </span>
                    )}
                  </div>

                  {/* Date Column */}
                  <div className="w-36 hidden sm:flex items-center text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>
                    {f.date}
                  </div>

                  {/* Type Column */}
                  <div className="w-40 hidden md:flex items-center text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>
                    파일 폴더
                  </div>

                  {/* Size / Count Column */}
                  <div className="w-24 shrink-0 flex items-center justify-end text-xs font-500" style={{ color: "var(--muted-foreground)" }}>
                    항목 {totalItems}개
                  </div>
                </div>
              );
            })}

            {/* FILES (sorted) */}
            {sortedFiles.map((f) => {
              const tc = fileBadge(f);
              const deletable = canDeleteFile(f);
              const isSelected = selectMode || visibleSelected.length > 0 ? selectedIds.has(f.id) : selected === f.id;
              return (
                <div
                  key={`file:${f.id}`}
                  data-file-row={f.id}
                  draggable={!locked && !selectMode}
                  onDragStart={(e) => startFileDrag(e, f)}
                  onDragEnd={endDrag}
                  onDragOver={(e) => fileRowDragOver(e, f)}
                  onDragLeave={() => setDropSpot((cur) => (cur && !("into" in cur) && cur.kind === "file" && cur.id === f.id ? null : cur))}
                  onDrop={(e) => fileRowDrop(e, f)}
                  onClick={(e) => clickFile(e, f, deletable)}
                  onDoubleClick={() => {
                    const collabKind = collabKindOf(f.name);
                    if (collabKind || isCodeFile(f.name)) void startQuickEdit(f, "main");
                    else if (isOfficeEditable(f.name)) {
                      if (officeEnabled) {
                        setOfficeEditingFile({ id: f.id, name: f.name });
                      } else {
                        setSelected(f.id);
                        setDetailTab("versions");
                        setShowDetailsPane(true);
                        setClipboardMessage("오피스 웹 편집기(OnlyOffice)가 설정되지 않아 미리보기 패널을 열었습니다.");
                      }
                    }
                    else if (isPresentationFile(f.name)) setPresentingFile(f);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelected(f.id);
                    const x = Math.min(e.clientX, window.innerWidth - 240);
                    const y = Math.min(e.clientY, window.innerHeight - 300);
                    setContextMenu({ x, y, target: { kind: "file", file: f } });
                  }}
                  title={!locked && !selectMode ? (isPresentationFile(f.name) ? "클릭하여 선택 · 더블클릭하여 발표 모드 · 우클릭하여 메뉴 열기" : "클릭하여 선택 · 더블클릭하여 편집 · 우클릭하여 메뉴 열기") : "클릭하여 선택"}
                  className="flex items-center px-4 py-2 text-xs transition-colors group cursor-pointer"
                  style={{
                    background: (dragging?.kind === "files" && dragging.ids.includes(f.id))
                      ? "color-mix(in srgb, var(--primary) 24%, var(--card))"
                      : isSelected
                      ? "color-mix(in srgb, var(--primary) 15%, var(--card))"
                      : "transparent",
                    color: "var(--foreground)",
                    borderTop: isSpot("file", f.id, "before") ? "3px solid var(--primary)" : undefined,
                    borderBottom: isSpot("file", f.id, "after") ? "3px solid var(--primary)" : undefined,
                    boxShadow: (dragging?.kind === "files" && dragging.ids.includes(f.id))
                      ? "0 0 0 2px var(--primary), inset 0 0 14px rgba(37, 99, 235, 0.22)"
                      : isSpot("file", f.id, "before") || isSpot("file", f.id, "after")
                      ? "0 0 8px rgba(37, 99, 235, 0.45)"
                      : isSelected
                      ? "inset 3px 0 0 var(--primary)"
                      : undefined,
                    borderRadius: (dragging?.kind === "files" && dragging.ids.includes(f.id)) ? 8 : undefined,
                    transform: (dragging?.kind === "files" && dragging.ids.includes(f.id)) ? "scale(0.99)" : undefined,
                    opacity: (dragging?.kind === "files" && dragging.ids.includes(f.id))
                      ? 0.78
                      : (selectMode && !deletable) || (clipboard?.action === "cut" && clipboard.files.some((cf) => cf.id === f.id))
                      ? 0.45
                      : 1,
                  }}
                >
                  {/* Select Checkbox */}
                  {selectMode && (
                    <div className="w-6 shrink-0 flex items-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!deletable}
                        onChange={() => deletable && toggleSelected(f.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 cursor-pointer"
                        aria-label={`${f.name} 선택`}
                      />
                    </div>
                  )}

                  {/* Name Column */}
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                    {/* File Icon Badge */}
                    <div
                      className="w-7 h-7 flex items-center justify-center text-[10px] font-700 shrink-0 rounded-md"
                      style={{
                        background: tc.bg,
                        color: tc.color,
                        border: "1px solid currentColor",
                        borderColor: `${tc.color}30`,
                      }}
                    >
                      {tc.label}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`font-600 truncate text-[13px] ${isSelected ? "text-[var(--primary)] font-700" : "text-foreground group-hover:underline"}`}>
                          <SearchHighlight text={f.name} query={searchQuery} />
                        </span>
                        {dragging?.kind === "files" && dragging.ids.includes(f.id) && (
                          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--primary)] text-white animate-pulse shadow-xs">
                            이동 중
                          </span>
                        )}
                        {f.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.2 font-600 rounded"
                            style={{ background: `${tagColors[t] || "#6b7280"}18`, color: tagColors[t] || "#6b7280" }}
                          >
                            {t}
                          </span>
                        ))}
                        {editors.some((e) => e.fileId === f.id) && (
                          <span className="flex items-center gap-0.5 text-[11px] font-600 text-amber-500">
                            ✏️ <EditorAvatars editors={editors.filter((e) => e.fileId === f.id)} size={16} />
                          </span>
                        )}
                        {f.comments.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">💬 {f.comments.length}</span>
                        )}
                      </div>
                      {searchQuery.trim() && contentSnippet(currentFileText(f), searchQuery) && (
                        <p className="text-[11px] mt-0.5 text-muted-foreground line-clamp-1">
                          <SearchHighlight text={contentSnippet(currentFileText(f), searchQuery)} query={searchQuery} />
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Date Column */}
                  <div className="w-36 hidden sm:flex items-center text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>
                    {latestFileUploadTime(f)}
                  </div>

                  {/* Type Column */}
                  <div className="w-40 hidden md:flex items-center text-xs shrink-0 truncate" style={{ color: "var(--muted-foreground)" }}>
                    {getFileTypeDescription(f)}
                  </div>

                  {/* Size Column */}
                  <div className="w-24 shrink-0 flex items-center justify-end text-xs font-500" style={{ color: "var(--muted-foreground)" }}>
                    {f.size}
                  </div>
                </div>
              );
            })}

            {/* Empty State */}
            {displayFolders.length === 0 && sortedFiles.length === 0 && !creatingFolder && newItem === null && (
              <div className="p-12 text-center text-xs" style={{ color: "var(--muted-foreground)", ...lineSafeStyle }}>
                <div className="text-3xl mb-2">📂</div>
                <div className="font-600 text-sm mb-1">
                  {searchQuery.trim() ? "검색 결과가 없습니다" : "이 폴더는 비어 있습니다"}
                </div>
                <div className="text-xs opacity-75">
                  상단의 [+ 새로 만들기]를 누르거나, 마우스 우클릭하여 새 항목을 만들어 보세요.
                </div>
              </div>
            )}

            {/* Band selection rectangle */}
            {band && (
              <div
                aria-hidden="true"
                className="absolute pointer-events-none transition-none z-20"
                style={{
                  left: Math.min(band.x0, band.x1),
                  top: Math.min(band.y0, band.y1),
                  width: Math.abs(band.x1 - band.x0),
                  height: Math.abs(band.y1 - band.y0),
                  background: "color-mix(in srgb, var(--primary) 20%, transparent)",
                  border: "2px solid var(--primary)",
                  borderRadius: 6,
                  boxShadow: "0 0 12px rgba(37, 99, 235, 0.35)",
                }}
              />
            )}
          </div>

          {/* Table Bottom Status Bar */}
          <div
            className="flex items-center justify-between px-4 py-2 border-t text-xs select-none"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--muted-foreground)" }}
          >
            <div>
              {displayFolders.length + sortedFiles.length}개 항목
            </div>
            <div>
              {visibleSelected.length > 0 ? (
                <span>{visibleSelected.length}개 항목 선택됨</span>
              ) : selFile ? (
                <span>1개 항목 선택됨 · {selFile.size}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Details Pane (세부 정보 패널) */}
        {showDetailsPane && (
          <div
            className="lg:col-span-4 border rounded-xl overflow-hidden shadow-sm"
            style={{
              background: "var(--card-glass)",
              borderColor: "var(--border)",
              backdropFilter: "var(--panel-blur)",
              WebkitBackdropFilter: "var(--panel-blur)",
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="font-700 text-sm flex items-center gap-1.5">
                <span>세부 정보</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailsPane(false)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--secondary)] text-xs text-muted-foreground cursor-pointer"
                title="세부 정보 패널 닫기"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {selFile ? (
                <div key={`${project.id}:${selFile.id}`} ref={detailPanelRef}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="text-xs font-700 px-2 py-0.5 rounded" style={{ background: fileBadge(selFile).bg, color: fileBadge(selFile).color }}>
                        {fileBadge(selFile).label}
                      </span>
                      <span className="text-xs px-2 py-0.5 font-600 rounded" style={{ background: `${tagColors[selFile.tag] || "#6b7280"}18`, color: tagColors[selFile.tag] || "#6b7280" }}>
                        {selFile.tags.join(" · ") || "태그 없음"}
                      </span>
                    </div>
                    <WorkspaceDeleteActions item={selFile} kind="file" onDeleted={() => setSelected(null)} />
                  </div>

                  <h3 className="text-sm font-700 mb-1 leading-snug break-words">{selFile.name}</h3>
                  <div className="text-xs mb-3 space-y-0.5" style={{ color: "var(--muted-foreground)" }}>
                    <div>유형: {getFileTypeDescription(selFile)}</div>
                    <div>크기: {selFile.size} · 버전 {selFile.versions.length}개</div>
                    <div>최근 수정: {latestFileUploadTime(selFile)} · 올린 사람: {selFile.uploader}</div>
                  </div>

                  {isPresentationFile(selFile.name) && (
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={() => setPresentingFile(selFile)}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-700 text-white shadow-xs transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer"
                        style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)" }}
                      >
                        <span className="text-sm">🖥️</span>
                        <span>프레젠테이션 / 발표 시작</span>
                      </button>
                    </div>
                  )}

                  {!locked && (
                    <label className="flex items-center gap-2 text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
                      <span className="shrink-0 font-600">폴더 이동</span>
                      <select
                        value={selFile.folderId ?? ""}
                        onChange={(e) => void moveFiles([selFile.id], e.target.value === "" ? null : Number(e.target.value))}
                        className="flex-1 min-w-0 text-xs px-2 py-1 border rounded-lg outline-none"
                        style={{ background: "var(--card-glass)", borderColor: "var(--border)", color: "var(--foreground)" }}
                      >
                        <option value="">워크스페이스 루트(상위)</option>
                        {folders.map((fo) => (
                          <option key={fo.id} value={fo.id}>
                            📁 {pathOf(fo).map((x) => x.name).join(" / ")}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <FileTagEditor file={selFile} />

                  {/* Tab toggle: versions vs comments */}
                  <div className="flex gap-1 mb-3 p-1 rounded-lg" style={{ background: "var(--muted)" }}>
                    {(["versions", "comments"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          if (t === detailTab) return;
                          const height = detailPanelRef.current?.getBoundingClientRect().height;
                          if (height) setDetailPanelHeight({ key: `${project.id}:${selFile.id}`, height });
                          setDetailTab(t);
                        }}
                        className="flex-1 text-xs font-700 py-1.5 transition-all cursor-pointer rounded-md"
                        style={{
                          background: detailTab === t ? "var(--card)" : "transparent",
                          color: detailTab === t ? "var(--primary)" : "var(--muted-foreground)",
                          boxShadow: detailTab === t ? "var(--shadow-card)" : "none",
                        }}
                      >
                        {t === "versions" ? `버전 이력 (${selFile.versions.length})` : `댓글 (${selFile.comments.length})`}
                      </button>
                    ))}
                  </div>

                  {detailTab === "versions" ? (
                    <FileVersionPanel
                      file={selFile}
                      searchQuery={searchQuery}
                      onViewingVersionChange={setViewingVersionId}
                      onSelectFile={(fileId) => { setSelected(fileId); setDetailTab("versions"); }}
                      onQuickEdit={(mode, v) => void startQuickEdit(selFile, mode, v)}
                      editorNames={[...new Set(editors.filter((e) => e.fileId === selFile.id).map((e) => e.name))]}
                      presence={presenceRef.current}
                      editors={editors}
                    />
                  ) : (
                    <WorkspaceComments
                      file={selFile}
                      focusedVersionId={selFile.versions.some((v) => v.id === viewingVersionId) ? viewingVersionId : selFile.versions.find((v) => v.current)?.id ?? null}
                    />
                  )}
                </div>
              ) : currentFolder ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: `${currentFolder.color}20`, color: currentFolder.color }}>
                      📁
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-700 text-sm truncate">{currentFolder.name}</h3>
                      <p className="text-xs text-muted-foreground">생성일 {currentFolder.date} · {currentFolder.createdBy}</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border text-xs space-y-1" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <div>포함된 파일: {scoped.length}개</div>
                    <div>하위 폴더: {childFolders.length}개</div>
                  </div>

                  {!locked && (
                    <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                      <span className="shrink-0 font-600">상위 폴더 변경</span>
                      <select
                        value={currentFolder.parentId ?? ""}
                        onChange={(e) => void moveFolder(currentFolder.id, e.target.value === "" ? null : Number(e.target.value))}
                        className="min-w-0 flex-1 text-xs px-2 py-1 border rounded-lg outline-none"
                        style={{ background: "var(--card-glass)", borderColor: "var(--border)", color: "var(--foreground)" }}
                      >
                        <option value="">워크스페이스 루트</option>
                        {movableFolderTargets.map((fo) => (
                          <option key={fo.id} value={fo.id}>📁 {pathOf(fo).map((x) => x.name).join(" / ")}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <WorkspaceDeleteActions
                    key={`${project.id}:folder:${currentFolder.id}`}
                    item={currentFolder}
                    kind="folder"
                    childCount={scoped.length + childFolders.length}
                    onDeleted={() => openFolder(null)}
                  />
                </div>
              ) : (
                <div className="p-6 text-center text-xs space-y-2" style={{ color: "var(--muted-foreground)" }}>
                  <div className="text-2xl">📋</div>
                  <div className="font-600 text-sm text-foreground">항목을 선택하세요</div>
                  <p>파일을 선택하면 버전 이력, 태그, 댓글 및 공동 편집 기능을 바로 이용할 수 있습니다.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Local Sync Widget */}
      {currentMember && (
        <div className="mt-5">
          <WorkspaceLocalSync
            ref={syncRef}
            projectId={project.id}
            userId={currentMember.userId ?? currentMember.id}
            locked={locked}
            ready={!loading}
            files={files}
            folders={folders}
            currentFolderId={currentFolderId}
            folderLabel={(id) => { const f = id === null ? null : folderById.get(id) ?? null; return f ? pathOf(f).map((x) => x.name).join(" / ") : "워크스페이스 루트"; }}
            upload={uploadWorkspaceFile}
            createFolder={addFolder}
            load={downloadFileVersion}
          />
        </div>
      )}

      {/* Floating Windows Context Menu (우클릭 메뉴) */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent cursor-default"
            onPointerDown={(e) => {
              if (e.button === 0) setContextMenu(null);
            }}
            onClick={() => setContextMenu(null)}
            onContextMenu={() => setContextMenu(null)}
          />
          <div
            ref={contextMenuRef}
          className="fixed z-50 py-1 border shadow-2xl min-w-56 text-xs rounded-xl"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: "var(--card)",
            borderColor: "var(--border)",
            backdropFilter: "var(--panel-blur)",
            WebkitBackdropFilter: "var(--panel-blur)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.target && (
            <>
              {!locked && (
                <>
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); startCreatingFolder(); }}
                    disabled={!canNestFolder}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                  >
                    <span className="text-sm">📁</span>
                    <span>새 폴더 만들기</span>
                  </button>
                  <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); startCreatingItem("doc"); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                  >
                    <span className="text-sm">📄</span>
                    <span>새 문서 (Doc)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); startCreatingItem("slides"); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                  >
                    <span className="text-sm">🖼️</span>
                    <span>새 슬라이드 (Slides)</span>
                  </button>
                  <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); startCreatingItem("docx"); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                  >
                    <span className="text-sm">📘</span>
                    <span>Word 문서 (.docx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); startCreatingItem("xlsx"); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                  >
                    <span className="text-sm">📗</span>
                    <span>Excel 스프레드시트 (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); startCreatingItem("pptx"); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                  >
                    <span className="text-sm">📙</span>
                    <span>PowerPoint (.pptx)</span>
                  </button>
                  <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); cancelCreation(); fileInputRef.current?.click(); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                  >
                    <span className="text-sm">⬆</span>
                    <span>파일 업로드</span>
                  </button>
                  {clipboard && (
                    <button
                      type="button"
                      disabled={clipboardBusy}
                      onClick={() => { setContextMenu(null); void handlePaste(currentFolderId); }}
                      className="w-full flex items-center justify-between px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer text-primary"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm">📄</span>
                        <span>붙여넣기</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground opacity-60">Ctrl+V</span>
                    </button>
                  )}
                  <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                </>
              )}
              <button
                type="button"
                onClick={() => { setContextMenu(null); void markSectionViewed("workspace"); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
              >
                <span>↻</span>
                <span>새로고침</span>
              </button>
              <button
                type="button"
                onClick={() => { setContextMenu(null); setShowDetailsPane((v) => !v); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
              >
                <span>⬚</span>
                <span>세부 정보 창 {showDetailsPane ? "숨기기" : "보기"}</span>
              </button>
            </>
          )}

          {contextMenu.target?.kind === "folder" && (() => {
            const folder = contextMenu.target.folder;
            return (
              <>
                <button
                  type="button"
                  onClick={() => { setContextMenu(null); openFolder(folder.id); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                >
                  <span>📂</span>
                  <span>폴더 열기</span>
                </button>
                {!locked && clipboard && (
                  <>
                    <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                    <button
                      type="button"
                      disabled={clipboardBusy}
                      onClick={() => { setContextMenu(null); void handlePaste(folder.id); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer text-primary"
                    >
                      <span>📄</span>
                      <span>이 폴더에 붙여넣기</span>
                    </button>
                  </>
                )}
                {canDeleteFolder(folder) && (
                  <>
                    <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                    <button
                      type="button"
                      onClick={() => { setContextMenu(null); void handleDeleteFolder(folder); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <span>🗑️</span>
                      <span>폴더 삭제</span>
                    </button>
                  </>
                )}
              </>
            );
          })()}

          {contextMenu.target?.kind === "file" && (() => {
            const file = contextMenu.target.file;
            const collabKind = collabKindOf(file.name);
            return (
              <>
                <button
                  type="button"
                  onClick={() => { setContextMenu(null); setSelected(file.id); setDetailTab("versions"); setShowDetailsPane(true); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                >
                  <span>👁️</span>
                  <span>세부 정보 및 버전 보기</span>
                </button>
                {isPresentationFile(file.name) && (
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); setPresentingFile(file); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer text-indigo-600 dark:text-indigo-400"
                  >
                    <span>🖥️</span>
                    <span>발표 모드로 열기 (전체화면)</span>
                  </button>
                )}
                {collabKind && (
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); void startQuickEdit(file, "main"); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                  >
                    <span>✏️</span>
                    <span>공동 편집 열기</span>
                  </button>
                )}
                {isOfficeEditable(file.name) && (
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      if (officeEnabled) {
                        setOfficeEditingFile({ id: file.id, name: file.name });
                      } else {
                        setSelected(file.id);
                        setDetailTab("versions");
                        setShowDetailsPane(true);
                        setClipboardMessage("오피스 웹 편집기(OnlyOffice)가 설정되지 않아 미리보기 창을 열었습니다. PC에서 편집하려면 다운로드하세요.");
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer text-primary"
                  >
                    <span>✏️</span>
                    <span>{officeEnabled ? "오피스 편집기로 열기" : "문서 열기 (미리보기)"}</span>
                  </button>
                )}
                {!collabKind && isCodeFile(file.name) && (
                  <button
                    type="button"
                    onClick={() => { setContextMenu(null); void startQuickEdit(file, "main"); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                  >
                    <span>⚡</span>
                    <span>빠른 편집</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    const cur = file.versions.find((v) => v.current);
                    if (cur) {
                      void downloadFileVersion(cur.id).then((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = cur.originalName ?? file.name;
                        a.click();
                        URL.revokeObjectURL(url);
                      });
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                >
                  <span>⬇</span>
                  <span>다운로드</span>
                </button>

                <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />

                {!locked && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setContextMenu(null); handleCopy(file); }}
                      className="w-full flex items-center justify-between px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <span>📋</span>
                        <span>복사</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground opacity-60">Ctrl+C</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setContextMenu(null); handleCut(file); }}
                      className="w-full flex items-center justify-between px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <span>✂️</span>
                        <span>잘라내기</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground opacity-60">Ctrl+X</span>
                    </button>
                    {clipboard && (
                      <button
                        type="button"
                        disabled={clipboardBusy}
                        onClick={() => { setContextMenu(null); void handlePaste(file.folderId); }}
                        className="w-full flex items-center justify-between px-3.5 py-2 font-600 text-left hover:bg-[var(--secondary)] transition-colors cursor-pointer text-primary"
                      >
                        <div className="flex items-center gap-2.5">
                          <span>📄</span>
                          <span>붙여넣기</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground opacity-60">Ctrl+V</span>
                      </button>
                    )}
                  </>
                )}
                {canDeleteFile(file) && (
                  <>
                    <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
                    <button
                      type="button"
                      onClick={() => { setContextMenu(null); void handleDeleteSingleFile(file); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 font-600 text-left text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <span>🗑️</span>
                      <span>파일 삭제</span>
                    </button>
                  </>
                )}
              </>
            );
          })()}
        </div>
        </>
      )}

      {/* Collab Modals */}
      {officeEditingFile && (
        <OfficeEditorModal
          fileId={officeEditingFile.id}
          fileName={officeEditingFile.name}
          readOnly={locked}
          presence={presenceRef.current}
          editors={editors}
          onClose={() => setOfficeEditingFile(null)}
        />
      )}
      {editError && <p role="alert" className="mt-3 text-xs rounded-lg bg-red-500/10 text-red-500 p-3">{editError}</p>}
      {editing && presenceRef.current && files.find((f) => f.id === editing.fileId) && (
        <QuickEditModal
          key={`${editing.fileId}:${editing.room}:${editing.mode}`}
          projectId={project.id}
          file={files.find((f) => f.id === editing.fileId)!}
          room={editing.room}
          mode={editing.mode}
          initialText={editing.initialText}
          presence={presenceRef.current}
          editors={editors}
          save={(text, base, auto) => saveQuickEdit(files.find((f) => f.id === editing.fileId)!, editing.room, text, base, auto)}
          onClose={() => setEditing(null)}
        />
      )}
      {docEditing && presenceRef.current && files.find((f) => f.id === docEditing.fileId) && (
        <Suspense fallback={<div role="status" className="fixed inset-0 z-50 flex items-center justify-center text-sm" style={{ background: "rgba(15,18,53,0.48)", color: "#fff" }}>편집기를 불러오는 중…</div>}>
          {(() => {
            const Editor = docEditing.kind === "doc" ? DocEditorModal : SlidesEditorModal;
            return (
              <Editor
                key={`${docEditing.fileId}:${docEditing.room}:${docEditing.mode}`}
                projectId={project.id}
                file={files.find((f) => f.id === docEditing.fileId)!}
                room={docEditing.room}
                mode={docEditing.mode}
                initialBytes={docEditing.bytes}
                presence={presenceRef.current}
                editors={editors}
                save={(bytes, text, base, auto) => saveCollabFile(docEditing.kind, files.find((f) => f.id === docEditing.fileId)!, bytes, text, base, auto)}
                images={collabImages(docEditing.kind, files.find((f) => f.id === docEditing.fileId)!)}
                onClose={() => setDocEditing(null)}
              />
            );
          })()}
        </Suspense>
      )}

      {presentingFile && (
        <Suspense fallback={null}>
          <PresentationModal
            file={presentingFile}
            onClose={() => setPresentingFile(null)}
          />
        </Suspense>
      )}

      {confirmDialog}
    </div>
  );
}
