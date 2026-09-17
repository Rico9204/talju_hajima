import FileUploadDialog from "./FileUploadDialog";
import { useEffect, useRef, useState } from "react";
import type { FileVersion, WorkspaceFile } from "../api/types";
import { useProject } from "../context/ProjectContext";
import { formatUploadTime, versionTree } from "../lib/workspaceFiles";

export default function FileVersionPanel({ file }: { file: WorkspaceFile }) {
  const { project, uploadWorkspaceFile, promoteFileVersion, pinFileVersion, downloadFileVersion } = useProject();
  const [baseId, setBaseId] = useState<number | null>(file.versions.find((v) => v.current)?.id ?? null);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [preview, setPreview] = useState<{ url?: string; text?: string; kind: string; name: string } | null>(null);
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
    } else setMessage("이 형식은 다운로드하여 해당 프로그램에서 열 수 있습니다.");
  }

  const tree = versionTree(file.versions).filter(({ version }) => !onlyPinned || version.pinned);
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
        <select aria-label="새 버전의 기준" value={baseId ?? ""} disabled={busy} onChange={(e) => setBaseId(e.target.value ? Number(e.target.value) : null)} className="w-full mt-1 p-2 rounded-lg" style={{ background: "var(--card)" }}>
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
    {preview && <section className="mt-4 border rounded-xl p-3" aria-label="버전 미리보기">
      <div className="flex justify-between gap-2 text-xs mb-2"><span className="break-all">{preview.name}</span><button onClick={closePreview}>닫기</button></div>
      {preview.kind === "image" && <img src={preview.url} alt={preview.name} className="w-full max-h-96 object-contain" />}
      {preview.kind === "pdf" && <iframe title={preview.name} src={preview.url} className="w-full h-96" />}
      {preview.kind === "text" && <pre className="text-xs whitespace-pre-wrap break-all max-h-96 overflow-auto">{preview.text}</pre>}
    </section>}
  </div>;
}
