import { useEffect, useState, useRef } from "react";
import { getDocument, GlobalWorkerOptions, Util } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useProject } from "../context/ProjectContext";

GlobalWorkerOptions.workerSrc = pdfWorker;

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

function highlightMatches(text: string, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;
  const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`(${escapedQuery})`, "gi");
  return text.split(matcher).map((part, index) =>
    part.toLocaleLowerCase() === trimmedQuery.toLocaleLowerCase() ? (
      <mark key={`${part}-${index}`} style={{ background: "#facc15", color: "#422006", borderRadius: "2px", padding: "0 2px" }}>
        {part}
      </mark>
    ) : part,
  );
}

function contentSnippet(content: string, query: string): string {
  const matchIndex = content.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase());
  if (matchIndex < 0) return content.slice(0, 140);
  const start = Math.max(0, matchIndex - 55);
  const end = Math.min(content.length, matchIndex + query.trim().length + 85);
  return `${start > 0 ? "..." : ""}${content.slice(start, end)}${end < content.length ? "..." : ""}`;
}

const PREVIEW_DB_NAME = "collabpeer-workspace-previews";
const PREVIEW_STORE_NAME = "files";

function openPreviewDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PREVIEW_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(PREVIEW_STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadLocalPreview(key: string): Promise<Blob | null> {
  try {
    const db = await openPreviewDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(PREVIEW_STORE_NAME, "readonly").objectStore(PREVIEW_STORE_NAME).get(key);
      request.onsuccess = async () => {
        if (request.result instanceof Blob) {
          resolve(request.result);
          return;
        }
        if (typeof request.result === "string") {
          resolve(await fetch(request.result).then((response) => response.blob()));
          return;
        }
        resolve(null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    try {
      const data = localStorage.getItem(key);
      return data ? await fetch(data).then((response) => response.blob()) : null;
    } catch {
      return null;
    }
  }
}

async function saveLocalPreviewData(key: string, data: Blob): Promise<void> {
  try {
    const db = await openPreviewDb();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(PREVIEW_STORE_NAME, "readwrite").objectStore(PREVIEW_STORE_NAME).put(data, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem(key, typeof reader.result === "string" ? reader.result : "");
        } catch {
          // The browser storage fallback is optional for large files.
        }
      };
      reader.readAsDataURL(data);
    } catch {
      // The database preview remains available when browser storage is unavailable.
    }
  }
}

async function loadLocalText(key: string): Promise<string> {
  try {
    const db = await openPreviewDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(PREVIEW_STORE_NAME, "readonly").objectStore(PREVIEW_STORE_NAME).get(`${key}:text`);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : "");
      request.onerror = () => reject(request.error);
    });
  } catch {
    return "";
  }
}

async function saveLocalText(key: string, text: string): Promise<void> {
  try {
    const db = await openPreviewDb();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(PREVIEW_STORE_NAME, "readwrite").objectStore(PREVIEW_STORE_NAME).put(text, `${key}:text`);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Supabase content storage remains the durable search index when available.
  }
}

