import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_WORKSPACE_FILE_SIZE, parseFileTags, validateFileTags, workspaceFileType } from "../lib/workspaceFiles";
import { workspaceUploadErrorMessage } from "../lib/workspaceUploadError";

export default function FileUploadDialog({ file, destination, initialTags = [], onCancel, onConfirm }: {
  file: File;
  destination: string;
  initialTags?: string[];
  onCancel: () => void;
  onConfirm: (tags: string[], note: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [tags, setTags] = useState(initialTags.join(", "));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const isImage = workspaceFileType(file.name) === "img" || file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isText = /\.(txt|md|csv|json|log|xml|yaml|yml)$/i.test(file.name);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let active = true;
    const objectUrl = URL.createObjectURL(isPdf ? new Blob([file], { type: "application/pdf" }) : file);
    setUrl(objectUrl);
    if (isText) void file.slice(0, 200_000).text().then((value) => {
      if (active) setText(value + (file.size > 200_000 ? "\n… 미리보기는 앞부분만 표시합니다." : ""));
    }).catch(() => { if (active) setPreviewFailed(true); });
    return () => { active = false; URL.revokeObjectURL(objectUrl); };
  }, [file, isText, isPdf]);
  async function confirm() {
    if (pending.current) return;
    setError("");
    try {
      const parsed = parseFileTags(tags);
      validateFileTags(parsed, isImage);
      if (file.size > MAX_WORKSPACE_FILE_SIZE) throw new Error("파일은 50MB까지 업로드할 수 있습니다.");
      pending.current = true; setBusy(true);
      await onConfirm(parsed, note);
    } catch (e) { setError(workspaceUploadErrorMessage(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  return createPortal(<dialog ref={dialog} aria-labelledby="upload-dialog-title" onCancel={(e) => { e.preventDefault(); if (!pending.current) onCancel(); }}
    className="m-auto w-[min(640px,calc(100vw-32px))] max-h-[90dvh] overflow-y-auto rounded-2xl p-0 border-0 shadow-xl backdrop:bg-black/40"
    style={{ background: "var(--card-glass)", color: "var(--foreground)", backdropFilter: "var(--panel-blur)", WebkitBackdropFilter: "var(--panel-blur)" }}>
    <form className="p-6 space-y-4" onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
      <h2 id="upload-dialog-title" className="text-xl font-700">파일을 업로드하시겠습니까?</h2>
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{destination}</p>
      <div><p className="text-xs mb-1">파일 제목</p><p className="font-600 break-all">{file.name}</p></div>
      <p className="text-sm">파일 크기: {file.size.toLocaleString("ko-KR")} B ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
        <p className="text-xs px-3 py-2">파일 미리보기</p>
        {previewFailed ? <p className="p-6 text-sm">이 파일의 미리보기를 표시할 수 없습니다.</p>
          : isImage ? <img src={url || undefined} alt={file.name} onError={() => setPreviewFailed(true)} className="w-full h-60 object-contain" />
          : isPdf ? <iframe src={url || undefined} title={`${file.name} 미리보기`} className="w-full h-64" />
          : isText ? <pre className="p-3 h-60 overflow-auto text-xs whitespace-pre-wrap break-words">{text}</pre>
          : <p className="p-6 text-sm">이 형식은 미리보기를 지원하지 않습니다. 파일을 확인한 후 업로드해 주세요.</p>}
      </div>
      <label className="block text-sm">태그 {isImage ? "(1개 이상 필수)" : "(선택)"}
        <input autoFocus disabled={busy} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="예: 디자인, 참고자료" className="block w-full mt-1 p-3 rounded-xl border" />
        <span className="text-xs">쉼표로 구분 · 최대 10개 · 태그당 30자</span>
      </label>
      <label className="block text-sm">업로드 메모 (선택)<input disabled={busy} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className="block w-full mt-1 p-3 rounded-xl border" /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onCancel} className="px-4 py-2 rounded-xl border disabled:opacity-50">취소</button>
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl disabled:opacity-50" style={{ background: "var(--primary)", color: "white" }}>{busy ? "본문 분석·업로드 중…" : "확인 · 업로드"}</button>
      </div>
    </form>
  </dialog>, document.body);
}
