import { useEffect, useState, useRef } from "react";
import { useProject } from "../context/ProjectContext";

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
  const { project, folders, files, addFolder, addFile, addFileVersion, addFileComment, team } = useProject();
  const authorColor = (name: string) => team.members.find((m) => m.name === name)?.color || "#6b7280";
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<"versions" | "comments">("versions");
  const [filterTag, setFilterTag] = useState("전체");
  const [dragOver, setDragOver] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
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

  const currentFolder = currentFolderId !== null ? folders.find((f) => f.id === currentFolderId) || null : null;
  const scoped = files.filter((f) => f.folderId === currentFolderId);
  const tags = ["전체", ...Array.from(new Set(scoped.map((f) => f.tag)))];
  const filtered = filterTag === "전체" ? scoped : scoped.filter((f) => f.tag === filterTag);
  const selFile = selected !== null ? files.find((f) => f.id === selected) || null : null;
  const locked = project.status === "done";

  function openFolder(id: number | null) {
    setCurrentFolderId(id);
    setSelected(null);
    setFilterTag("전체");
  }

  function handleAddFolder() {
    if (!newFolderName.trim() || locked) return;
    addFolder(newFolderName);
    setNewFolderName("");
    setCreatingFolder(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (locked) return;
    const dropped = e.dataTransfer.files[0];
    if (!dropped) return;
    addFile(dropped.name, dropped.size, currentFolderId, uploadNote);
    setUploadNote("");
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    addFile(f.name, f.size, currentFolderId, uploadNote);
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
      <div className="flex gap-2 mb-5 flex-wrap">
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
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* File list */}
        <div className="col-span-3 flex flex-col gap-2">
          {filtered.map((f) => {
            const tc = typeColors[f.type] || typeColors.doc;
            const isSelected = selected === f.id;
            return (
              <button
                key={f.id}
                onClick={() => { setSelected(isSelected ? null : f.id); setDetailTab("versions"); }}
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
                  <div className="text-sm font-600 truncate">{f.name}</div>
                  <div className="flex items-center gap-2 mt-0.5" style={{ color: isSelected ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)" }}>
                    <span className="text-xs">{f.uploader}</span>
                    <span className="text-xs">·</span>
                    <span className="text-xs" style={{ fontFamily: "var(--font-jetbrains)" }}>{f.date}</span>
                    <span className="text-xs">·</span>
                    <span className="text-xs">{f.size}</span>
                  </div>
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
              {currentFolder ? "이 폴더에는 파일이 없습니다" : "루트에 저장된 파일이 없습니다 (위 폴더를 열어보세요)"}
            </div>
          )}
        </div>

        {/* Version panel */}
        <div className="col-span-2">
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
                {(["versions", "comments"] as const).map((t) => (
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
                    {t === "versions" ? `버전 이력 (${selFile.versions.length})` : `댓글 (${selFile.comments.length})`}
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