async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdf = await getDocument({ data: new Uint8Array(data) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const text = await page.getTextContent();
    pages.push(text.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n").trim();
}

function PdfHighlightViewer({ source, query }: { source: string; query: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();
    setStatus("loading");
    let renderVersion = 0;

    fetch(source).then((response) => response.arrayBuffer()).then((data) => getDocument({ data: new Uint8Array(data) }).promise).then(async (pdf) => {
      if (cancelled) return;
      const renderPages = async () => {
        const currentVersion = ++renderVersion;
        if (!container || cancelled) return;
        container.replaceChildren();
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (cancelled || currentVersion !== renderVersion) return;
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, container.getBoundingClientRect().width - 16);
        const scale = Math.min(1.25, availableWidth / baseViewport.width);
        const viewport = page.getViewport({ scale });
        const pageElement = document.createElement("div");
        pageElement.style.cssText = `position:relative;width:${viewport.width}px;max-width:100%;height:${viewport.height}px;margin:0 auto 16px;background:#fff;box-shadow:0 1px 5px #0002;`;

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.cssText = "display:block;width:100%;height:100%;max-width:100%;";
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
        if (cancelled || currentVersion !== renderVersion) return;
        pageElement.appendChild(canvas);
        container.appendChild(pageElement);

        const textContent = await page.getTextContent();
        const textLayer = document.createElement("div");
        textLayer.style.cssText = "position:absolute;inset:0;overflow:hidden;line-height:1;pointer-events:none;";
        const normalizedQuery = query.trim().toLocaleLowerCase();

        for (const item of textContent.items) {
          if (!("str" in item) || !item.str) continue;
          const transform = Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.max(6, Math.hypot(transform[2], transform[3]));
          const text = document.createElement("span");
          text.style.cssText = `position:absolute;left:${transform[4]}px;top:${transform[5] - fontHeight}px;font-size:${fontHeight}px;height:${fontHeight * 1.2}px;white-space:pre;color:transparent;font-family:sans-serif;`;
          if (normalizedQuery && item.str.toLocaleLowerCase().includes(normalizedQuery)) {
            const lower = item.str.toLocaleLowerCase();
            let cursor = 0;
            let matchIndex = lower.indexOf(normalizedQuery);
            while (matchIndex >= 0) {
              text.append(document.createTextNode(item.str.slice(cursor, matchIndex)));
              const mark = document.createElement("mark");
              mark.textContent = item.str.slice(matchIndex, matchIndex + normalizedQuery.length);
              mark.style.cssText = "background:#facc15;color:#422006;border-radius:2px;padding:0 1px;";
              text.appendChild(mark);
              cursor = matchIndex + normalizedQuery.length;
              matchIndex = lower.indexOf(normalizedQuery, cursor);
            }
            text.append(document.createTextNode(item.str.slice(cursor)));
          } else {
            text.textContent = item.str;
          }
          textLayer.appendChild(text);
        }
        if (cancelled || currentVersion !== renderVersion) return;
        pageElement.appendChild(textLayer);
      }
      };
      await renderPages();
      if (cancelled) return;
      const resizeTarget = container.parentElement;
      let observedWidth = resizeTarget?.clientWidth ?? container.clientWidth;
      const resizeObserver = new ResizeObserver(() => {
        const nextWidth = resizeTarget?.clientWidth ?? container.clientWidth;
        if (nextWidth === observedWidth) return;
        observedWidth = nextWidth;
        void renderPages();
      });
      if (resizeTarget) resizeObserver.observe(resizeTarget);
      (container as HTMLDivElement & { __pdfResizeObserver?: ResizeObserver }).__pdfResizeObserver = resizeObserver;
      if (!cancelled) setStatus("ready");
    }).catch(() => {
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      (container as HTMLDivElement & { __pdfResizeObserver?: ResizeObserver }).__pdfResizeObserver?.disconnect();
      container.replaceChildren();
    };
  }, [source, query]);

  return (
    <div>
      {status === "loading" && <div className="text-xs py-4 text-center" style={{ color: "var(--muted-foreground)" }}>PDF 페이지를 불러오는 중...</div>}
      {status === "error" && <div className="text-xs py-4 text-center" style={{ color: "#ef4444" }}>PDF를 표시하지 못했습니다.</div>}
      <div ref={containerRef} className="w-full overflow-auto p-2" style={{ background: "#e5e7eb", minHeight: "240px", maxHeight: "620px" }} />
    </div>
  );
}

export interface WorkspaceFocus {
  fileId: number;
  folderId: number | null;
}

