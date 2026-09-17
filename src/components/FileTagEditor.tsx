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
    {!editing ? <button onClick={() => { setDraft(file.tags.join(", ")); setError(""); setEditing(true); }} className="px-3 py-2 rounded-lg" style={{ background: "var(--secondary)", color: "var(--primary)" }}>태그 편집</button> : <div className="space-y-2">
      <label>파일 태그<input aria-label="파일 태그" value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void save(); }} className="block w-full border rounded-lg p-2 mt-1" placeholder="디자인, 참고자료" /></label>
      <p>쉼표로 구분 · 최대 10개 · 태그당 30자</p>
      <div className="flex gap-3"><button disabled={busy} onClick={() => void save()}>{busy ? "저장 중…" : "저장"}</button><button disabled={busy} onClick={() => setEditing(false)}>취소</button></div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </div>}
  </div>;
}
