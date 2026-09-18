import { useState } from "react";
import type { WorkspaceFile } from "../api/types";
import { useProject } from "../context/ProjectContext";
import { parseFileTags, validateFileTags } from "../lib/workspaceFiles";

export default function FileTagEditor({ file }: { file: WorkspaceFile }) {
  const { project, setFileTags } = useProject();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const tags = parseFileTags(draft);
      validateFileTags(tags, file.type === "img");
      await setFileTags(file.id, tags); setEditing(false);
    } catch (e) { setError((e as { message?: string }).message ?? "태그 저장에 실패했습니다."); }
    finally { setBusy(false); }
  }
  if (project.status === "done") return null;
  return <div className="mb-4 text-xs">
    {!editing ? <button onClick={() => { setDraft(file.tags.join(", ")); setError(""); setEditing(true); }} className="px-3 py-2 rounded-full font-600 transition-opacity hover:opacity-80" style={{ background: "var(--secondary)", color: "var(--primary)" }}>태그 편집</button> : <div className="p-4 rounded-xl border space-y-3" style={{ background: "var(--muted)", borderColor: "var(--border)" }}>
      <label className="block font-600">파일 태그
        <input autoFocus aria-label="파일 태그" aria-describedby="file-tag-help" value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void save(); }} className="block w-full min-w-0 border rounded-xl px-3 py-2.5 mt-2 text-sm font-400 outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} placeholder="예: 디자인, 참고자료" />
      </label>
      <p id="file-tag-help" className="leading-relaxed" style={{ color: "var(--muted-foreground)" }}>쉼표로 구분 · 최대 10개 · 태그당 30자{file.type === "img" && <><br />이미지는 태그가 1개 이상 필요합니다.</>}</p>
      {error && <p role="alert" className="rounded-lg p-3 bg-red-50 text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button disabled={busy} onClick={() => setEditing(false)} className="px-4 py-2 rounded-full font-600 border transition-opacity hover:opacity-80 disabled:opacity-50" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>취소</button>
        <button disabled={busy} onClick={() => void save()} className="px-4 py-2 rounded-full font-600 transition-opacity hover:opacity-80 disabled:opacity-50" style={{ background: "var(--primary)", color: "white" }}>{busy ? "저장 중…" : "저장"}</button>
      </div>
    </div>}
  </div>;
}
