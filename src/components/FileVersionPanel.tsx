import SearchHighlight from "./SearchHighlight";
import { lazy, Suspense } from "react";
import { createPortal } from "react-dom";
const PdfSearchPreview = lazy(() => import("./PdfSearchPreview"));
import FileUploadDialog from "./FileUploadDialog";
import VersionPageView from "./VersionPageView";
import { useEffect, useRef, useState } from "react";
import type { FileVersion, WorkspaceFile } from "../api/types";
import { useProject } from "../context/ProjectContext";
import { EDITABLE_TEXT_EXTENSIONS, formatUploadTime, isEditableTextFile, versionTree } from "../lib/workspaceFiles";

function highlightOfficeHtml(html: string, query: string): string {
  const term = query.trim();
  if (!term) return html;
  const document = new DOMParser().parseFromString(html, "text/html");
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(escaped, "gi");
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement?.tagName;
    if (node.textContent?.trim() && parent !== "SCRIPT" && parent !== "STYLE") textNodes.push(node as Text);
  }
  for (const textNode of textNodes) {
    if (!matcher.test(textNode.data)) {
      matcher.lastIndex = 0;
      continue;
    }
    matcher.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of textNode.data.matchAll(matcher)) {
      const start = match.index ?? 0;
      fragment.append(textNode.data.slice(cursor, start));
      const mark = document.createElement("mark");
      mark.textContent = match[0];
      fragment.append(mark);
      cursor = start + match[0].length;
    }
    fragment.append(textNode.data.slice(cursor));
    textNode.replaceWith(fragment);
  }
  return document.body.innerHTML;
}

