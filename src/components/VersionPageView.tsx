import { useEffect, useMemo, useState } from "react";
import type { FileVersion, WorkspaceFile } from "../api/types";
import { buildFullTextDiff } from "../lib/textDiff";
import { formatUploadTime, isEditableTextFile, fileOriginalAuthor } from "../lib/workspaceFiles";
import { isRichDocName } from "../lib/richDoc";
import { isSlidesName } from "../lib/slidesDoc";

// 비전공자용 "페이지" 보기 — 분기 트리 대신 저장 순서대로 한 번에 버전 하나만 보여주고
// 이전/다음으로 넘긴다. 각 페이지는 실제로 고쳐 만든 부모 버전(parentVersionId)과 비교해
// 바뀐 줄만 표시한다. 시작 페이지는 항상 현재 버전.
const MAX_DIFF_CHARS = 200_000;

export default function VersionPageView({ file, locked, busy, loadText, onOpen, onPromote, onPin, onPinEdit, onViewingVersionChange }: {
  file: WorkspaceFile;
  locked: boolean;
  busy: boolean;
  // null = 줄 단위 비교를 지원하지 않는 형식(이미지·PDF 등, 추출 텍스트도 없음)
  loadText: (version: FileVersion) => Promise<string | null>;
  onOpen: (version: FileVersion, download: boolean) => void;
  onPromote: (version: FileVersion) => void;
  onPin: (version: FileVersion) => void;
  // 핀 버전에서 바로 수정 시작(분기). 텍스트 파일·진행 중 프로젝트에서만 전달된다.
  onPinEdit?: (version: FileVersion) => void;
  // 지금 보는 페이지(버전)를 부모에 알려 댓글 탭이 "이 버전" 기준으로 동작하게 한다.
  onViewingVersionChange?: (versionId: number | null) => void;
}) {
  const pages = useMemo(() => [...file.versions].sort((a, b) => a.id - b.id), [file.versions]);
  const currentIndex = Math.max(0, pages.findIndex((v) => v.current));
  const [index, setIndex] = useState(currentIndex);
  const [expanded, setExpanded] = useState(true);
  const [texts, setTexts] = useState<{ id: number; cur: string | null; prev: string | null } | null>(null);

  // 파일 내 타인 수정 표시 온/오프 (기본값: true, localStorage에 저장)
  const [showOtherEditorMarks, setShowOtherEditorMarks] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("talju:workspace:showOtherEditorMarks");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  function toggleOtherEditorMarks() {
    setShowOtherEditorMarks((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("talju:workspace:showOtherEditorMarks", String(next));
      } catch {}
      return next;
    });
  }

  useEffect(() => { setIndex(currentIndex); }, [currentIndex, pages.length]);

  const version = pages[index];
  const parent = version?.parentVersionId != null ? pages.find((v) => v.id === version.parentVersionId) ?? null : null;

  useEffect(() => { onViewingVersionChange?.(version?.id ?? null); }, [version?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!version) return;
    let active = true;
    setTexts(null);
    void (async () => {
      const cur = await loadText(version).catch(() => null);
      const prev = parent ? await loadText(parent).catch(() => null) : null;
      if (active) setTexts({ id: version.id, cur, prev });
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id, parent?.id]);

  const ready = texts?.id === version?.id ? texts : null;
  const tooLong = !!ready?.cur && (ready.cur.length > MAX_DIFF_CHARS || (ready.prev?.length ?? 0) > MAX_DIFF_CHARS);
  const lines = useMemo(
    () => (ready?.cur != null && !tooLong ? buildFullTextDiff(parent && ready.prev != null ? ready.prev : "", ready.cur) : []),
    [ready, parent, tooLong],
  );
  const canCompare = !!parent && ready?.prev != null;
  const changed = canCompare ? lines.filter((l) => l.changed).length : 0;

  if (!version) return <p className="text-xs py-4">아직 버전이 없습니다.</p>;

  const originalAuthor = fileOriginalAuthor(file);
  const editor = version.uploadedBy?.trim() || originalAuthor;
  const isOtherEditor = Boolean(editor && originalAuthor && editor !== originalAuthor);

  const isCurrent = version.current;
  const actionClass = "text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-40";
  const summary = !ready ? "불러오는 중…"
    : ready.cur == null ? "이 형식은 줄 단위 비교를 지원하지 않아요"
    : tooLong ? "내용이 너무 길어 변경 표시를 생략했어요"
    : !parent ? "맨 처음 저장한 내용"
    : ready.prev == null ? "수정 전 버전을 비교할 수 없어요"
    : changed === 0 ? "수정 전 버전과 내용이 같음"
    : `${changed}줄 수정됨`;
  const stepClass = "text-xs font-700 px-3 py-1.5 rounded-full disabled:opacity-40";

  return (
    <div aria-label="파일 버전 페이지">
      <div className="p-3 mb-2 rounded-xl" style={{ background: isCurrent ? "var(--primary)" : "var(--muted)", color: isCurrent ? "#fff" : "var(--foreground)" }}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="min-w-0 text-xs">
            <span className="font-700">{version.version}</span>{" "}
            <span style={{ opacity: 0.8 }}>{version.uploadedBy} · {formatUploadTime(version.uploadedAt, version.date)}</span>
          </div>
          <div className="flex gap-1 shrink-0 text-xs font-600">
            {version.pinned && <span>📌</span>}
            {isCurrent && <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.25)" }}>지금 쓰는 내용</span>}
          </div>
        </div>
        {version.note && <p className="text-xs italic mb-1.5 whitespace-pre-wrap break-words" style={{ opacity: 0.85 }}>“{version.note}”</p>}
        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs font-600" style={{ color: isCurrent ? "#fff" : "var(--primary)" }}>
            {summary} {expanded ? "▲" : "▼"}
          </button>
          {isOtherEditor && (
            <button
              type="button"
              role="switch"
              aria-checked={showOtherEditorMarks}
              onClick={toggleOtherEditorMarks}
              className="text-[11px] font-600 px-2 py-0.5 rounded-full flex items-center gap-1 transition-all border"
              style={{
                background: showOtherEditorMarks ? (isCurrent ? "rgba(255,255,255,0.25)" : "#fef3c7") : (isCurrent ? "rgba(0,0,0,0.15)" : "var(--card)"),
                borderColor: showOtherEditorMarks ? (isCurrent ? "rgba(255,255,255,0.4)" : "#fde68a") : "var(--border)",
                color: showOtherEditorMarks ? (isCurrent ? "#fff" : "#b45309") : (isCurrent ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)"),
              }}
              title="원작자가 아닌 다른 사람이 수정한 내용의 파일 내 강조 표시를 켜거나 끕니다"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: showOtherEditorMarks ? (isCurrent ? "#fde047" : "#ea580c") : "currentColor" }} />
              <span>타인({editor}) 수정 표시 {showOtherEditorMarks ? "ON" : "OFF"}</span>
            </button>
          )}
        </div>
        {expanded && isOtherEditor && showOtherEditorMarks && (
          <div
            className="text-[11px] px-2.5 py-1 mb-1.5 rounded-md flex items-center justify-between gap-1"
            style={{
              background: isCurrent ? "rgba(255,255,255,0.15)" : "rgba(245, 158, 11, 0.12)",
              color: isCurrent ? "#fff" : "#b45309",
              border: isCurrent ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(245, 158, 11, 0.25)",
            }}
          >
            <span>✏️ 원작자 <strong>{originalAuthor}</strong> 님이 아닌 <strong>{editor}</strong> 님이 수정한 버전입니다.</span>
            <span className="opacity-80">파일 내 변경 줄에 표시됨</span>
          </div>
        )}
        {expanded && ready?.cur != null && !tooLong && (
          <div className="text-xs whitespace-pre-wrap break-words p-2 mb-2 max-h-72 overflow-y-auto rounded-lg" style={{ background: isCurrent ? "rgba(255,255,255,0.15)" : "var(--card)", fontFamily: "var(--font-jetbrains)" }}>
            {lines.map((line, i) => {
              const isOtherChange = isOtherEditor && line.changed && canCompare;
              return (
                <div
                  key={i}
                  title={
                    canCompare && line.changed
                      ? isOtherChange && showOtherEditorMarks
                        ? `[${editor}] 님이 수정한 줄 (원작자: ${originalAuthor}${line.oldText != null ? ` · 수정 전: ${line.oldText || "(빈 줄)"}` : " · 새로 추가된 줄"})`
                        : (line.oldText != null ? `수정 전: ${line.oldText || "(빈 줄)"}` : "새로 추가된 줄")
                      : undefined
                  }
                  style={
                    line.changed && canCompare
                      ? isOtherChange && showOtherEditorMarks
                        ? {
                            background: isCurrent ? "rgba(249, 115, 22, 0.4)" : "#ffedd5",
                            color: isCurrent ? "#fff" : "#9a3412",
                            borderRadius: 3,
                            borderLeft: isCurrent ? "3px solid #fdba74" : "3px solid #ea580c",
                            paddingLeft: 4,
                            marginBottom: 1,
                          }
                        : {
                            background: isCurrent ? "rgba(253,224,71,0.35)" : "#fef08a",
                            color: isCurrent ? "#fff" : "#422006",
                            borderRadius: 3,
                            marginBottom: 1,
                          }
                      : undefined
                  }
                >
                  {isOtherChange && showOtherEditorMarks && (
                    <span
                      className="inline-block mr-1.5 px-1 py-0.2 text-[10px] font-700 rounded select-none"
                      style={{
                        background: isCurrent ? "rgba(255, 255, 255, 0.25)" : "rgba(234, 88, 12, 0.15)",
                        color: isCurrent ? "#ffedd5" : "#c2410c",
                      }}
                      title={`원작자: ${originalAuthor} → 수정자: ${editor}`}
                    >
                      {editor} 수정
                    </span>
                  )}
                  {line.text || " "}
                </div>
              );
            })}
            {lines.length === 0 && <span style={{ opacity: 0.7 }}>(빈 파일)</span>}
          </div>
        )}
        {expanded && ready?.cur == null && ready && (
          <p className="text-xs mb-2" style={{ opacity: 0.85 }}>이미지·PDF 같은 파일은 “미리보기”로 열어서 확인하세요.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {version.storagePath && <>
            <button className={actionClass} style={{ background: "var(--card)", color: "var(--foreground)" }} disabled={busy} onClick={() => onOpen(version, false)}>미리보기</button>
            <button className={actionClass} style={{ background: "var(--card)", color: "var(--foreground)" }} disabled={busy} onClick={() => onOpen(version, true)}>다운로드</button>
          </>}
          {!locked && !isCurrent && version.storagePath && (
            <button className={actionClass} style={{ background: "var(--primary)", color: "#fff" }} disabled={busy} onClick={() => onPromote(version)}>이 버전으로 되돌리기</button>
          )}
          {!locked && <button className={actionClass} style={{ background: "var(--card)", color: "var(--foreground)" }} disabled={busy} onClick={() => onPin(version)}>{version.pinned ? "핀 해제" : "핀 고정"}</button>}
          {onPinEdit && version.pinned && version.storagePath && (isEditableTextFile(version.originalName ?? file.name, version.byteSize) || isRichDocName(version.originalName ?? file.name) || isSlidesName(version.originalName ?? file.name)) && (
            <button className={actionClass} style={{ background: "var(--card)", color: "var(--foreground)" }} disabled={busy} onClick={() => onPinEdit(version)}>✏️ 이 핀 버전에서 수정</button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={stepClass} style={{ background: "var(--muted)" }} disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>← 이전 페이지</button>
        <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{index + 1} / {pages.length}</span>
        <button type="button" className={stepClass} style={{ background: "var(--muted)" }} disabled={index === pages.length - 1} onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))}>다음 페이지 →</button>
      </div>
    </div>
  );
}
