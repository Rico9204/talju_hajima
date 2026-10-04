import SearchHighlight from "./SearchHighlight";
import { matchesWorkspaceSearch, currentFileText, contentSnippet } from "../lib/workspaceSearch";
import WorkspaceComments from "./WorkspaceComments";
import FileUploadDialog from "./FileUploadDialog";
import { folderSubtree, latestFileUploadTime, reorderIds, sortFolders, sortWorkspaceFiles, type FileSortOption } from "../lib/workspaceFiles";
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
import { useProject, type FileVersion, type Folder, type WorkspaceFile } from "../context/ProjectContext";
import { useAccountBackground } from "../lib/useAccountBackground";

const typeColors: Record<string, { bg: string; color: string; label: string }> = {
  pdf: { bg: "#ef444418", color: "#ef4444", label: "PDF" },
  doc: { bg: "#3d52d518", color: "#3d52d5", label: "DOC" },
  ppt: { bg: "#f0a50018", color: "#f0a500", label: "PPT" },
  xls: { bg: "#22c55e18", color: "#22c55e", label: "XLS" },
  zip: { bg: "#8b5cf618", color: "#8b5cf6", label: "ZIP" },
  img: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
};

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

export default function Workspace({ focusFile }: { focusFile?: WorkspaceFocus | null }) {
  const { project, folders, files, addFolder, uploadWorkspaceFile, currentMember, isManager, deleteWorkspaceFile, markSectionViewed, downloadFileVersion, moveWorkspaceFiles, moveWorkspaceFolder, reorderWorkspaceItems, loading } = useProject();
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
  const [newDoc, setNewDoc] = useState<{ kind: CollabFileKind; name: string } | null>(null); // null = 새 문서·슬라이드 입력창 닫힘
  const [docBusy, setDocBusy] = useState(false);
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
    const observer = new ResizeObserver(retainHeight);
    observer.observe(element);
    return () => { observer.disconnect(); element.style.minHeight = ""; };
  }, [project.id]);

  useEffect(() => {
    setSearchQuery("");
    setPendingUpload(null);
    setCurrentFolderId(null);
    setSelected(null);
    setFilterTag(null);
    setSortBy("manual");
    setCreatingFolder(false);
    setFolderError("");
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkDeleteError("");
  }, [project.id]);

  useEffect(() => {
    if (!currentMember) return;
    const presence = joinCollabPresence(project.id, { id: currentMember.id, name: currentMember.name }, setEditors);
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

  // 새 문서·슬라이드: 빈 파일을 지금 폴더에 올리고 바로 편집기를 연다.
  async function createCollabFile() {
    if (!newDoc || locked || docBusy) return;
    const { ext, mime, label, newBytes } = COLLAB_FILE[newDoc.kind];
    const name = newDoc.name.trim().replace(/[\\/]/g, "") || `새 ${label}`;
    setDocBusy(true); setEditError("");
    try {
      const bytes = newBytes();
      const result = await uploadWorkspaceFile({
        file: new File([new Uint8Array(bytes)], `${name}.${ext}`, { type: mime }),
        folderId: currentFolderId, note: `새 ${label}`, tags: [], extractedText: { text: "", status: "ready" },
      });
      const kind = newDoc.kind;
      setNewDoc(null);
      setSelected(result.fileId); setDetailTab("versions");
      setDocEditing({ kind, fileId: result.fileId, room: result.versionId, mode: "main", bytes });
    } catch (e) {
      setEditError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? `${label}를 만들지 못했습니다.`);
    } finally { setDocBusy(false); }
  }

  const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? fallback);

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
    if (item.kind === "files") void moveFiles(item.ids, folderId);
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
  const dropStyle = (target: number | "root") => (isInto(target) ? { outline: "2px dashed var(--primary)", outlineOffset: "2px" } : {});
  const isSpot = (kind: "folder" | "file", id: number, place: "before" | "after") => !!dropSpot && !("into" in dropSpot) && dropSpot.kind === kind && dropSpot.id === id && dropSpot.place === place;

  // 폴더 카드: 폴더를 끌어 카드 왼쪽·오른쪽 가장자리에 놓으면 순서 바꾸기, 가운데(또는 파일)는 그 폴더 안으로.
  function folderCardDragOver(e: React.DragEvent, target: Folder) {
    if (!e.dataTransfer.types.includes(ITEM_DRAG_TYPE) || !dragging || locked) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    if (dragging.kind === "folder" && dragging.id !== target.id && (ratio < 0.25 || ratio > 0.75)) {
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      setDropSpot({ kind: "folder", id: target.id, place: ratio < 0.25 ? "before" : "after" });
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
    const ids = selectedIds.has(f.id) && selectedIds.size > 1 ? sortedFiles.filter((x) => selectedIds.has(x.id)).map((x) => x.id) : [f.id];
    e.dataTransfer.setData(ITEM_DRAG_TYPE, "files");
    e.dataTransfer.effectAllowed = "move";
    if (ids.length > 1) {
      // 여러 개를 끌 때는 "파일 N개" 표를 끌리는 모양으로 쓴다.
      const ghost = document.createElement("div");
      ghost.textContent = `📄 파일 ${ids.length}개`;
      Object.assign(ghost.style, { position: "fixed", top: "-100px", left: "0", padding: "6px 12px", borderRadius: "999px", background: "#2563eb", color: "#fff", font: "600 13px sans-serif" });
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 10, 10);
      setTimeout(() => ghost.remove(), 0);
    }
    setDragging({ kind: "files", ids });
  }

  // 파일 누르기: 그냥 누르면 하나만 열고, Ctrl/⌘는 하나씩 더하거나 빼고, Shift는 마지막으로 누른 파일부터 범위로 고른다.
  function clickFile(e: React.MouseEvent, f: WorkspaceFile, deletable: boolean) {
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
    const list = listRef.current;
    // 마우스로만(터치로 시작하면 목록을 스크롤할 수 없다). 파일 줄·버튼 위에서 누른 것은 제외.
    if (e.pointerType !== "mouse" || e.button !== 0 || !list || (e.target as HTMLElement).closest("[data-file-row], button")) return;
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
  const canNestFolder = folderPath.length < 10;
  const searchScope = searchQuery.trim() ? files.filter((f) => matchesWorkspaceSearch(f, searchQuery)) : scoped;
  const tags = [null, ...Array.from(new Set(searchScope.flatMap((f) => f.tags)))];
  const filtered = filterTag === null ? searchScope : searchScope.filter((f) => f.tags.includes(filterTag));
  const sortedFiles = sortWorkspaceFiles(filtered, sortBy);
  const selFile = selected !== null ? files.find((f) => f.id === selected) || null : null;
  const locked = project.status === "done";
  const canReorderFiles = !locked && !searchQuery.trim() && filterTag === null;
  const movableFolderTargets = currentFolder ? folders.filter((f) => !folderSubtree(folders, currentFolder.id).has(f.id)) : [];
  useEffect(() => {
    if (filterTag !== null && !searchScope.some((f) => f.tags.includes(filterTag))) setFilterTag(null);
  }, [files, currentFolderId, filterTag, searchQuery]);

  function openFolder(id: number | null) {
    setCurrentFolderId(id);
    setSelected(null);
    setFilterTag(null);
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkDeleteError("");
  }

  function canDeleteFile(f: WorkspaceFile): boolean {
    return !locked && !!currentMember && (isManager || (!!f.ownerUserId && f.ownerUserId === currentMember.userId));
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
    const ids = files.filter((f) => selectedIds.has(f.id) && canDeleteFile(f)).map((f) => f.id);
    if (bulkDeleting || ids.length === 0) return;
    const skipped = selectedIds.size - ids.length;
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
    <div ref={workspaceRef} className="p-4 md:p-8 max-w-5xl mx-auto" style={{ overflowAnchor: "none" }}>
      <div className="mb-7">
        <div className="text-xs font-600 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          파일 워크스페이스 · {project.name}
        </div>
        <h1 className="text-2xl font-700">Workspace</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
          폴더 {folders.length}개 · 전체 파일 {files.length}개{locked && " · 종료된 프로젝트 (읽기 전용 보관함)"}
        </p>
      </div>

      {pendingUpload && <FileUploadDialog key={project.id} file={pendingUpload} destination={currentFolder ? `“${currentFolder.name}” 폴더` : "워크스페이스 루트"} onCancel={() => setPendingUpload(null)} onConfirm={(tags, note) => uploadBinary(pendingUpload, tags, note)} />}
      <WorkspaceCleanupNotice />
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm flex-wrap">
        <button
          onClick={() => openFolder(null)}
          {...(!locked && currentFolder ? dropHandlers("root") : {})}
          className="font-600"
          style={{ color: currentFolder ? "var(--primary)" : "var(--foreground)", ...dropStyle("root") }}
        >
          ⬡ 워크스페이스
        </button>
        {folderPath.map((f) => (
          <span key={f.id} className="contents">
            <span style={{ color: "var(--muted-foreground)" }}>/</span>
            {f.id === currentFolder?.id ? (
              <span className="font-700 flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color }} />
                <span className="truncate">{f.name}</span>
              </span>
            ) : (
              <button onClick={() => openFolder(f.id)} {...(!locked ? dropHandlers(f.id) : {})} className="font-600 truncate min-w-0" style={{ color: "var(--primary)", ...dropStyle(f.id) }}>
                {f.name}
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Folder grid: 루트의 폴더, 또는 현재 폴더의 하위 폴더 */}
      {(!currentFolder || childFolders.length > 0 || (!locked && canNestFolder)) && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-700">{currentFolder ? "하위 폴더" : "폴더"}</h2>
            {!locked && !creatingFolder && canNestFolder && (
              <button
                onClick={() => setCreatingFolder(true)}
                className="text-xs font-700 px-3 py-1.5 transition-all"
                style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}
              >
                + 새 폴더 만들기
              </button>
            )}
          </div>

          {folderError && <p role="alert" className="mb-3 text-sm text-red-500">{folderError}</p>}
          {creatingFolder && (
            <div className="flex gap-2 mb-3">
              <input
                autoFocus
                disabled={folderBusy}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleAddFolder(); }}
                placeholder="폴더 이름 (예: 발표 자료)"
                className="flex-1 text-sm px-3 py-2 border outline-none"
                style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-opaque)", fontFamily: "var(--font-outfit)" }}
              />
              <button
                onClick={handleAddFolder}
                disabled={folderBusy || !newFolderName.trim()}
                className="text-xs font-700 px-4 py-2"
                style={{
                  background: newFolderName.trim() ? "var(--primary)" : "var(--muted)",
                  color: newFolderName.trim() ? "#fff" : "var(--muted-foreground)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {folderBusy ? "생성 중…" : "만들기"}
              </button>
              <button
                disabled={folderBusy}
                onClick={() => { setCreatingFolder(false); setNewFolderName(""); setFolderError(""); }}
                className="text-xs font-600 px-3 py-2"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "var(--radius-sm)" }}
              >
                취소
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {childFolders.map((f) => {
              const count = files.filter((x) => x.folderId === f.id).length;
              const subCount = folders.filter((x) => x.parentId === f.id).length;
              return (
                <button
                  key={f.id}
                  onClick={() => openFolder(f.id)}
                  draggable={!locked}
                  onDragStart={(e) => { e.dataTransfer.setData(ITEM_DRAG_TYPE, "folder"); e.dataTransfer.effectAllowed = "move"; setDragging({ kind: "folder", id: f.id }); }}
                  onDragEnd={endDrag}
                  onDragOver={(e) => folderCardDragOver(e, f)}
                  onDragLeave={() => setDropSpot((cur) => (cur && ("into" in cur ? cur.into === f.id : cur.kind === "folder" && cur.id === f.id) ? null : cur))}
                  onDrop={(e) => folderCardDrop(e, f)}
                  title={!locked ? "끌어서 다른 폴더 안이나 경로로 옮기거나, 다른 폴더의 왼쪽·오른쪽 끝에 놓아 순서를 바꿀 수 있어요" : undefined}
                  className="flex items-center gap-3 p-4 text-left transition-all"
                  style={{
                    background: "var(--card-glass)", borderRadius: "var(--radius)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)", ...dropStyle(f.id),
                    // 순서 바꾸기로 놓을 자리: 카드 왼쪽(앞)·오른쪽(뒤)에 굵은 선
                    boxShadow: isSpot("folder", f.id, "before") ? "inset 4px 0 0 var(--primary), var(--shadow-card)" : isSpot("folder", f.id, "after") ? "inset -4px 0 0 var(--primary), var(--shadow-card)" : "var(--shadow-card)",
                    opacity: dragging?.kind === "folder" && dragging.id === f.id ? 0.5 : 1,
                  }}
                >
                  <div
                    className="w-10 h-10 flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${f.color}18`, color: f.color, borderRadius: "10px" }}
                  >
                    📁
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-700 truncate"><SearchHighlight text={f.name} query={searchQuery} /></div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{subCount > 0 && `폴더 ${subCount}개 · `}파일 {count}개 · {f.createdBy}</div>
                  </div>
                </button>
              );
            })}
            {!currentFolder && childFolders.length === 0 && !creatingFolder && (
              <div className="col-span-1 sm:col-span-2 md:col-span-3 p-6 text-center text-xs border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)", ...lineSafeStyle }}>
                아직 폴더가 없어요
              </div>
            )}
          </div>
        </div>
      )}

      {currentFolder && (
        <button
          onClick={() => openFolder(parentFolder?.id ?? null)}
          {...(!locked ? dropHandlers(parentFolder?.id ?? "root") : {})}
          className="mb-5 text-xs font-600 px-3 py-1.5"
          style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px", ...dropStyle(parentFolder?.id ?? "root") }}
        >
          {dragging !== null
            ? `⬆ 여기에 놓으면 상위(${parentFolder ? `“${parentFolder.name}” 폴더` : "워크스페이스 루트"})로 이동`
            : parentFolder ? "← 상위 폴더로" : "← 전체 폴더로"}
        </button>
      )}
      {moveError && <p role="alert" className="mb-3 text-sm text-red-500">{moveError}</p>}

      {!locked && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          {newDoc === null ? (
            <>
              <button type="button" onClick={() => setNewDoc({ kind: "doc", name: "" })} className="text-xs font-700 px-3 py-1.5" style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}>
                📄 + 새 문서 만들기
              </button>
              <button type="button" onClick={() => setNewDoc({ kind: "slides", name: "" })} className="text-xs font-700 px-3 py-1.5" style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}>
                🖼️ + 새 슬라이드 만들기
              </button>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>여러 명이 함께 편집할 수 있어요</span>
            </>
          ) : (
            <>
              <input
                autoFocus
                disabled={docBusy}
                value={newDoc.name}
                onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void createCollabFile(); if (e.key === "Escape") setNewDoc(null); }}
                placeholder={newDoc.kind === "doc" ? "문서 이름 (예: 회의록)" : "슬라이드 이름 (예: 중간발표)"}
                aria-label={newDoc.kind === "doc" ? "새 문서 이름" : "새 슬라이드 이름"}
                maxLength={100}
                className="flex-1 min-w-40 text-sm px-3 py-2 border outline-none"
                style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-opaque)", fontFamily: "var(--font-outfit)" }}
              />
              <button type="button" onClick={() => void createCollabFile()} disabled={docBusy} className="text-xs font-700 px-4 py-2" style={{ background: "var(--primary)", color: "#fff", borderRadius: "var(--radius-sm)" }}>{docBusy ? "만드는 중…" : "만들기"}</button>
              <button type="button" onClick={() => setNewDoc(null)} disabled={docBusy} className="text-xs font-600 px-3 py-2" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "var(--radius-sm)" }}>취소</button>
            </>
          )}
        </div>
      )}

      {currentFolder && !locked && (
        <label className="flex items-center gap-2 text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
          <span className="shrink-0 font-600">이 폴더 옮기기</span>
          <select
            value={currentFolder.parentId ?? ""}
            onChange={(e) => void moveFolder(currentFolder.id, e.target.value === "" ? null : Number(e.target.value))}
            aria-label="이 폴더를 옮길 곳"
            className="min-w-0 max-w-sm flex-1 text-xs px-2.5 py-1 border rounded-lg outline-none"
            style={{ background: "var(--card-glass)", borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            <option value="">워크스페이스 루트</option>
            {movableFolderTargets.map((fo) => <option key={fo.id} value={fo.id}>📁 {pathOf(fo).map((x) => x.name).join(" / ")}</option>)}
          </select>
        </label>
      )}
      {currentFolder && <WorkspaceDeleteActions key={`${project.id}:folder:${currentFolder.id}`} item={currentFolder} kind="folder" childCount={scoped.length + childFolders.length} onDeleted={() => openFolder(null)} />}
      {uploading && <p role="status" className="mb-3 text-sm">원본 파일을 업로드하고 있습니다…</p>}
      {currentMember && (
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
      )}
      {/* Upload zone */}
      {!locked && (
        <>
          <div
            className="mb-6 border-2 border-dashed p-5 text-center transition-all cursor-pointer"
            style={{
              borderColor: dragOver ? "var(--primary)" : "var(--border)",
              background: dragOver ? "var(--primary)08" : "var(--card-glass)",
              borderRadius: "var(--radius)",
              backdropFilter: "var(--panel-blur)",
              WebkitBackdropFilter: "var(--panel-blur)",
              ...lineSafeStyle,
            }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(ITEM_DRAG_TYPE)) return; e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
          >
            <input ref={fileInputRef} type="file" aria-label="새 파일 업로드" disabled={uploading} className="hidden" onChange={handleFileInput} />
            <div className="text-2xl mb-2">⬆</div>
            <div className="text-sm font-600">
              {currentFolder ? `"${currentFolder.name}" 폴더에 업로드` : "워크스페이스 루트에 업로드"} — 드래그하거나 클릭
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>PDF, DOCX, PPTX, XLSX, ZIP, 이미지 등 모든 형식 지원 · 파일당 최대 50MB</div>
          </div>

        </>
      )}

      <label className="block text-sm mb-4">파일 검색
        <input type="search" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setFilterTag(null); }} placeholder="프로젝트 전체 파일명·본문·태그·댓글 검색" className="block w-full mt-2 p-3 rounded-xl border" style={{ background: "var(--card-glass)", borderColor: "var(--border)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }} />
        {searchQuery.trim() && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>검색 결과 {filtered.length}개 · 본문은 현재 버전 기준</span>}
      </label>
      {/* Filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {tags.map((t) => (
          <button
            key={t === null ? "all-tags" : `tag:${t}`}
            onClick={() => setFilterTag(t)}
            className="text-xs font-600 px-3 py-1.5 border transition-all"
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
                className="ml-1.5 px-1 py-0.5 text-xs"
                style={{ background: filterTag === t ? "rgba(255,255,255,0.25)" : "var(--muted)", borderRadius: "2px" }}
              >
                {searchScope.filter((f) => f.tags.includes(t)).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
            파일 {filtered.length}개
          </div>
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
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && files.some((f) => selectedIds.has(f.id) && canDeleteFile(f)) && (
            <button
              onClick={() => void bulkDelete()}
              disabled={bulkDeleting}
              className="text-xs font-700 px-3 py-1.5 disabled:opacity-50"
              style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}
            >
              {bulkDeleting ? "삭제 중…" : `선택 삭제 (${files.filter((f) => selectedIds.has(f.id) && canDeleteFile(f)).length})`}
            </button>
          )}
          {filtered.some(canDeleteFile) && (
            <button
              onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); setBulkDeleteError(""); }}
              title={selectMode ? "선택 취소" : "여러 파일 선택해서 삭제"}
              aria-label={selectMode ? "선택 취소" : "여러 파일 선택해서 삭제"}
              className="w-8 h-8 flex items-center justify-center shrink-0 transition-all"
              style={{ background: selectMode ? "#ef4444" : "#ef444418", borderRadius: "20px" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={selectMode ? "#fff" : "#ef4444"} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {bulkDeleteError && <p role="alert" className="mb-3 text-sm text-red-500">{bulkDeleteError}</p>}
      {confirmDialog}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* File list */}
        <div
          ref={listRef}
          onPointerDown={startBand}
          className="relative col-span-1 md:col-span-3 flex flex-col gap-2 max-h-[580px] overflow-y-auto pr-1 pb-12"
          style={{ userSelect: band ? "none" : undefined }}
        >
          {selectedIds.size > 0 && !selectMode && (
            <div className="sticky top-0 z-10 flex items-center gap-2 flex-wrap px-3 py-2 text-xs font-600" style={{ background: "var(--primary)", color: "#fff", borderRadius: "var(--radius-sm)" }} role="status">
              <span>파일 {selectedIds.size}개 선택됨 · 끌어서 폴더로 옮기거나 순서를 바꿀 수 있어요</span>
              <button type="button" onClick={() => syncRef.current?.addDownload(sortedFiles.filter((f) => selectedIds.has(f.id)).map((f) => f.id))} className="ml-auto px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} title="고른 파일만 내 컴퓨터 폴더에 받아 두고, 새 버전이 생기면 다시 받아요">💻 로컬로 동기화</button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>선택 해제</button>
            </div>
          )}
          {sortedFiles.map((f) => {
            const tc = typeColors[f.type] || typeColors.doc;
            const deletable = canDeleteFile(f);
            const isSelected = selectMode || selectedIds.size > 0 ? selectedIds.has(f.id) : selected === f.id;
            return (
              <button
                key={f.id}
                data-file-row={f.id}
                draggable={!locked && !selectMode}
                onDragStart={(e) => startFileDrag(e, f)}
                onDragEnd={endDrag}
                onDragOver={(e) => fileRowDragOver(e, f)}
                onDragLeave={() => setDropSpot((cur) => (cur && !("into" in cur) && cur.kind === "file" && cur.id === f.id ? null : cur))}
                onDrop={(e) => fileRowDrop(e, f)}
                title={!locked && !selectMode ? "끌어서 폴더로 옮기거나 순서를 바꿀 수 있어요 · Ctrl/⌘·Shift+클릭이나 빈 곳에서 끌어 여러 개 선택" : undefined}
                onClick={(e) => clickFile(e, f, deletable)}
                className="flex items-center gap-3 p-4 border text-left transition-all group"
                style={{
                  background: isSelected ? "var(--primary)" : "var(--card)",
                  borderColor: isSelected ? "var(--primary)" : "var(--border)",
                  color: isSelected ? "#fff" : "var(--foreground)",
                  borderRadius: "var(--radius)",
                  opacity: (selectMode && !deletable) || (dragging?.kind === "files" && dragging.ids.includes(f.id)) ? 0.5 : 1,
                  boxShadow: isSpot("file", f.id, "before") ? "0 -3px 0 var(--primary)" : isSpot("file", f.id, "after") ? "0 3px 0 var(--primary)" : undefined,
                }}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!deletable}
                    onChange={() => deletable && toggleSelected(f.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 shrink-0"
                    aria-label={`${f.name} 선택`}
                  />
                )}
                {/* Type badge */}
                <div
                  className="w-9 h-9 flex items-center justify-center text-xs font-700 shrink-0"
                  style={{ background: isSelected ? "rgba(255,255,255,0.2)" : tc.bg, color: isSelected ? "#fff" : tc.color, borderRadius: "var(--radius-sm)" }}
                >
                  {tc.label}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-600 truncate"><SearchHighlight text={f.name} query={searchQuery} /></div>
                  {searchQuery.trim() && contentSnippet(currentFileText(f), searchQuery) && <p className="text-xs mt-1 line-clamp-2 break-words"><SearchHighlight text={contentSnippet(currentFileText(f), searchQuery)} query={searchQuery} /></p>}
                  <div className="flex items-center gap-2 mt-0.5" style={{ color: isSelected ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)" }}>
                    <span className="text-xs">{f.uploader}</span>
                    <span className="text-xs">·</span>
                    <span className="text-xs" style={{ fontFamily: "var(--font-jetbrains)" }}>{latestFileUploadTime(f)}</span>
                    <span className="text-xs">·</span>
                    <span className="text-xs">{f.size}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-xs px-1.5 py-0.5 font-600"
                    style={{ background: isSelected ? "rgba(255,255,255,0.2)" : `${tagColors[f.tag] || "#6b7280"}18`, color: isSelected ? "#fff" : tagColors[f.tag] || "#6b7280", borderRadius: "3px" }}
                  >
                    {f.tags.join(" · ") || "태그 없음"}
                  </span>
                  <span className="text-xs font-600" style={{ fontFamily: "var(--font-jetbrains)", color: isSelected ? "rgba(255,255,255,0.8)" : "var(--primary)" }}>
                    {f.versions.find((v) => v.current)?.version ?? "버전 없음"}
                  </span>
                  {editors.some((e) => e.fileId === f.id) && (
                    <span className="flex items-center gap-1 text-xs font-600" style={{ color: isSelected ? "#fde68a" : "#d97706" }}>
                      ✏️ <EditorAvatars editors={editors.filter((e) => e.fileId === f.id)} size={20} />
                    </span>
                  )}
                  {f.comments.length > 0 && (
                    <span
                      className="text-xs font-600 flex items-center gap-1"
                      style={{ color: isSelected ? "rgba(255,255,255,0.8)" : "var(--muted-foreground)" }}
                    >
                      💬 {f.comments.length}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="border-2 border-dashed p-8 text-center" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)", ...lineSafeStyle }}>
              {searchQuery.trim() ? "검색 결과가 없습니다" : currentFolder ? "이 폴더에는 파일이 없습니다" : "루트에 저장된 파일이 없습니다 (위 폴더를 열어보세요)"}
            </div>
          )}
          {band && (
            <div aria-hidden="true" className="absolute pointer-events-none" style={{
              left: Math.min(band.x0, band.x1), top: Math.min(band.y0, band.y1), width: Math.abs(band.x1 - band.x0), height: Math.abs(band.y1 - band.y0),
              background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.6)", borderRadius: 4,
            }} />
          )}
        </div>

        {/* Version panel */}
        <div className="col-span-1 md:col-span-2">
          {selFile ? (
            <div key={`${project.id}:${selFile.id}`} ref={detailPanelRef} className="p-5 border" style={{ background: "var(--card-glass)", borderColor: "var(--border)", borderRadius: "var(--radius)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)", minHeight: detailPanelHeight?.key === `${project.id}:${selFile.id}` ? detailPanelHeight.height : undefined }}>
              <div className="flex items-start justify-between gap-3 mb-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-xs font-700 px-2 py-0.5" style={{ background: typeColors[selFile.type]?.bg, color: typeColors[selFile.type]?.color, borderRadius: "3px" }}>
                  {typeColors[selFile.type]?.label}
                </span>
                <span className="text-xs px-2 py-0.5 font-600" style={{ background: `${tagColors[selFile.tag] || "#6b7280"}18`, color: tagColors[selFile.tag] || "#6b7280", borderRadius: "3px" }}>
                  {selFile.tags.join(" · ") || "태그 없음"}
                </span>
              </div>
              <WorkspaceDeleteActions item={selFile} kind="file" onDeleted={() => setSelected(null)} />
              </div>
              <h3 className="text-sm font-700 mt-2 mb-0.5 leading-snug break-words">{selFile.name}</h3>
              <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                {selFile.versions.length}개 버전 · 최근 업로드 {latestFileUploadTime(selFile)}
              </p>

              {!locked && (
                <label className="flex items-center gap-2 text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
                  <span className="shrink-0 font-600">폴더 이동</span>
                  <select
                    value={selFile.folderId ?? ""}
                    onChange={(e) => void moveFiles([selFile.id], e.target.value === "" ? null : Number(e.target.value))}
                    className="flex-1 min-w-0 text-xs px-2.5 py-1 border rounded-lg outline-none"
                    style={{ background: "var(--card-glass)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  >
                    <option value="">워크스페이스 루트(상위)</option>
                    {folders.map((fo) => <option key={fo.id} value={fo.id}>📁 {pathOf(fo).map((x) => x.name).join(" / ")}</option>)}
                  </select>
                </label>
              )}
              <FileTagEditor file={selFile} />
              {/* Tab toggle */}
              <div className="flex gap-1.5 mb-3 p-1" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                {(["versions", "comments"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      if (t === detailTab) return;
                      // Keep the scroll container's height when an empty tab
                      // replaces a long version history near the page bottom.
                      const height = detailPanelRef.current?.getBoundingClientRect().height;
                      if (height) setDetailPanelHeight({ key: `${project.id}:${selFile.id}`, height });
                      setDetailTab(t);
                    }}
                    className="flex-1 text-xs font-700 py-1.5 transition-all"
                    style={{
                      background: detailTab === t ? "var(--card)" : "transparent",
                      color: detailTab === t ? "var(--primary)" : "var(--muted-foreground)",
                      borderRadius: "7px",
                      boxShadow: detailTab === t ? "var(--shadow-card)" : "none",
                    }}
                  >
                    {t === "versions" ? `버전 이력 (${selFile.versions.length})` : `댓글 (${selFile.comments.length})`}
                  </button>
                ))}
              </div>

              {detailTab === "versions" ? (
                <FileVersionPanel file={selFile} searchQuery={searchQuery} onViewingVersionChange={setViewingVersionId} onSelectFile={(fileId) => { setSelected(fileId); setDetailTab("versions"); }} onQuickEdit={(mode, v) => void startQuickEdit(selFile, mode, v)} editorNames={[...new Set(editors.filter((e) => e.fileId === selFile.id).map((e) => e.name))]} presence={presenceRef.current} editors={editors} />
              ) : (
                <WorkspaceComments file={selFile} focusedVersionId={selFile.versions.some((v) => v.id === viewingVersionId) ? viewingVersionId : selFile.versions.find((v) => v.current)?.id ?? null} />
              )}
            </div>
          ) : (
            <div
              className="p-8 border text-center h-full flex flex-col items-center justify-center"
              style={{ borderColor: "var(--border)", borderStyle: "dashed", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
            >
              <div className="text-3xl mb-3">⬡</div>
              <div className="text-sm font-600">파일을 선택하면</div>
              <div className="text-sm">버전 이력을 확인할 수 있어요</div>
            </div>
          )}
        </div>
      </div>
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
    </div>
  );
}
