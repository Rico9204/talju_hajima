import { useState, useRef, useEffect, type ChangeEvent, type ClipboardEvent } from "react";
import { sanitizeBoardHtml } from "../lib/boardHtml";
import { useProjectManagement } from "../context/ProjectContext";
import { dataRepository } from "../api";
import { BOARD_CATEGORIES } from "../lib/boardData";
import { validateNewPollInput } from "../lib/boardPoll";
import type { BoardAttachment, BoardCategory, BoardPost, NewBoardPostInput } from "../api/types";

export default function CreatePostView({
  initialPost,
  defaultCategory,
  busy,
  onCancel,
  onCreate,
  onUpdate,
}: {
  initialPost?: BoardPost;
  defaultCategory: BoardCategory;
  busy: boolean;
  onCancel: () => void;
  onCreate: (post: NewBoardPostInput) => void;
  onUpdate?: (postId: number, patch: Partial<NewBoardPostInput>) => void;
}) {
  const { isAdmin } = useProjectManagement();

  const initialCat = initialPost?.category ?? defaultCategory;
  const safeCat = !isAdmin && initialCat === "notice" ? "free" : initialCat;
  const [category, setCategory] = useState<BoardCategory>(safeCat);
  const [title, setTitle] = useState(initialPost?.title ?? "");
  const editorRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<BoardAttachment[]>(initialPost?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 투표(Poll) 첨부 상태
  const [hasPoll, setHasPoll] = useState(!!initialPost?.poll);
  const [pollQuestion, setPollQuestion] = useState(initialPost?.poll?.question ?? "");
  const [pollOptions, setPollOptions] = useState<string[]>(
    initialPost?.poll?.options && initialPost.poll.options.length >= 2
      ? initialPost.poll.options.map((o) => o.text)
      : ["", ""]
  );
  const [pollAllowMultiple, setPollAllowMultiple] = useState(initialPost?.poll?.allowMultiple ?? false);
  const [pollIsAnonymous, setPollIsAnonymous] = useState(initialPost?.poll?.isAnonymous ?? false);
  const [pollHasDeadline, setPollHasDeadline] = useState(!!initialPost?.poll?.closesAt);
  const [pollDeadline, setPollDeadline] = useState(
    // datetime-local 입력은 기기 시간 기준이라 UTC(toISOString)로 넣으면 9시간 어긋난다.
    initialPost?.poll?.closesAt ? new Date(initialPost.poll.closesAt).toLocaleString("sv-SE").slice(0, 16).replace(" ", "T") : ""
  );
  const [hideImagePreview, setHideImagePreview] = useState(initialPost?.hideImagePreview ?? false);

  useEffect(() => {
    if (editorRef.current && initialPost?.content) {
      editorRef.current.innerHTML = sanitizeBoardHtml(initialPost.content);
      editorRef.current.querySelectorAll("img").forEach((img) => {
        const parent = img.parentElement;
        if (parent && parent.classList.contains("inline-block-img-wrapper") && parent.querySelector(".img-delete-btn")) {
          return;
        }
        const wrapper = document.createElement("div");
        wrapper.className = "relative inline-block my-3 max-w-full inline-block-img-wrapper group";
        wrapper.contentEditable = "false";
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.innerHTML = "<span>✕</span><span>삭제</span>";
        deleteBtn.className = "img-delete-btn absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-white bg-black/60 hover:bg-red-600 rounded-lg shadow-md backdrop-blur-sm transition-all cursor-pointer";
        deleteBtn.title = "이미지 삭제";
        deleteBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          wrapper.remove();
        };
        img.replaceWith(wrapper);
        wrapper.appendChild(img);
        wrapper.appendChild(deleteBtn);
      });
    }
  }, [initialPost]);

  // Uploads the image to Supabase Storage first, then swaps a placeholder for
  // the real <img> — Range objects go stale across an await, so the cursor
  // position is captured as a DOM node (the placeholder) instead of a Range.
  async function insertImageFile(file: File) {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const selection = window.getSelection();
    let range: Range | null = null;
    if (selection && selection.rangeCount > 0) {
      const activeRange = selection.getRangeAt(0);
      if (editorRef.current.contains(activeRange.commonAncestorContainer)) range = activeRange;
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
    }

    const placeholderId = `img-upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const placeholder = document.createElement("span");
    placeholder.id = placeholderId;
    placeholder.contentEditable = "false";
    placeholder.className = "text-xs px-2 py-1 inline-block my-1";
    placeholder.style.background = "var(--muted)";
    placeholder.style.borderRadius = "8px";
    placeholder.textContent = "🖼️ 이미지 업로드 중…";

    const trailingParagraph = document.createElement("p");
    trailingParagraph.innerHTML = "<br/>";
    range.deleteContents();
    range.insertNode(trailingParagraph);
    range.insertNode(placeholder);

    const newRange = document.createRange();
    newRange.setStart(trailingParagraph, 0);
    newRange.collapse(true);
    if (selection) { selection.removeAllRanges(); selection.addRange(newRange); }

    try {
      const uploaded = await dataRepository.uploadBoardAttachment(file);
      const placeholderEl = editorRef.current?.querySelector(`#${CSS.escape(placeholderId)}`);
      if (!placeholderEl) return;
      const container = document.createElement("div");
      container.className = "relative inline-block my-3 max-w-full inline-block-img-wrapper group";
      container.contentEditable = "false";
      const img = document.createElement("img");
      img.src = uploaded.url;
      img.alt = "본문 첨부 이미지";
      img.className = "max-w-full rounded-xl border shadow-sm block cursor-pointer";
      img.style.maxHeight = "450px";
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.innerHTML = "<span>✕</span><span>삭제</span>";
      deleteBtn.className = "img-delete-btn absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-white bg-black/60 hover:bg-red-600 rounded-lg shadow-md backdrop-blur-sm transition-all cursor-pointer";
      deleteBtn.title = "이미지 삭제";
      deleteBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); container.remove(); };
      container.appendChild(img);
      container.appendChild(deleteBtn);
      placeholderEl.replaceWith(container);
    } catch (e) {
      const placeholderEl = editorRef.current?.querySelector(`#${CSS.escape(placeholderId)}`);
      if (placeholderEl) placeholderEl.textContent = "⚠️ 이미지 업로드 실패";
      setError(e instanceof Error ? e.message : (e as { message?: string } | null)?.message || "이미지 업로드에 실패했습니다.");
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    let hasImage = false;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        hasImage = true;
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void insertImageFile(file);
      }
    }

    if (!hasImage) {
      const text = e.clipboardData.getData("text/plain");
      if (text) {
        e.preventDefault();
        document.execCommand("insertText", false, text);
      }
    }
  }

  function handleInlineImagePick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => { if (file.type.startsWith("image/")) void insertImageFile(file); });
    e.target.value = "";
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      const newAttachments = await Promise.all(files.map((file) => dataRepository.uploadBoardAttachment(file)));
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string } | null)?.message || "파일을 업로드하는 도중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }

  function getCleanedHtml(): string {
    if (!editorRef.current) return "";
    const clone = editorRef.current.cloneNode(true) as HTMLDivElement;
    clone.querySelectorAll(".img-delete-btn, button").forEach((btn) => btn.remove());
    clone.querySelectorAll("span[id^='img-upload-']").forEach((el) => el.remove());
    return clone.innerHTML.trim();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("제목을 입력해주세요."); return; }

    const cleanHtml = getCleanedHtml();
    const textOnly = editorRef.current?.innerText.trim() ?? "";
    if (!textOnly && !cleanHtml.includes("<img")) { setError("내용을 입력해주세요."); return; }

    let pollInput = undefined;
    if (hasPoll) {
      const pollValidationError = validateNewPollInput({
        question: pollQuestion,
        options: pollOptions,
        closesAt: pollHasDeadline && pollDeadline ? new Date(pollDeadline).toISOString() : null,
      });
      if (pollValidationError) {
        setError(pollValidationError);
        return;
      }
      pollInput = {
        question: pollQuestion.trim(),
        options: pollOptions.map((o) => o.trim()).filter(Boolean),
        allowMultiple: pollAllowMultiple,
        isAnonymous: pollIsAnonymous,
        closesAt: pollHasDeadline && pollDeadline ? new Date(pollDeadline).toISOString() : null,
      };
    }

    if (initialPost && onUpdate) {
      onUpdate(initialPost.id, {
        category,
        title: title.trim(),
        content: cleanHtml,
        attachments,
        poll: pollInput,
        hideImagePreview,
      });
    } else {
      onCreate({
        category,
        title: title.trim(),
        content: cleanHtml,
        attachments,
        poll: pollInput,
        hideImagePreview,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onCancel}
          className="px-3.5 py-2 text-xs font-700 transition-all flex items-center gap-1.5"
          style={{ background: "var(--card)", color: "var(--foreground)", borderRadius: "20px", boxShadow: "var(--shadow-card)" }}
        >
          <span>←</span>
          <span>목록으로 돌아가기</span>
        </button>
      </div>

      <div className="p-6 md:p-8 space-y-6" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
        <div className="border-b pb-4" style={{ borderColor: "var(--border)" }}>
          <h1 className="text-2xl font-800 flex items-center gap-2">
            <span>✏️</span> {initialPost ? "게시글 수정" : "새 게시글 작성"}
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
            원하는 게시판을 선택하고 내용 작성 및 이미지를 붙여넣기(Ctrl + V)해 보세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-700 mb-2" style={{ color: "var(--muted-foreground)" }}>게시판 카테고리</label>
            <div className="flex flex-wrap gap-2">
              {BOARD_CATEGORIES.filter((cat) => cat.id !== "notice" || isAdmin).map((cat) => {
                const active = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className="px-4 py-2 text-xs font-700 transition-all flex items-center gap-2"
                    style={{
                      background: active ? cat.badgeColor : "var(--muted)",
                      color: active ? "#fff" : "var(--foreground)",
                      borderRadius: "20px",
                      boxShadow: active ? `0 4px 12px ${cat.badgeColor}40` : "none",
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-700 mb-1.5" style={{ color: "var(--muted-foreground)" }}>제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="제목을 입력하세요"
              className="w-full px-4 py-3 text-sm md:text-base outline-none transition-all"
              style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "12px", color: "var(--foreground)" }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="text-xs font-700" style={{ color: "var(--muted-foreground)" }}>
                본문 (원하는 커서 위치에 이미지 Ctrl+V 붙여넣기 가능)
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setHideImagePreview(!hideImagePreview)}
                  className="px-3 py-1.5 text-xs font-700 inline-flex items-center gap-1.5 transition-all rounded-lg cursor-pointer"
                  style={{
                    background: hideImagePreview ? "rgba(239, 68, 68, 0.12)" : "var(--muted)",
                    color: hideImagePreview ? "#ef4444" : "var(--foreground)",
                    border: hideImagePreview ? "1px solid rgba(239, 68, 68, 0.35)" : "1px solid var(--border)",
                  }}
                  title="게시글 목록에서 마우스를 올려도 이미지 미리보기가 나타나지 않도록 방지합니다"
                >
                  <span>{hideImagePreview ? "🔒 미리보기 방지 ON" : "👁️ 미리보기 방지"}</span>
                </button>
                <label
                  className="cursor-pointer px-3 py-1.5 text-xs font-700 inline-flex items-center gap-1.5 transition-all"
                  style={{ background: "#2563eb18", color: "#2563eb", borderRadius: "8px" }}
                  title="커서 위치에 이미지 삽입"
                >
                  <span>📷 본문에 이미지 삽입</span>
                  <input type="file" accept="image/*" multiple onChange={handleInlineImagePick} className="hidden" />
                </label>
              </div>
            </div>
            <div
              ref={editorRef}
              contentEditable
              onPaste={handlePaste}
              className="w-full min-h-[320px] p-4 text-sm outline-none overflow-y-auto leading-relaxed transition-all"
              style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "12px", color: "var(--foreground)" }}
            />
            <div className="text-[11px] mt-1.5 px-1" style={{ color: "var(--muted-foreground)" }}>
              💡 팁: 캡처 이미지(Win+Shift+S)나 복사한 이미지를 <strong>Ctrl + V</strong>로 바로 붙여넣어 보세요!
            </div>
          </div>

          <div className="p-4 border rounded-xl" style={{ background: "var(--muted)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="text-xs font-700" style={{ color: "var(--muted-foreground)" }}>📎 일반 파일 첨부 (PDF, ZIP, 문서 등)</label>
              <label
                className="cursor-pointer px-3 py-1.5 text-xs font-700 inline-flex items-center gap-1.5 transition-all"
                style={{ background: "#8b5cf618", color: "#8b5cf6", borderRadius: "8px" }}
              >
                <span>📎 파일 첨부</span>
                <input type="file" multiple onChange={handleFileSelect} className="hidden" />
              </label>
            </div>
            {uploading && <div className="text-xs text-blue-500 mb-2 font-600">파일을 업로드하는 중...</div>}
            {attachments.length > 0 && (
              <div className="space-y-2 mt-2">
                {attachments.map((file) => (
                  <div key={file.id} className="flex items-center justify-between px-3.5 py-2.5 text-xs border" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "8px" }}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base">📄</span>
                      <span className="font-700 truncate">{file.name}</span>
                      <span style={{ color: "var(--muted-foreground)" }}>({file.size})</span>
                    </div>
                    <button type="button" onClick={() => removeAttachment(file.id)} className="w-6 h-6 flex items-center justify-center text-xs font-700 hover:text-red-500" title="제거">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 투표 (Poll) 첨부 영역 */}
          <div className="p-4 border rounded-xl space-y-4" style={{ background: "var(--muted)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📊</span>
                <span className="text-xs font-700" style={{ color: "var(--foreground)" }}>투표(Poll) 첨부</span>
                {hasPoll && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-bold">
                    활성화됨
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setHasPoll(!hasPoll)}
                className="px-3 py-1.5 text-xs font-700 rounded-lg transition-all"
                style={{
                  background: hasPoll ? "rgba(239, 68, 68, 0.1)" : "rgba(37, 99, 235, 0.1)",
                  color: hasPoll ? "#ef4444" : "#2563eb",
                }}
              >
                {hasPoll ? "✕ 투표 제거" : "+ 투표 만들기"}
              </button>
            </div>

            {hasPoll && (
              <div className="space-y-4 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <div>
                  <label className="block text-xs font-600 mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                    투표 질문 / 주제 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    maxLength={200}
                    placeholder="예: 정기 회의 요일 언제가 좋으신가요? (최대 200자)"
                    className="w-full px-3.5 py-2.5 text-xs md:text-sm outline-none transition-all"
                    style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--foreground)" }}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>
                      투표 항목 (최소 2개 ~ 최대 10개) <span className="text-red-500">*</span>
                    </label>
                    {pollOptions.length < 10 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions([...pollOptions, ""])}
                        className="text-xs font-bold text-blue-500 hover:underline"
                      >
                        + 항목 추가
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs font-semibold w-5 text-center" style={{ color: "var(--muted-foreground)" }}>
                          {idx + 1}.
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...pollOptions];
                            next[idx] = e.target.value;
                            setPollOptions(next);
                          }}
                          maxLength={100}
                          placeholder={`항목 ${idx + 1}`}
                          className="flex-1 px-3 py-2 text-xs md:text-sm outline-none"
                          style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--foreground)" }}
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                            className="w-7 h-7 flex items-center justify-center text-xs font-bold text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="항목 삭제"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 투표 추가 설정 */}
                <div className="p-3 rounded-xl space-y-2.5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "var(--foreground)" }}>⚙️ 투표 추가 설정</div>
                  <div className="flex flex-wrap gap-4 text-xs font-medium" style={{ color: "var(--foreground)" }}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pollAllowMultiple}
                        onChange={(e) => setPollAllowMultiple(e.target.checked)}
                        className="rounded"
                      />
                      <span>복수 선택 허용 (다중 투표)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pollIsAnonymous}
                        onChange={(e) => setPollIsAnonymous(e.target.checked)}
                        className="rounded"
                      />
                      <span>익명 투표 (참여자 명단 숨김)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pollHasDeadline}
                        onChange={(e) => setPollHasDeadline(e.target.checked)}
                        className="rounded"
                      />
                      <span>마감일 설정</span>
                    </label>
                  </div>

                  {pollHasDeadline && (
                    <div className="pt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>마감 일시:</span>
                      <input
                        type="datetime-local"
                        value={pollDeadline}
                        onChange={(e) => setPollDeadline(e.target.value)}
                        className="px-3 py-1.5 text-xs outline-none rounded-lg"
                        style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {error && <div className="text-xs font-600 text-red-500">{error}</div>}

          <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <button type="button" onClick={onCancel} className="px-6 py-2.5 text-xs font-600" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "40px" }}>
              취소
            </button>
            <button type="submit" disabled={uploading || busy} className="px-6 py-2.5 text-xs font-700 disabled:opacity-50" style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
              {busy ? "저장 중…" : initialPost ? "수정 완료" : "작성 완료"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
