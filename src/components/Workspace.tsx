import SearchHighlight from "./SearchHighlight";
import { matchesWorkspaceSearch, currentFileText, contentSnippet } from "../lib/workspaceSearch";
import WorkspaceComments from "./WorkspaceComments";
import FileUploadDialog from "./FileUploadDialog";
import { latestFileUploadTime } from "../lib/workspaceFiles";
import { useEffect, useLayoutEffect, useState, useRef } from "react";
import WorkspaceDeleteActions, { WorkspaceCleanupNotice } from "./WorkspaceDeleteActions";
import FileTagEditor from "./FileTagEditor";
import FileVersionPanel from "./FileVersionPanel";
import { useProject, type WorkspaceFile } from "../context/ProjectContext";
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

export interface WorkspaceFocus {
  fileId: number;
  folderId: number | null;
}

export default function Workspace({ focusFile }: { focusFile?: WorkspaceFocus | null }) {
  const { project, folders, files, addFolder, uploadWorkspaceFile, currentMember, isLeader, deleteWorkspaceFile, markSectionViewed } = useProject();
  const { lineSafeStyle } = useAccountBackground();
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
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
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [detailPanelHeight, setDetailPanelHeight] = useState<{ key: string; height: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
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
    setCreatingFolder(false);
    setFolderError("");
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkDeleteError("");
  }, [project.id]);

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
  const searchScope = searchQuery.trim() ? files.filter((f) => matchesWorkspaceSearch(f, searchQuery)) : scoped;
  const tags = [null, ...Array.from(new Set(searchScope.flatMap((f) => f.tags)))];
  const filtered = filterTag === null ? searchScope : searchScope.filter((f) => f.tags.includes(filterTag));
  const selFile = selected !== null ? files.find((f) => f.id === selected) || null : null;
  const locked = project.status === "done";
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
    return !locked && !!currentMember && (isLeader || (!!f.ownerUserId && f.ownerUserId === currentMember.userId));
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (bulkDeleting || selectedIds.size === 0) return;
    if (!window.confirm(`선택한 파일 ${selectedIds.size}개를 삭제하시겠습니까?\n모든 버전과 댓글도 함께 삭제되며 복구할 수 없습니다.`)) return;
    setBulkDeleting(true);
    setBulkDeleteError("");
    const ids = Array.from(selectedIds);
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
      await addFolder(newFolderName);
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
      <div className="flex items-center gap-2 mb-5 text-sm">
        <button
          onClick={() => openFolder(null)}
          className="font-600"
          style={{ color: currentFolder ? "var(--primary)" : "var(--foreground)" }}
        >
          ⬡ 워크스페이스
        </button>
        {currentFolder && (
          <>
            <span style={{ color: "var(--muted-foreground)" }}>/</span>
            <span className="font-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: currentFolder.color }} />
              {currentFolder.name}
            </span>
          </>
        )}
      </div>

      {/* Root: folder grid */}
      {!currentFolder && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-700">폴더</h2>
            {!locked && !creatingFolder && (
              <button
                onClick={() => setCreatingFolder(true)}
                className="text-xs font-700 px-3 py-1.5 transition-all"
                style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}
              >
                + 새 폴더 만들기
              </button>
            )}
          </div>

          {folderError && <p role="alert" className="mb-3 text-sm text-red-700">{folderError}</p>}
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
            {folders.map((f) => {
              const count = files.filter((x) => x.folderId === f.id).length;
              return (
                <button
                  key={f.id}
                  onClick={() => openFolder(f.id)}
                  className="flex items-center gap-3 p-4 text-left transition-all"
                  style={{ background: "var(--card-glass)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}
                >
                  <div
                    className="w-10 h-10 flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${f.color}18`, color: f.color, borderRadius: "10px" }}
                  >
                    📁
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-700 truncate"><SearchHighlight text={f.name} query={searchQuery} /></div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>파일 {count}개 · {f.createdBy}</div>
                  </div>
                </button>
              );
            })}
            {folders.length === 0 && !creatingFolder && (
              <div className="col-span-1 sm:col-span-2 md:col-span-3 p-6 text-center text-xs border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)", ...lineSafeStyle }}>
                아직 폴더가 없어요
              </div>
            )}
          </div>
        </div>
      )}

      {currentFolder && (
        <button
          onClick={() => openFolder(null)}
          className="mb-5 text-xs font-600 px-3 py-1.5"
          style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}
        >
          ← 전체 폴더로
        </button>
      )}

      {currentFolder && <WorkspaceDeleteActions key={`${project.id}:folder:${currentFolder.id}`} item={currentFolder} kind="folder" fileCount={scoped.length} onDeleted={() => openFolder(null)} />}
      {uploading && <p role="status" className="mb-3 text-sm">원본 파일을 업로드하고 있습니다…</p>}
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
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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

      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          파일 {filtered.length}개
        </div>
        <div className="flex items-center gap-2">
          {selectMode && selectedIds.size > 0 && (
            <button
              onClick={() => void bulkDelete()}
              disabled={bulkDeleting}
              className="text-xs font-700 px-3 py-1.5 disabled:opacity-50"
              style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}
            >
              {bulkDeleting ? "삭제 중…" : `선택 삭제 (${selectedIds.size})`}
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
      {bulkDeleteError && <p role="alert" className="mb-3 text-sm text-red-700">{bulkDeleteError}</p>}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* File list */}
        <div className="col-span-1 md:col-span-3 flex flex-col gap-2 max-h-[580px] overflow-y-auto pr-1">
          {filtered.map((f) => {
            const tc = typeColors[f.type] || typeColors.doc;
            const deletable = canDeleteFile(f);
            const isSelected = selectMode ? selectedIds.has(f.id) : selected === f.id;
            return (
              <button
                key={f.id}
                onClick={() => {
                  if (selectMode) { if (deletable) toggleSelected(f.id); return; }
                  setSelected(isSelected ? null : f.id); setDetailTab("versions");
                }}
                className="flex items-center gap-3 p-4 border text-left transition-all group"
                style={{
                  background: isSelected ? "var(--primary)" : "var(--card)",
                  borderColor: isSelected ? "var(--primary)" : "var(--border)",
                  color: isSelected ? "#fff" : "var(--foreground)",
                  borderRadius: "var(--radius)",
                  opacity: selectMode && !deletable ? 0.5 : 1,
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
                <FileVersionPanel file={selFile} searchQuery={searchQuery} />
              ) : (
                <WorkspaceComments file={selFile} />
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
    </div>
  );
}