export default function Workspace({ focusFile }: { focusFile?: WorkspaceFocus | null }) {
  const { project, folders, files, addFolder, addFile, addFileVersion, addFileComment, team } = useProject();
  const authorColor = (name: string) => team.members.find((m) => m.name === name)?.color || "#6b7280";
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<"versions" | "content" | "comments">("versions");
  const [filterTag, setFilterTag] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [localContents, setLocalContents] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentFolderId(null);
    setSelected(null);
    setFilterTag("전체");
    setCreatingFolder(false);
  }, [project.id]);

  useEffect(() => {
    if (focusFile) {
      setCurrentFolderId(focusFile.folderId);
      setSelected(focusFile.fileId);
      setDetailTab("versions");
      setFilterTag("전체");
    }
  }, [focusFile]);

  useEffect(() => {
    let cancelled = false;
    const missing = files.filter((file) => !file.previewData || !file.content);
    Promise.all(missing.map(async (file) => {
      const key = `workspace-preview:${project.id}:${file.name}:${file.size}`;
      const [blob, text] = await Promise.all([loadLocalPreview(key), loadLocalText(key)]);
      return [file.id, blob ? URL.createObjectURL(blob) : "", text] as const;
    })).then((entries) => {
      if (cancelled) return;
      setLocalPreviews((current) => ({ ...current, ...Object.fromEntries(entries.filter(([, data]) => data).map(([id, data]) => [id, data])) }));
      setLocalContents((current) => ({ ...current, ...Object.fromEntries(entries.filter(([, , text]) => text).map(([id, , text]) => [id, text])) }));
    });
    return () => {
      cancelled = true;
    };
  }, [files, project.id]);

  useEffect(() => {
    let cancelled = false;
    const filesWithStoredPdf = files.filter((file) => file.type === "pdf" && !file.content && file.previewData);
    Promise.all(filesWithStoredPdf.map(async (file) => {
      try {
        const response = await fetch(file.previewData as string);
        const text = await extractPdfText(await response.arrayBuffer());
        await saveLocalText(`workspace-preview:${project.id}:${file.name}:${file.size}`, text);
        return [file.id, text] as const;
      } catch {
        return [file.id, ""] as const;
      }
    })).then((entries) => {
      if (cancelled) return;
      setLocalContents((current) => ({ ...current, ...Object.fromEntries(entries.filter(([, text]) => text)) }));
    });
    return () => {
      cancelled = true;
    };
  }, [files, project.id]);

  const currentFolder = currentFolderId !== null ? folders.find((f) => f.id === currentFolderId) || null : null;
  const previewStorageKey = (name: string, size: string) => `workspace-preview:${project.id}:${name}:${size}`;
  const filesWithLocalPreviews = files.map((file) => {
    return { ...file, content: file.content || localContents[file.id] || "", previewData: file.previewData || localPreviews[file.id] || "" };
  });
  const scoped = filesWithLocalPreviews.filter((f) => f.folderId === currentFolderId);
  const tags = ["전체", ...Array.from(new Set(scoped.map((f) => f.tag)))];
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const searchableText = (file: (typeof filesWithLocalPreviews)[number]) => [
    file.name,
    file.content,
    file.type,
    file.tag,
    file.uploader,
    ...file.versions.flatMap((version) => [version.note, version.uploadedBy]),
    ...file.comments.flatMap((comment) => [comment.text, comment.author]),
  ].filter(Boolean).join(" ").toLocaleLowerCase();
  const searchResults = normalizedSearch ? filesWithLocalPreviews.filter((file) => searchableText(file).includes(normalizedSearch)) : scoped;
  const filtered = normalizedSearch
    ? searchResults
    : filterTag === "전체" ? scoped : scoped.filter((f) => f.tag === filterTag);
  const selFile = selected !== null ? filesWithLocalPreviews.find((f) => f.id === selected) || null : null;
  const locked = project.status === "done";

  function openFolder(id: number | null) {
    setCurrentFolderId(id);
    setSelected(null);
    setFilterTag("전체");
  }

  function selectFile(file: (typeof files)[number]) {
    setCurrentFolderId(file.folderId);
    setSelected(file.id);
    setDetailTab("versions");
  }

  async function readSearchableContent(file: File): Promise<string> {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      try {
        return await extractPdfText(await file.arrayBuffer());
      } catch {
        return "";
      }
    }
    const textExtensions = /\.(txt|md|csv|json|js|jsx|ts|tsx|css|html|xml|yml|yaml|sql)$/i;
    if (!textExtensions.test(file.name) || file.size > 1_000_000) return "";
    try {
      return await file.text();
    } catch {
      return "";
    }
  }

  async function readPreviewData(file: File): Promise<string> {
    const isPreviewable = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!isPreviewable || file.size > 10_000_000) return "";
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  async function saveLocalPreview(file: File) {
    const key = previewStorageKey(file.name, formatBytes(file.size));
    await saveLocalPreviewData(key, file);
  }

  async function saveLocalSearchText(file: File, text: string) {
    if (!text) return;
    await saveLocalText(previewStorageKey(file.name, formatBytes(file.size)), text);
  }

  function formatBytes(bytes: number): string {
    return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
  }

  function handleAddFolder() {
    if (!newFolderName.trim() || locked) return;
    addFolder(newFolderName);
    setNewFolderName("");
    setCreatingFolder(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (locked) return;
    const dropped = e.dataTransfer.files[0];
    if (!dropped) return;
    const previewData = await readPreviewData(dropped);
    const searchableContent = await readSearchableContent(dropped);
    await saveLocalPreview(dropped);
    await saveLocalSearchText(dropped, searchableContent);
    await addFile(dropped.name, dropped.size, currentFolderId, uploadNote, searchableContent, previewData);
    setUploadNote("");
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const previewData = await readPreviewData(f);
    const searchableContent = await readSearchableContent(f);
    await saveLocalPreview(f);
    await saveLocalSearchText(f, searchableContent);
    await addFile(f.name, f.size, currentFolderId, uploadNote, searchableContent, previewData);
    setUploadNote("");
    e.target.value = "";
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-7">
        <div className="text-xs font-600 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          파일 워킹스페이스 · {project.name}
        </div>
        <h1 className="text-3xl font-600" style={{ fontFamily: "var(--font-fraunces)" }}>Workspace</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
          폴더 {folders.length}개 · 전체 파일 {files.length}개{locked && " · 종료된 프로젝트 (읽기 전용 보관함)"}
        </p>
      </div>

      <div className="mb-5 flex items-center gap-3 border px-4 py-3" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "var(--radius)" }}>
        <span className="text-lg" aria-hidden="true">⌕</span>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="워크스페이스 파일명과 내용 검색..."
          aria-label="워크스페이스 파일 검색"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ fontFamily: "var(--font-outfit)" }}
        />
        {searchQuery && <span className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>{searchResults.length}개 결과</span>}
      </div>

      {normalizedSearch && (
        <div className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
          프로젝트 전체에서 파일명, 본문, 메모, 댓글을 검색하고 있습니다.
        </div>
      )}

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

          {creatingFolder && (
            <div className="flex gap-2 mb-3">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddFolder()}
                placeholder="폴더 이름 (예: 발표 자료)"
                className="flex-1 text-sm px-3 py-2 border outline-none"
                style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontFamily: "var(--font-outfit)" }}
              />
              <button
                onClick={handleAddFolder}
                className="text-xs font-700 px-4 py-2"
                style={{
                  background: newFolderName.trim() ? "var(--primary)" : "var(--muted)",
                  color: newFolderName.trim() ? "#fff" : "var(--muted-foreground)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                만들기
              </button>
              <button
                onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}
                className="text-xs font-600 px-3 py-2"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "var(--radius-sm)" }}
              >
                취소
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {folders.map((f) => {
              const count = files.filter((x) => x.folderId === f.id).length;
              return (
                <button
                  key={f.id}
                  onClick={() => openFolder(f.id)}
                  className="flex items-center gap-3 p-4 text-left transition-all"
                  style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
                >
                  <div
                    className="w-10 h-10 flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${f.color}18`, color: f.color, borderRadius: "10px" }}
                  >
                    📁
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-700 truncate">{f.name}</div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>파일 {count}개 · {f.createdBy}</div>
                  </div>
                </button>
              );
            })}
            {folders.length === 0 && !creatingFolder && (
              <div className="col-span-3 p-6 text-center text-xs border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}>
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

      {/* Upload zone */}
      {!locked && (
        <>
          <div
            className="mb-6 border-2 border-dashed p-5 text-center transition-all cursor-pointer"
            style={{
              borderColor: dragOver ? "var(--primary)" : "var(--border)",
              background: dragOver ? "var(--primary)08" : "var(--card)",
              borderRadius: "var(--radius)",
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />
            <div className="text-2xl mb-2">⬆</div>
            <div className="text-sm font-600">
              {currentFolder ? `"${currentFolder.name}" 폴더에 업로드` : "워크스페이스 루트에 업로드"} — 드래그하거나 클릭
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>PDF, DOCX, PPTX, XLSX, ZIP, 이미지 등 모든 형식 지원</div>
          </div>

          <div className="mb-5 flex gap-3">
            <input
              type="text"
              value={uploadNote}
              onChange={(e) => setUploadNote(e.target.value)}
              placeholder="업로드 메모 (버전 노트)..."
              className="flex-1 text-sm px-3 py-2 border outline-none"
              style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontFamily: "var(--font-outfit)" }}
            />
          </div>
        </>
      )}

      {/* Filter */}
      {!normalizedSearch && <div className="flex gap-2 mb-5 flex-wrap">
        {tags.map((t) => (
          <button
            key={t}
            onClick={() => setFilterTag(t)}
            className="text-xs font-600 px-3 py-1.5 border transition-all"
            style={{
              background: filterTag === t ? "var(--primary)" : "var(--card)",
              borderColor: filterTag === t ? "var(--primary)" : "var(--border)",
              color: filterTag === t ? "#fff" : "var(--foreground)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {t}
            {t !== "전체" && (
              <span
                className="ml-1.5 px-1 py-0.5 text-xs"
                style={{ background: filterTag === t ? "rgba(255,255,255,0.25)" : "var(--muted)", borderRadius: "2px" }}
              >
                {scoped.filter((f) => f.tag === t).length}
              </span>
            )}
          </button>
        ))}
      </div>}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* File list */}
        <div className="col-span-1 md:col-span-7 flex flex-col gap-2">
          {filtered.map((f) => {
            const tc = typeColors[f.type] || typeColors.doc;
            const isSelected = selected === f.id;
            return (
              <button
                key={f.id}
                onClick={() => isSelected ? setSelected(null) : selectFile(f)}
                className="flex items-center gap-3 p-4 border text-left transition-all group"
                style={{
                  background: isSelected ? "var(--primary)" : "var(--card)",
                  borderColor: isSelected ? "var(--primary)" : "var(--border)",
                  color: isSelected ? "#fff" : "var(--foreground)",
                  borderRadius: "var(--radius)",
                }}
              >
                {/* Type badge */}
                <div
                  className="w-9 h-9 flex items-center justify-center text-xs font-700 shrink-0"
                  style={{ background: isSelected ? "rgba(255,255,255,0.2)" : tc.bg, color: isSelected ? "#fff" : tc.color, borderRadius: "var(--radius-sm)" }}
                >
                  {tc.label}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-600 truncate">{highlightMatches(f.name, normalizedSearch)}</div>
                  <div className="flex items-center gap-2 mt-0.5" style={{ color: isSelected ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)" }}>
                    <span className="text-xs">{f.uploader}</span>
                    <span className="text-xs">·</span>
                    <span className="text-xs" style={{ fontFamily: "var(--font-jetbrains)" }}>{f.date}</span>
                    <span className="text-xs">·</span>
                    <span className="text-xs">{f.size}</span>
                  </div>
                  {normalizedSearch && f.content && searchableText(f).includes(normalizedSearch) && (
                    <div className="text-xs mt-1 truncate" style={{ color: isSelected ? "rgba(255,255,255,0.78)" : "var(--muted-foreground)" }}>
                      {highlightMatches(contentSnippet(f.content, normalizedSearch), normalizedSearch)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-xs px-1.5 py-0.5 font-600"
                    style={{ background: isSelected ? "rgba(255,255,255,0.2)" : `${tagColors[f.tag] || "#6b7280"}18`, color: isSelected ? "#fff" : tagColors[f.tag] || "#6b7280", borderRadius: "3px" }}
                  >
                    {f.tag}
                  </span>
                  <span className="text-xs font-600" style={{ fontFamily: "var(--font-jetbrains)", color: isSelected ? "rgba(255,255,255,0.8)" : "var(--primary)" }}>
                    {f.versions[0].version}
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
            <div className="border-2 border-dashed p-8 text-center" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}>
              {normalizedSearch ? "검색 결과가 없습니다" : currentFolder ? "이 폴더에는 파일이 없습니다" : "루트에 저장된 파일이 없습니다 (위 폴더를 열어보세요)"}
            </div>
          )}
        </div>

        {/* Version panel */}
        <div className="col-span-1 md:col-span-5">
          {selFile ? (
            <div className="p-5 border" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "var(--radius)" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-700 px-2 py-0.5" style={{ background: typeColors[selFile.type]?.bg, color: typeColors[selFile.type]?.color, borderRadius: "3px" }}>
                  {typeColors[selFile.type]?.label}
                </span>
                <span className="text-xs px-2 py-0.5 font-600" style={{ background: `${tagColors[selFile.tag] || "#6b7280"}18`, color: tagColors[selFile.tag] || "#6b7280", borderRadius: "3px" }}>
                  {selFile.tag}
                </span>
              </div>
              <h3 className="text-sm font-700 mt-2 mb-0.5 leading-snug">{selFile.name}</h3>
              <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                {selFile.versions.length}개 버전 · 최근 업로드 {selFile.date}
              </p>

              {/* Add version */}
              {!locked && detailTab === "versions" && (
                <button
                  onClick={() => { addFileVersion(selFile.id, uploadNote); setUploadNote(""); }}
                  className="w-full text-xs font-600 py-2 mb-4 border transition-all"
                  style={{ borderColor: "var(--primary)", color: "var(--primary)", borderRadius: "var(--radius-sm)", background: "transparent" }}
                >
                  + 새 버전 업로드
                </button>
              )}

              {/* Tab toggle */}
              <div className="flex gap-1.5 mb-3 p-1" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                {(["versions", "content", "comments"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDetailTab(t)}
                    className="flex-1 text-xs font-700 py-1.5 transition-all"
                    style={{
                      background: detailTab === t ? "var(--card)" : "transparent",
                      color: detailTab === t ? "var(--primary)" : "var(--muted-foreground)",
                      borderRadius: "7px",
                      boxShadow: detailTab === t ? "var(--shadow-card)" : "none",
                    }}
                  >
                      {t === "versions" ? `버전 이력 (${selFile.versions.length})` : t === "content" ? "내용" : `댓글 (${selFile.comments.length})`}
                  </button>
                ))}
              </div>

              {detailTab === "versions" ? (
                <div className="flex flex-col">
                  {selFile.versions.map((v, i) => (
                    <div key={i} className="flex gap-3">
                      {/* Timeline line */}
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ background: v.current ? "var(--primary)" : "var(--border)" }} />
                        {i < selFile.versions.length - 1 && <div className="flex-1 w-px mt-1" style={{ background: "var(--border)" }} />}
                      </div>
                      <div className="pb-4 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-700" style={{ fontFamily: "var(--font-jetbrains)", color: v.current ? "var(--primary)" : "var(--foreground)" }}>
                            {v.version}
                          </span>
                          {v.current && (
                            <span className="text-xs px-1.5 py-0.5 font-600" style={{ background: "var(--primary)18", color: "var(--primary)", borderRadius: "3px" }}>
                              현재
                            </span>
                          )}
                          <span className="text-xs ml-auto" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{v.date}</span>
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{v.uploadedBy} · {v.size}</div>
                        <div className="text-xs mt-1 leading-relaxed" style={{ color: "var(--foreground)" }}>{v.note}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : detailTab === "content" ? (
                selFile.type === "pdf" && selFile.previewData ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-600" style={{ color: "var(--primary)" }}>PDF 원본 미리보기</div>
                        <a href={selFile.previewData} target="_blank" rel="noreferrer" className="text-xs font-600" style={{ color: "var(--primary)" }}>새 탭에서 열기</a>
                      </div>
                      <PdfHighlightViewer source={selFile.previewData} query={normalizedSearch} />
                    </div>
                  </div>
                ) : selFile.type === "pdf" ? (
                  <div>
                    <div className="border-2 border-dashed p-6 text-center" style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", color: "var(--muted-foreground)" }}>
                      <div className="text-sm font-600 mb-1">PDF 원본이 없습니다</div>
                      <div className="text-xs leading-relaxed">미리보기를 위해 PDF를 다시 업로드해주세요.</div>
                    </div>
                  </div>
                ) : selFile.previewData && selFile.type === "img" ? (
                  <img src={selFile.previewData} alt={selFile.name} className="w-full object-contain border" style={{ maxHeight: "520px", borderColor: "var(--border)", borderRadius: "var(--radius-sm)" }} />
                ) : selFile.content ? (
                  <div>
                    <div className="text-xs mb-2" style={{ color: "var(--muted-foreground)" }}>
                      저장된 텍스트 본문
                    </div>
                    <pre
                      className="text-xs leading-relaxed whitespace-pre-wrap break-words overflow-auto p-3"
                      style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "var(--radius-sm)", maxHeight: "420px", fontFamily: "var(--font-jetbrains)" }}
                    >
                      {highlightMatches(selFile.content, normalizedSearch)}
                    </pre>
                  </div>
                ) : (
                  <div className="border-2 border-dashed p-6 text-center" style={{ borderColor: "var(--border)", borderRadius: "var(--radius-sm)", color: "var(--muted-foreground)" }}>
                    <div className="text-sm font-600 mb-1">저장된 본문이 없습니다</div>
                    <div className="text-xs leading-relaxed">텍스트 파일은 업로드할 때 본문을 저장할 수 있습니다. PDF, DOCX, 이미지 파일은 현재 파일 정보와 버전 이력만 보관합니다.</div>
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-3">
                  {selFile.comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700 shrink-0"
                        style={{ background: `${authorColor(c.author)}18`, color: authorColor(c.author) }}
                      >
                        {c.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-700">{c.author}</span>
                          <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{c.date}</span>
                        </div>
                        <p className="text-xs mt-0.5 leading-relaxed px-3 py-2" style={{ background: "var(--muted)", borderRadius: "10px", color: "var(--foreground)" }}>
                          {c.text}
                        </p>
                      </div>
                    </div>
                  ))}
                  {selFile.comments.length === 0 && (
                    <div className="text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>
                      아직 댓글이 없어요. 첫 코멘트를 남겨보세요.
                    </div>
                  )}
                  {!locked && (
                    <div className="flex gap-2 mt-1">
                      <input
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (addFileComment(selFile.id, commentDraft), setCommentDraft(""))}
                        placeholder="이 파일에 코멘트 남기기..."
                        className="flex-1 text-xs px-3 py-2 outline-none"
                        style={{ background: "var(--muted)", borderRadius: "20px", fontFamily: "var(--font-outfit)" }}
                      />
                      <button
                        onClick={() => { addFileComment(selFile.id, commentDraft); setCommentDraft(""); }}
                        className="px-3 text-xs font-700 shrink-0 transition-all"
                        style={{
                          background: commentDraft.trim() ? "var(--primary)" : "var(--muted)",
                          color: commentDraft.trim() ? "#fff" : "var(--muted-foreground)",
                          borderRadius: "20px",
                        }}
                      >
                        등록
                      </button>
                    </div>
                  )}
                </div>
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
