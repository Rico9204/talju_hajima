import { useState, useEffect } from "react";
import {
  type EditorFontItem,
  DEFAULT_EDITOR_FONTS,
  POPULAR_FONT_PRESETS,
  loadCustomFonts,
  saveCustomFonts,
  injectWebFont,
  loadDefaultFontName,
  saveDefaultFontName,
} from "../lib/editorFonts";

export default function AddFontModal({
  onClose,
  onFontAdded,
  isOffice = false,
}: {
  onClose: () => void;
  onFontAdded?: (font: EditorFontItem) => void;
  isOffice?: boolean;
}) {
  const [customFonts, setCustomFonts] = useState<EditorFontItem[]>(loadCustomFonts);
  const [name, setName] = useState("");
  const [family, setFamily] = useState("");
  const [webFontUrl, setWebFontUrl] = useState("");
  const [defaultOfficeFont, setDefaultOfficeFont] = useState(loadDefaultFontName);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleAddCustomFont(customName: string, customFamily: string, customUrl?: string) {
    const trimmedName = customName.trim();
    const trimmedFamily = customFamily.trim() || trimmedName;
    if (!trimmedName) {
      setError("글꼴 이름을 입력해 주세요.");
      return;
    }

    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newFont: EditorFontItem = {
      id,
      label: trimmedName,
      value: trimmedFamily.includes(",") || trimmedFamily.startsWith("'") ? trimmedFamily : `'${trimmedFamily}', sans-serif`,
      webFontUrl: customUrl?.trim() || undefined,
      isCustom: true,
    };

    if (newFont.webFontUrl) {
      injectWebFont(newFont.webFontUrl, newFont.id);
    }

    const updated = [...customFonts, newFont];
    setCustomFonts(updated);
    saveCustomFonts(updated);
    setName("");
    setFamily("");
    setWebFontUrl("");
    setError("");
    onFontAdded?.(newFont);
  }

  function handleDeleteCustomFont(id: string) {
    const updated = customFonts.filter((f) => f.id !== id);
    setCustomFonts(updated);
    saveCustomFonts(updated);
  }

  function handleSaveOfficeDefault(val: string) {
    setDefaultOfficeFont(val);
    saveDefaultFontName(val);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        className="w-full max-w-md bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        style={{ animation: "modalIn 0.15s ease-out" }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔤</span>
            <h3 className="font-bold text-base">편집기 글꼴(폰트) 관리 / 추가</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--muted)] text-neutral-500 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* MS 오피스 기본 글꼴 설정 (오피스 편집기에서 열렸을 때 강조) */}
          <div className="p-3 rounded-xl bg-[var(--muted)] border border-[var(--border)] space-y-2">
            <label className="font-bold block text-[13px] text-primary-text">
              📑 MS 오피스 기본 글꼴 지정
            </label>
            <p className="text-muted-foreground text-[11px]">
              Word, Excel, PowerPoint 문서를 새로 열거나 작성할 때 적용할 기본 글꼴입니다.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={defaultOfficeFont}
                onChange={(e) => handleSaveOfficeDefault(e.target.value)}
                placeholder="예: 맑은 고딕, Arial, Pretendard"
                className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-opaque)] outline-none focus:border-blue-500 font-medium"
              />
            </div>
          </div>

          {/* 추천 인기 무료 웹폰트 빠른 등록 */}
          <div className="space-y-2">
            <label className="font-bold block text-neutral-700 dark:text-neutral-300">
              ⚡ 추천 인기 한국어 무료 글꼴 추가
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {POPULAR_FONT_PRESETS.map((preset) => {
                const alreadyAdded = customFonts.some((f) => f.label === preset.name);
                return (
                  <button
                    key={preset.name}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => handleAddCustomFont(preset.name, preset.family, preset.url)}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-opaque)] hover:bg-[var(--secondary)] transition text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="truncate font-medium">{preset.name}</span>
                    <span className="text-[10px] text-blue-500 font-bold shrink-0 ml-1">
                      {alreadyAdded ? "추가됨" : "+ 추가"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 직접 글꼴 추가 폼 */}
          <div className="space-y-2.5 border-t border-[var(--border)] pt-4">
            <label className="font-bold block text-neutral-700 dark:text-neutral-300">
              ✏️ 글꼴 직접 등록하기
            </label>
            <div className="space-y-2">
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">글꼴 표시 이름 *</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 경기천년제목체, 나눔손글씨"
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-opaque)] outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">Font Family (선택, 비워두면 이름 사용)</span>
                <input
                  type="text"
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                  placeholder="예: 'GyeonggiTitle', sans-serif"
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-opaque)] outline-none focus:border-blue-500 font-mono text-[11px]"
                />
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">웹폰트 CSS / WOFF URL (선택, 눈누·Google Fonts CDN 링크)</span>
                <input
                  type="text"
                  value={webFontUrl}
                  onChange={(e) => setWebFontUrl(e.target.value)}
                  placeholder="https://fonts.googleapis.com/css2?family=... 또는 .woff 주소"
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-opaque)] outline-none focus:border-blue-500 font-mono text-[11px]"
                />
              </div>
              {error && <p className="text-red-500 text-[11px]">{error}</p>}
              <button
                type="button"
                onClick={() => handleAddCustomFont(name, family, webFontUrl)}
                className="w-full py-2 rounded-lg bg-[var(--primary)] text-white font-bold hover:opacity-90 transition cursor-pointer"
              >
                + 새 글꼴 등록하기
              </button>
            </div>
          </div>

          {/* 내가 추가한 글꼴 목록 */}
          {customFonts.length > 0 && (
            <div className="border-t border-[var(--border)] pt-4 space-y-2">
              <label className="font-bold block text-neutral-700 dark:text-neutral-300">
                📋 등록된 사용자 정의 글꼴 ({customFonts.length}개)
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {customFonts.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[var(--muted)] border border-[var(--border)]"
                  >
                    <span className="font-semibold truncate mr-2">{f.label}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomFont(f.id)}
                      className="text-red-500 hover:text-red-700 text-[11px] font-bold cursor-pointer shrink-0"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 닫기 버튼 */}
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--secondary)] text-[var(--primary-text)] font-semibold hover:opacity-80 transition cursor-pointer text-xs"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