export default function FileVersionPanel({ file, searchQuery = "", onViewingVersionChange, onQuickEdit, editorNames = [] }: { file: WorkspaceFile; searchQuery?: string; onViewingVersionChange?: (versionId: number | null) => void; onQuickEdit?: (mode: "main" | "pin", version?: FileVersion) => void; editorNames?: string[] }) {
  const { project, uploadWorkspaceFile, promoteFileVersion, pinFileVersion, downloadFileVersion } = useProject();
  const [baseId, setBaseId] = useState<number | null>(file.versions.find((v) => v.current)?.id ?? null);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [onlyPinned, setOnlyPinned] = useState(false);
  // 비전공자 기본값은 "페이지"(저장 순서로 넘기며 바뀐 줄 표시), 분기를 보려면 "버전 트리".
  const [viewMode, setViewMode] = useState<"page" | "tree">("page");
  const textCache = useRef(new Map<number, string | null>());
  const [preview, setPreview] = useState<{ url?: string; text?: string; html?: string; kind: string; name: string } | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const urls = useRef(new Set<string>());
  const locked = project.status === "done";
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); };
  }, []);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "요청을 처리하지 못했습니다."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }

  function closePreview() {
    if (preview?.url) { URL.revokeObjectURL(preview.url); urls.current.delete(preview.url); }
    setPreview(null);
    setPreviewZoom(1);
  }

  function openPreviewInNewWindow() {
    if (!preview) return;
    if (preview.url) {
      window.open(preview.url, "_blank", "noopener,noreferrer");
      return;
    }
    const body = preview.kind === "office"
      ? highlightOfficeHtml(preview.html ?? "", searchQuery)
      : `<pre style="white-space:pre-wrap;word-break:break-word;font:14px system-ui,sans-serif;line-height:1.6">${(preview.text ?? "").replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character] ?? character))}</pre>`;
    const url = URL.createObjectURL(new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${preview.name}</title><style>body{margin:32px;color:#1f2937;background:#fff}table{border-collapse:collapse}td,th{border:1px solid #d1d5db;padding:6px 10px;text-align:left}img{max-width:100%;height:auto}</style></head><body>${body}</body></html>`], { type: "text/html" }));
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function openVersion(v: FileVersion, download: boolean) {
    const blob = await downloadFileVersion(v.id);
    if (!mounted.current) return;
    const name = v.originalName ?? file.name;
    if (download) {
      const url = URL.createObjectURL(blob); urls.current.add(url);
      const link = document.createElement("a"); link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 60_000);
      return;
    }
    closePreview();
    const ext = name.split(".").pop()?.toLowerCase();
    const imageTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif" };
    const mime = ext === "pdf" ? "application/pdf" : imageTypes[ext ?? ""];
    if (mime) {
      const url = URL.createObjectURL(new Blob([blob], { type: mime })); urls.current.add(url);
      setPreview({ url, kind: ext === "pdf" ? "pdf" : "image", name });
    } else if (["txt", "md", "csv", "json", "log", "xml", "yaml", "yml"].includes(ext ?? "")) {
      const text = await blob.slice(0, 200_000).text();
      if (mounted.current) setPreview({ text: text + (blob.size > 200_000 ? "\n… 미리보기는 앞부분만 표시합니다." : ""), kind: "text", name });
    } else if (["docx", "xlsx", "xlsm", "pptx"].includes(ext ?? "")) {
      let text = v.searchText ?? "";
      let html = "";
      try {
        const { parseOffice } = await import("officeparser");
        const parserName = ext === "xlsm" ? name.replace(/\.xlsm$/i, ".xlsx") : name;
        const officeFile = new File([blob], parserName, { type: v.mimeType });
        const document = await parseOffice(officeFile, { includeRawContent: false });
        html = (await document.to("html")).value;
        if (!text) text = (await document.to("text")).value;
      } catch {
        if (!text) {
          const { extractWorkspaceText } = await import("../lib/extractWorkspaceText");
          const extracted = await extractWorkspaceText(new File([blob], name, { type: v.mimeType }));
          text = extracted.text;
        }
      }
      if (mounted.current) {
        setPreview({ html, text: text || "이 Office 파일에서 미리 볼 수 있는 텍스트를 찾지 못했습니다.", kind: html ? "office" : "text", name });
      }
    } else setMessage("이 형식은 다운로드하여 해당 프로그램에서 열 수 있습니다.");
  }

  async function loadVersionText(v: FileVersion): Promise<string | null> {
    if (textCache.current.has(v.id)) return textCache.current.get(v.id) ?? null;
    const ext = (v.originalName ?? file.name).split(".").pop()?.toLowerCase() ?? "";
    let text: string | null = null;
    if (EDITABLE_TEXT_EXTENSIONS.includes(ext) && v.storagePath) text = await (await downloadFileVersion(v.id)).text();
    else if (v.searchText) text = v.searchText; // docx/pptx/pdf 등은 검색용 추출 텍스트로 비교
    textCache.current.set(v.id, text);
    return text;
  }

  const tree = versionTree(file.versions).filter(({ version }) => !onlyPinned || version.pinned);
  const currentVersion = file.versions.find((v) => v.current);
  const actionClass = "text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-40";
  return <div>
    {pendingUpload && <FileUploadDialog file={pendingUpload} initialTags={file.tags} destination={`“${file.name}” 새 버전 · 기준: ${file.versions.find((v) => v.id === baseId)?.version ?? "첫 버전"}`} onCancel={() => setPendingUpload(null)} onConfirm={async (tags, note) => {
      if (locked) throw new Error("종료된 프로젝트에는 업로드할 수 없습니다.");
      const result = await uploadWorkspaceFile({ file: pendingUpload, fileId: file.id, folderId: file.folderId, baseVersionId: baseId, note, tags });
      if (!mounted.current) return;
      setPendingUpload(null); setBaseId(result.versionId); setOnlyPinned(false);
      setMessage(result.branched ? "분기 버전으로 저장했습니다. 검토 후 현재 버전으로 지정할 수 있습니다." : "새 현재 버전으로 저장했습니다.");
    }} />}
    {error && <p role="alert" className="text-sm p-3 mb-3 rounded-lg bg-red-50 text-red-700">{error}</p>}
    {message && <p role="status" className="text-xs p-3 mb-3 rounded-lg" style={{ background: "var(--secondary)" }}>{message}</p>}
    {!locked && <div className="p-3 mb-4 rounded-xl space-y-2" style={{ background: "var(--muted)" }}>
      <label className="text-xs block">새 버전의 기준
        <select aria-label="새 버전의 기준" value={baseId ?? ""} disabled={busy} onChange={(e) => setBaseId(e.target.value ? Number(e.target.value) : null)} className="w-full mt-1 p-2 rounded-lg" style={{ background: "var(--surface-opaque)" }}>
          {file.versions.length === 0 && <option value="">첫 버전</option>}
          {file.versions.map((v) => <option key={v.id} value={v.id}>{v.version}{v.current ? " · 현재" : ""}{v.pinned ? " · 핀" : ""} · {v.uploadedBy}</option>)}
        </select>
      </label>
      <input ref={input} type="file" className="hidden" aria-label="새 버전 파일" disabled={busy} onChange={(e) => {
        const binary = e.target.files?.[0]; e.target.value = "";
        if (!binary || locked || pending.current) return;
        setPendingUpload(binary);
      }} />
      <button disabled={busy} onClick={() => input.current?.click()} className="w-full py-2 rounded-lg text-xs font-600 disabled:opacity-40" style={{ background: "var(--primary)", color: "white" }}>{busy ? "처리 중…" : "+ 실제 파일로 새 버전 업로드"}</button>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>현재 버전이 아닌 이력에서 올리면 분기로 저장됩니다. 최대 50MB.</p>
    </div>}
    {!locked && onQuickEdit && currentVersion?.storagePath && isEditableTextFile(currentVersion.originalName ?? file.name, currentVersion.byteSize) && (
      <button type="button" disabled={busy} onClick={() => onQuickEdit("main")} className="w-full mb-3 py-2 rounded-lg text-xs font-700 disabled:opacity-40" style={{ background: "var(--secondary)", color: "var(--primary)" }}>
        ✏️ 바로 수정 (여러 명이 함께){editorNames.length > 0 && ` · 지금 ${editorNames.length}명 수정 중`}
      </button>
    )}
    <div className="flex gap-1.5 mb-3" role="tablist" aria-label="버전 보기 방식">
      {([["page", "페이지"], ["tree", "버전 트리"]] as const).map(([mode, label]) => <button key={mode} role="tab" aria-selected={viewMode === mode} onClick={() => setViewMode(mode)} className="text-xs font-700 px-3 py-1.5 rounded-full" style={{ background: viewMode === mode ? "var(--primary)" : "var(--muted)", color: viewMode === mode ? "#fff" : "var(--foreground)" }}>{label}</button>)}
    </div>
    {viewMode === "page" && <VersionPageView file={file} locked={locked} busy={busy} loadText={loadVersionText} onViewingVersionChange={onViewingVersionChange}
      onPinEdit={!locked && onQuickEdit ? (v) => onQuickEdit("pin", v) : undefined}
      onOpen={(v, download) => void run(() => openVersion(v, download))}
      onPromote={(v) => void run(async () => { await promoteFileVersion(file.id, v.id); if (mounted.current) { setBaseId(v.id); setMessage(`${v.version}을 현재 버전으로 지정했습니다.`); } })}
      onPin={(v) => void run(() => pinFileVersion(file.id, v.id, !v.pinned))} />}
    {viewMode === "tree" && <>
    <label className="flex items-center gap-2 text-xs mb-3"><input type="checkbox" checked={onlyPinned} onChange={(e) => setOnlyPinned(e.target.checked)} />핀한 버전만 보기</label>
    <div className="space-y-3 max-h-[560px] overflow-auto" aria-label="파일 버전 트리">
      {tree.map(({ version: v, depth }) => <div key={v.id} className="border-l-2 pl-3 py-1" style={{ marginLeft: Math.min(depth, 6) * 12, borderColor: v.current ? "var(--primary)" : "var(--border)" }}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-700"><span>{v.version}</span>{v.current && <span style={{ color: "var(--primary)" }}>현재</span>}{v.pinned && <span>📌 핀</span>}</div>
        <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{v.uploadedBy} · {formatUploadTime(v.uploadedAt, v.date)} · {v.size}</p>
        <p className="text-xs break-all mt-1">{v.originalName ?? file.name}</p>
        {v.parentVersionId !== null && <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>↳ {file.versions.find((parent) => parent.id === v.parentVersionId)?.version ?? "이전 버전"}에서 파생</p>}
        {v.note && <p className="text-xs mt-1 whitespace-pre-wrap break-words">{v.note}</p>}
        {!v.storagePath && <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>원본 없는 기존 기록</p>}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {v.storagePath && <><button className={actionClass} disabled={busy} onClick={() => void run(() => openVersion(v, false))}>미리보기</button><button className={actionClass} disabled={busy} onClick={() => void run(() => openVersion(v, true))}>다운로드</button></>}
          {!locked && <>
            {!v.current && v.storagePath && <button className={actionClass} disabled={busy} onClick={() => void run(async () => { await promoteFileVersion(file.id, v.id); if (mounted.current) { setBaseId(v.id); setMessage(`${v.version}을 현재 버전으로 지정했습니다.`); } })}>현재 버전으로</button>}
            <button className={actionClass} disabled={busy} onClick={() => void run(() => pinFileVersion(file.id, v.id, !v.pinned))}>{v.pinned ? "핀 해제" : "핀 고정"}</button>
            <button className={actionClass} disabled={busy} onClick={() => { setBaseId(v.id); setMessage(`${v.version} 기준으로 업로드할 파일을 선택해 주세요.`); input.current?.click(); }}>여기서 새 버전</button>
          </>}
        </div>
      </div>)}
      {tree.length === 0 && <p className="text-xs py-4">{onlyPinned ? "핀한 버전이 없습니다." : "아직 버전이 없습니다."}</p>}
    </div>
    </>}
    {preview && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,18,53,0.48)", backdropFilter: "blur(4px)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) closePreview(); }}>
      <section className="w-[min(96vw,1400px)] h-[min(88vh,900px)] flex flex-col border" aria-label="버전 미리보기" style={{ background: "var(--card-glass)", borderColor: "var(--border)", borderRadius: "var(--radius)", boxShadow: "0 24px 70px rgba(15,18,53,0.25)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <div className="text-xs font-700" style={{ color: "var(--primary)" }}>파일 미리보기</div>
            <div className="text-sm font-700 truncate mt-0.5">{preview.name}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={openPreviewInNewWindow} className="h-8 px-2.5 border rounded text-xs font-600">새 창에서 보기</button>
            <button type="button" onClick={() => setPreviewZoom((value) => Math.max(0.75, Number((value - 0.25).toFixed(2))))} aria-label="미리보기 축소" className="w-8 h-8 border rounded">−</button>
            <button type="button" onClick={() => setPreviewZoom(1)} className="min-w-14 h-8 border rounded text-xs">{Math.round(previewZoom * 100)}%</button>
            <button type="button" onClick={() => setPreviewZoom((value) => Math.min(2, Number((value + 0.25).toFixed(2))))} aria-label="미리보기 확대" className="w-8 h-8 border rounded">+</button>
            <button type="button" onClick={closePreview} aria-label="미리보기 닫기" className="ml-2 w-8 h-8 text-lg">×</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {preview.kind === "image" && <img src={preview.url} alt={preview.name} className="mx-auto max-w-full object-contain" style={{ maxHeight: "72vh", transform: `scale(${previewZoom})`, transformOrigin: "center top" }} />}
          {preview.kind === "pdf" && <Suspense fallback={<p className="text-xs">PDF를 불러오는 중…</p>}><PdfSearchPreview source={preview.url!} query={searchQuery} zoom={previewZoom} /></Suspense>}
          {preview.kind === "text" && <pre className="text-xs whitespace-pre-wrap break-all max-h-[72vh] overflow-auto p-4" style={{ background: "var(--muted)", transform: `scale(${previewZoom})`, transformOrigin: "top left" }}><SearchHighlight text={preview.text ?? ""} query={searchQuery} /></pre>}
          {preview.kind === "office" && <iframe title={`${preview.name} 문서 미리보기`} sandbox="" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;min-height:100%;background:#fff}body{zoom:${previewZoom};width:calc(100% / ${previewZoom});box-sizing:border-box;padding:24px;font:14px system-ui,sans-serif;color:#1f2937;line-height:1.6}table{border-collapse:collapse;max-width:none;overflow:auto}td,th{border:1px solid #d1d5db;padding:6px 10px;text-align:left}h1,h2,h3{margin-top:1.2em}img{max-width:100%;height:auto}mark{background:#facc15;color:#422006;border-radius:2px;padding:0 2px}</style></head><body>${highlightOfficeHtml(preview.html ?? "", searchQuery)}</body></html>`} className="w-full border" style={{ height: "100%", minHeight: "520px", borderColor: "var(--border)", borderRadius: "var(--radius-sm)", background: "#fff" }} />}
        </div>
      </section>
    </div>, document.body)}
  </div>;
}
