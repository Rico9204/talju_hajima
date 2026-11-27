import React, { useState, useEffect } from "react";
import {
  CharShapeIcon,
  ParaShapeIcon,
  HyperlinkIcon,
  PageNumberIcon,
  WatermarkIcon,
  TemplateIcon,
  CommentIcon,
  CalcIcon,
  TextConvertIcon,
  FormatPainterIcon,
  SplitCellIcon,
} from "./HwpxIcons";

// 1. 모양 복사 모달 (Alt+C) - 한컴독스 표준 레이아웃 100% 일치
export function FormatCopyModal({
  isOpen,
  onClose,
  onCopy,
  isTableSelected = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (mode: "char" | "para" | "both") => void;
  isTableSelected?: boolean;
}) {
  const [copyMode, setCopyMode] = useState<"char" | "para" | "both">("char");
  const [cellAttr, setCellAttr] = useState(false);
  const [cellBorder, setCellBorder] = useState(false);
  const [cellBg, setCellBg] = useState(false);
  const [tableTarget, setTableTarget] = useState<"both" | "cellOnly">("both");
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] bg-white rounded-xs shadow-2xl border border-[#4a89dc] overflow-hidden text-neutral-800 font-sans select-none animate-in fade-in duration-150"
      >
        <div className="bg-[#f0f4fa] border-b border-[#dbe2ea] px-4 py-2 flex items-center justify-between">
          <span className="text-[13px] font-bold text-neutral-900 tracking-tight">모양 복사</span>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-900 text-sm font-light leading-none p-1 cursor-pointer">✕</button>
        </div>

        <div className="p-4 flex items-start gap-3 bg-[#f8fafc]">
          <div className="flex-1 border border-[#c8d3e2] rounded-xs p-3.5 bg-white shadow-2xs flex flex-col gap-3 text-[12px]">
            <div className="flex flex-col gap-1.5">
              <span className="font-bold text-[#1e4fa8]">본문 모양 복사</span>
              <div className="flex items-center gap-6 pl-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="copyMode" checked={copyMode === "char"} onChange={() => setCopyMode("char")} className="accent-[#0066cc]" />
                  <span>글자 모양</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="copyMode" checked={copyMode === "para"} onChange={() => setCopyMode("para")} className="accent-[#0066cc]" />
                  <span>문단 모양</span>
                </label>
              </div>
              <label className="flex items-center gap-1.5 pl-1 cursor-pointer">
                <input type="radio" name="copyMode" checked={copyMode === "both"} onChange={() => setCopyMode("both")} className="accent-[#0066cc]" />
                <span>글자 모양과 문단 모양 둘 다 복사</span>
              </label>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <span className="font-bold text-[#1e4fa8]">셀 모양 복사</span>
              <div className={`flex items-center gap-4 pl-1 ${!isTableSelected ? "text-neutral-300" : "text-neutral-700"}`}>
                <label className={`flex items-center gap-1 ${isTableSelected ? "cursor-pointer" : "cursor-not-allowed"}`}>
                  <input type="checkbox" disabled={!isTableSelected} checked={cellAttr} onChange={(e) => setCellAttr(e.target.checked)} className="accent-[#0066cc] disabled:opacity-30" />
                  <span>셀 속성</span>
                </label>
                <label className={`flex items-center gap-1 ${isTableSelected ? "cursor-pointer" : "cursor-not-allowed"}`}>
                  <input type="checkbox" disabled={!isTableSelected} checked={cellBorder} onChange={(e) => setCellBorder(e.target.checked)} className="accent-[#0066cc] disabled:opacity-30" />
                  <span>셀 테두리</span>
                </label>
                <label className={`flex items-center gap-1 ${isTableSelected ? "cursor-pointer" : "cursor-not-allowed"}`}>
                  <input type="checkbox" disabled={!isTableSelected} checked={cellBg} onChange={(e) => setCellBg(e.target.checked)} className="accent-[#0066cc] disabled:opacity-30" />
                  <span>셀 배경</span>
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <span className="font-bold text-[#1e4fa8]">표에서 적용 대상</span>
              <div className={`flex flex-col gap-1 pl-1 ${!isTableSelected ? "text-neutral-300" : "text-neutral-700"}`}>
                <label className={`flex items-center gap-1.5 ${isTableSelected ? "cursor-pointer" : "cursor-not-allowed"}`}>
                  <input type="radio" name="tableTarget" disabled={!isTableSelected} checked={tableTarget === "both"} onChange={() => setTableTarget("both")} className="accent-[#0066cc] disabled:opacity-30" />
                  <span>본문 모양과 셀 모양 둘 다</span>
                </label>
                <label className={`flex items-center gap-1.5 ${isTableSelected ? "cursor-pointer" : "cursor-not-allowed"}`}>
                  <input type="radio" name="tableTarget" disabled={!isTableSelected} checked={tableTarget === "cellOnly"} onChange={() => setTableTarget("cellOnly")} className="accent-[#0066cc] disabled:opacity-30" />
                  <span>셀 모양만</span>
                </label>
              </div>
            </div>
          </div>

          <div className="w-20 shrink-0 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                onCopy(copyMode);
                onClose();
              }}
              className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-900 text-[12px] font-medium rounded-xs cursor-pointer shadow-2xs"
            >
              복사
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full h-8 border border-[#c0c6d0] bg-white hover:bg-neutral-50 text-neutral-800 text-[12px] rounded-xs cursor-pointer shadow-2xs"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 2. 글자 바꾸기 모달 (대소문자/전각반각 변환)
export function TextConvertModal({
  isOpen,
  onClose,
  onConvert,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConvert: (mode: "upper" | "lower" | "title" | "fullWidth" | "halfWidth") => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-80 bg-white rounded-xl shadow-2xl border border-neutral-300 p-4 text-neutral-800 flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
          <span className="flex items-center gap-1.5">
            <TextConvertIcon className="w-4 h-4 text-indigo-600" />
            <span>글자 바꾸기</span>
          </span>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
        </h4>
        <div className="grid grid-cols-1 gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => { onConvert("upper"); onClose(); }}
            className="px-3 py-2 rounded-lg border border-neutral-200 hover:border-[#0066cc] hover:bg-blue-50/50 text-left transition flex items-center justify-between"
          >
            <span className="font-medium">모두 대문자로 변환</span>
            <span className="text-[10px] text-neutral-400">ABC</span>
          </button>
          <button
            type="button"
            onClick={() => { onConvert("lower"); onClose(); }}
            className="px-3 py-2 rounded-lg border border-neutral-200 hover:border-[#0066cc] hover:bg-blue-50/50 text-left transition flex items-center justify-between"
          >
            <span className="font-medium">모두 소문자로 변환</span>
            <span className="text-[10px] text-neutral-400">abc</span>
          </button>
          <button
            type="button"
            onClick={() => { onConvert("title"); onClose(); }}
            className="px-3 py-2 rounded-lg border border-neutral-200 hover:border-[#0066cc] hover:bg-blue-50/50 text-left transition flex items-center justify-between"
          >
            <span className="font-medium">단어 첫 글자만 대문자로</span>
            <span className="text-[10px] text-neutral-400">Abc</span>
          </button>
          <button
            type="button"
            onClick={() => { onConvert("halfWidth"); onClose(); }}
            className="px-3 py-2 rounded-lg border border-neutral-200 hover:border-[#0066cc] hover:bg-blue-50/50 text-left transition flex items-center justify-between"
          >
            <span className="font-medium">전각 문자를 반각으로</span>
            <span className="text-[10px] text-neutral-400">１２３ → 123</span>
          </button>
          <button
            type="button"
            onClick={() => { onConvert("fullWidth"); onClose(); }}
            className="px-3 py-2 rounded-lg border border-neutral-200 hover:border-[#0066cc] hover:bg-blue-50/50 text-left transition flex items-center justify-between"
          >
            <span className="font-medium">반각 문자를 전각으로</span>
            <span className="text-[10px] text-neutral-400">123 → １２３</span>
          </button>
        </div>
        <div className="flex justify-end pt-2 border-t border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded text-xs border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-medium"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// 3. 하이퍼링크 모달 (Ctrl+K) — 한컴오피스/한컴독스 스타일
export function HyperlinkModal({
  isOpen,
  onClose,
  onInsert,
  initialText = "",
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string, url: string) => void;
  initialText?: string;
}) {
  const [text, setText] = useState(initialText);
  const [linkType, setLinkType] = useState<"web" | "email">("web");
  const [url, setUrl] = useState("http://");

  useEffect(() => {
    if (isOpen) {
      setText(initialText);
      setLinkType("web");
      setUrl("http://");
    }
  }, [isOpen, initialText]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || trimmedUrl === "http://" || trimmedUrl === "https://" || trimmedUrl === "mailto:") {
      return;
    }
    const finalUrl =
      linkType === "email"
        ? (/^mailto:/i.test(trimmedUrl) ? trimmedUrl : `mailto:${trimmedUrl}`)
        : (/^(https?:\/\/|mailto:|tel:|\/)/i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`);
    onInsert(text.trim() || finalUrl, finalUrl);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/30"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleSubmit();
        }
      }}
    >
      <div className="w-[460px] max-w-full bg-[#f0f1f4] border border-neutral-400 shadow-2xl text-neutral-900 overflow-hidden select-none">
        {/* 상단 제목 표시줄 */}
        <div className="bg-[#eef2fb] border-b border-neutral-300 px-3.5 py-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-neutral-900">하이퍼링크</span>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900 text-sm leading-none px-1 cursor-pointer"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 본문 2단 레이아웃 (좌측 입력 카드 + 우측 넣기/취소 버튼) */}
        <div className="p-3.5 flex items-start gap-3">
          <div className="flex-1 bg-white border border-neutral-300 p-4 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-[#1d4ed8] mb-1.5">
                표시할 문자열
              </label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoFocus={!initialText}
                className="w-full bg-white border border-neutral-400 px-2.5 py-1.5 text-[13px] text-neutral-900 outline-none focus:border-[#0066cc]"
              />
            </div>

            <div>
              <div className="text-xs font-bold text-[#1d4ed8] mb-1.5">연결 대상</div>
              <div className="flex flex-col gap-1.5 text-[13px] text-neutral-800">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="hwpx-hyperlink-type"
                    checked={linkType === "web"}
                    onChange={() => {
                      setLinkType("web");
                      if (!url.trim() || url.trim() === "mailto:") setUrl("http://");
                    }}
                    className="accent-[#0066cc] cursor-pointer"
                  />
                  <span>웹 주소</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="hwpx-hyperlink-type"
                    checked={linkType === "email"}
                    onChange={() => {
                      setLinkType("email");
                      if (url.trim() === "http://" || url.trim() === "https://") setUrl("mailto:");
                    }}
                    className="accent-[#0066cc] cursor-pointer"
                  />
                  <span>전자 우편 주소</span>
                </label>
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus={Boolean(initialText)}
                placeholder={linkType === "email" ? "mailto:example@domain.com" : "http://"}
                className="mt-2 w-full bg-white border border-neutral-400 px-2.5 py-1.5 text-[13px] text-neutral-900 outline-none focus:border-[#0066cc]"
              />
            </div>
          </div>

          {/* 우측 버튼 열 */}
          <div className="w-22 flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSubmit}
              className="w-full py-1.5 bg-white border border-neutral-400 hover:bg-neutral-100 text-xs font-medium text-neutral-900 cursor-pointer"
            >
              넣기
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-1.5 bg-white border border-neutral-400 hover:bg-neutral-100 text-xs font-medium text-neutral-900 cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 3-2. 책갈피 모달 (한컴오피스/한컴독스 스타일)
export function BookmarkModal({
  isOpen,
  onClose,
  onInsert,
  onGoto,
  bookmarks = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (name: string) => void;
  onGoto: (name: string) => void;
  bookmarks?: Array<{ name: string; blockIdx: number }>;
}) {
  const [name, setName] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setSelectedName(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canInsert = name.trim().length > 0;
  const gotoTarget = selectedName || (bookmarks.some((b) => b.name === name.trim()) ? name.trim() : null);

  const handleInsert = () => {
    if (!canInsert) return;
    onInsert(name.trim());
    onClose();
  };

  const handleGoto = () => {
    if (!gotoTarget) return;
    onGoto(gotoTarget);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/30"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "Enter" && canInsert) {
          e.preventDefault();
          handleInsert();
        }
      }}
    >
      <div className="w-[460px] max-w-full bg-[#f0f1f4] border border-neutral-400 shadow-2xl text-neutral-900 overflow-hidden select-none">
        {/* 상단 제목 표시줄 */}
        <div className="bg-[#eef2fb] border-b border-neutral-300 px-3.5 py-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-neutral-900">책갈피</span>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900 text-sm leading-none px-1 cursor-pointer"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 본문 2단 레이아웃 */}
        <div className="p-3.5 flex items-start gap-3">
          <div className="flex-1 bg-white border border-neutral-300 p-4 flex flex-col gap-3.5">
            <div>
              <label className="block text-xs font-bold text-[#1d4ed8] mb-1.5">
                책갈피 이름
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="책갈피 이름 입력"
                autoFocus
                className="w-full bg-white border border-neutral-400 px-2.5 py-1.5 text-[13px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-[#0066cc]"
              />
            </div>

            <div>
              <div className="text-xs font-bold text-[#1d4ed8] mb-1.5">책갈피 목록</div>
              <div className="w-full h-56 bg-white border border-neutral-400 overflow-y-auto text-[13px]">
                {bookmarks.map((bm) => {
                  const isSel = selectedName === bm.name;
                  return (
                    <button
                      key={bm.name}
                      type="button"
                      onClick={() => {
                        setSelectedName(bm.name);
                        setName(bm.name);
                      }}
                      onDoubleClick={() => {
                        onGoto(bm.name);
                        onClose();
                      }}
                      className={`w-full text-left px-2.5 py-1.5 cursor-pointer transition-colors ${isSel
                        ? "bg-[#e8f0fe] text-[#1d4ed8] font-medium"
                        : "text-neutral-800 hover:bg-neutral-100"
                        }`}
                    >
                      {bm.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 우측 버튼 열 */}
          <div className="w-22 flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={handleInsert}
              disabled={!canInsert}
              className={`w-full py-1.5 bg-white border text-xs font-medium ${canInsert
                ? "border-neutral-400 text-neutral-900 hover:bg-neutral-100 cursor-pointer"
                : "border-neutral-200 text-neutral-300 cursor-default"
                }`}
            >
              넣기
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-1.5 bg-white border border-neutral-400 hover:bg-neutral-100 text-xs font-medium text-neutral-900 cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleGoto}
              disabled={!gotoTarget}
              className={`mt-3 w-full py-1.5 bg-white border text-xs font-medium ${gotoTarget
                ? "border-neutral-400 text-neutral-900 hover:bg-neutral-100 cursor-pointer"
                : "border-neutral-200 text-neutral-300 cursor-default"
                }`}
            >
              이동
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 3-3. 글머리표 및 문단 번호 모달 ([서식] 메뉴 — 한컴오피스/한컴독스 통합 2탭 대화상자)
export function BulletAndNumberModal({
  isOpen,
  initialTab = "bullet",
  onClose,
  onApplyBullet,
  onApplyNumber,
}: {
  isOpen: boolean;
  initialTab?: "bullet" | "number";
  onClose: () => void;
  onApplyBullet: (prefix: string | null) => void;
  onApplyNumber: (prefix: string | null) => void;
}) {
  const [tab, setTab] = useState<"bullet" | "number">(initialTab);
  const [selectedBullet, setSelectedBullet] = useState<string | null>("● ");
  const [selectedNumberIdx, setSelectedNumberIdx] = useState<number>(0); // 0 = 없음, 1..10 = 프리셋
  const [startMode, setStartMode] = useState<"continue_prev" | "continue_recent" | "new">("new");
  const [startNum, setStartNum] = useState<number>(1);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const bulletPresets: Array<{ id: string; char: string; value: string; sizeClass?: string }> = [
    { id: "b1", char: "●", value: "● ", sizeClass: "text-[11px]" },
    { id: "b2", char: "•", value: "• ", sizeClass: "text-[10px]" },
    { id: "b3", char: "■", value: "■ ", sizeClass: "text-[10px]" },
    { id: "b4", char: "▪", value: "▪ ", sizeClass: "text-[8px]" },
    { id: "b5", char: "◆", value: "◆ ", sizeClass: "text-[10px]" },
    { id: "b6", char: "♦", value: "♦ ", sizeClass: "text-[9px]" },
    { id: "b7", char: "▶", value: "▶ ", sizeClass: "text-[9px]" },
    { id: "b8", char: "○", value: "○ ", sizeClass: "text-[11px]" },
    { id: "b9", char: "□", value: "□ ", sizeClass: "text-[11px]" },
    { id: "b10", char: "◇", value: "◇ ", sizeClass: "text-[11px]" },
    { id: "b11", char: "▷", value: "▷ ", sizeClass: "text-[10px]" },
    { id: "b12", char: "◎", value: "◎ ", sizeClass: "text-[11px]" },
    { id: "b13", char: "☑", value: "☑ ", sizeClass: "text-[11px]" },
    { id: "b14", char: "✓", value: "✓ ", sizeClass: "text-[11px]" },
    { id: "b15", char: "★", value: "★ ", sizeClass: "text-[11px]" },
    { id: "b16", char: "❖", value: "❖ ", sizeClass: "text-[11px]" },
    { id: "b17", char: "☞", value: "☞ ", sizeClass: "text-[11px]" },
  ];

  const numberPresets: Array<{ levels: [string, string, string, string]; makePrefix: (n: number) => string }> = [
    { levels: ["1.", "가.", "1)", "가)"], makePrefix: (n) => `${n}. ` },
    { levels: ["(1)", "(가)", "(a)", "1)"], makePrefix: (n) => `(${n}) ` },
    { levels: ["1)", "가)", "a)", "(1)"], makePrefix: (n) => `${n}) ` },
    {
      levels: ["①", "(ㄱ)", "(a)", "1)"],
      makePrefix: (n) => {
        const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";
        return `${circled[Math.max(0, Math.min(circled.length - 1, n - 1))] || `(${n})`} `;
      },
    },
    {
      levels: ["가)", "a)", "(1)", "(가)"],
      makePrefix: (n) => {
        const ko = "가나다라마바사아자차카타파하";
        return `${ko[Math.max(0, Math.min(ko.length - 1, n - 1))] || n}) `;
      },
    },
    {
      levels: ["(ㄱ)", "(1)", "(a)", "1)"],
      makePrefix: (n) => {
        const jamo = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ";
        return `(${jamo[Math.max(0, Math.min(jamo.length - 1, n - 1))] || n}) `;
      },
    },
    {
      levels: ["I.", "A.", "1.", "i)"],
      makePrefix: (n) => {
        const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
        return `${roman[Math.max(0, Math.min(roman.length - 1, n - 1))] || n}. `;
      },
    },
    {
      levels: ["i.", "a.", "(i)", "(a)"],
      makePrefix: (n) => {
        const romanLower = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
        return `${romanLower[Math.max(0, Math.min(romanLower.length - 1, n - 1))] || n}. `;
      },
    },
    {
      levels: ["A.", "1.", "가.", "(a)"],
      makePrefix: (n) => `${String.fromCharCode(64 + Math.max(1, Math.min(26, n)))}. `,
    },
    { levels: ["1.", "1.1.", "1.1.1.", "1.1.1.1."], makePrefix: (n) => `${n}. ` },
  ];

  const handleConfirm = () => {
    if (tab === "bullet") {
      onApplyBullet(selectedBullet);
    } else {
      if (selectedNumberIdx === 0) {
        onApplyNumber(null);
      } else {
        const preset = numberPresets[selectedNumberIdx - 1];
        onApplyNumber(preset ? preset.makePrefix(Math.max(1, startNum)) : "1. ");
      }
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/30"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleConfirm();
        }
      }}
    >
      <div className="w-[460px] max-w-full bg-[#f0f1f4] border border-neutral-400 shadow-2xl text-neutral-900 overflow-hidden select-none">
        {/* 상단 제목 표시줄 */}
        <div className="bg-[#eef2fb] border-b border-neutral-300 px-3.5 py-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-neutral-900">글머리표 및 문단 번호</span>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900 text-sm leading-none px-1 cursor-pointer"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="p-3.5 flex items-start gap-3">
          <div className="flex-1">
            {/* 탭 헤더 */}
            <div className="flex items-end gap-1 mb-0">
              <button
                type="button"
                onClick={() => setTab("bullet")}
                className={`px-3 py-1 text-xs cursor-pointer ${tab === "bullet"
                  ? "bg-white text-[#1d4ed8] font-bold border border-b-0 border-neutral-300 border-b-white -mb-px z-10 shadow-[inset_0_-2px_0_#0066cc]"
                  : "text-neutral-700 hover:text-neutral-900"
                  }`}
              >
                글머리표
              </button>
              <button
                type="button"
                onClick={() => setTab("number")}
                className={`px-3 py-1 text-xs cursor-pointer ${tab === "number"
                  ? "bg-white text-[#1d4ed8] font-bold border border-b-0 border-neutral-300 border-b-white -mb-px z-10 shadow-[inset_0_-2px_0_#0066cc]"
                  : "text-neutral-700 hover:text-neutral-900"
                  }`}
              >
                문단 번호
              </button>
            </div>

            {/* 탭 내용 카드 */}
            <div className="bg-white border border-neutral-300 p-3.5">
              {tab === "bullet" ? (
                <>
                  <div className="text-xs font-bold text-[#1d4ed8] mb-2">글머리표 모양</div>
                  <div className="border border-neutral-300 p-2 grid grid-cols-4 gap-1.5 bg-white">
                    {/* 없음 셀 (대각선) */}
                    <button
                      type="button"
                      title="없음"
                      onClick={() => setSelectedBullet(null)}
                      onDoubleClick={() => { onApplyBullet(null); onClose(); }}
                      className={`h-14 flex items-center justify-center border cursor-pointer ${selectedBullet === null ? "bg-[#dcdcdc] border-neutral-500" : "bg-white border-neutral-200 hover:bg-neutral-50"
                        }`}
                    >
                      <div className="w-8 h-8 border border-neutral-600 relative overflow-hidden bg-neutral-200/70">
                        <svg viewBox="0 0 32 32" className="w-full h-full">
                          <line x1="0" y1="32" x2="32" y2="0" stroke="#dc2626" strokeWidth="1.5" />
                        </svg>
                      </div>
                    </button>

                    {bulletPresets.map((bp) => {
                      const isSel = selectedBullet === bp.value;
                      return (
                        <button
                          key={bp.id}
                          type="button"
                          onClick={() => setSelectedBullet(bp.value)}
                          onDoubleClick={() => { onApplyBullet(bp.value); onClose(); }}
                          className={`h-14 px-2 py-1.5 flex flex-col justify-center gap-1.5 border cursor-pointer ${isSel ? "bg-[#dcdcdc] border-neutral-500" : "bg-white border-transparent hover:bg-neutral-50 hover:border-neutral-200"
                            }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`w-3 text-center leading-none text-neutral-700 ${bp.sizeClass || "text-[10px]"}`}>{bp.char}</span>
                            <div className="flex-1 flex flex-col gap-1">
                              <span className="block h-[1.5px] bg-neutral-500 w-full" />
                              <span className="block h-[1.5px] bg-neutral-500 w-4/5" />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-3 text-center leading-none text-neutral-700 ${bp.sizeClass || "text-[10px]"}`}>{bp.char}</span>
                            <div className="flex-1 flex flex-col gap-1">
                              <span className="block h-[1.5px] bg-neutral-500 w-full" />
                              <span className="block h-[1.5px] bg-neutral-500 w-3/4" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold text-[#1d4ed8] mb-2">문단 번호 모양</div>
                  <div className="border border-neutral-300 p-2 grid grid-cols-4 gap-1.5 bg-white">
                    {/* 없음 셀 (대각선) */}
                    <button
                      type="button"
                      title="없음"
                      onClick={() => setSelectedNumberIdx(0)}
                      onDoubleClick={() => { onApplyNumber(null); onClose(); }}
                      className={`h-16 flex items-center justify-center border cursor-pointer ${selectedNumberIdx === 0 ? "bg-[#dcdcdc] border-neutral-500" : "bg-white border-neutral-200 hover:bg-neutral-50"
                        }`}
                    >
                      <div className="w-8 h-8 border border-neutral-600 relative overflow-hidden bg-neutral-200/70">
                        <svg viewBox="0 0 32 32" className="w-full h-full">
                          <line x1="0" y1="32" x2="32" y2="0" stroke="#dc2626" strokeWidth="1.5" />
                        </svg>
                      </div>
                    </button>

                    {numberPresets.map((np, i) => {
                      const idx = i + 1;
                      const isSel = selectedNumberIdx === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedNumberIdx(idx)}
                          onDoubleClick={() => { onApplyNumber(np.makePrefix(Math.max(1, startNum))); onClose(); }}
                          className={`h-16 px-1.5 py-1 flex flex-col justify-center gap-0.5 border text-[9px] leading-tight cursor-pointer ${isSel ? "bg-[#dcdcdc] border-neutral-500" : "bg-white border-transparent hover:bg-neutral-50 hover:border-neutral-200"
                            }`}
                        >
                          {np.levels.map((lv, lIdx) => (
                            <div key={lIdx} className="flex items-center gap-1">
                              <span className="text-neutral-700 font-medium whitespace-nowrap">{lv}</span>
                              <span className="flex-1 h-[1px] bg-neutral-400" />
                            </div>
                          ))}
                        </button>
                      );
                    })}
                  </div>

                  {/* 시작 번호 방식 */}
                  <div className="mt-3.5">
                    <div className="text-xs font-bold text-[#1d4ed8] mb-1.5">시작 번호 방식</div>
                    <div className="flex flex-col gap-1.5 text-xs">
                      <label className="inline-flex items-center gap-2 text-neutral-400 cursor-not-allowed">
                        <input type="radio" name="hwpx-num-start" disabled checked={startMode === "continue_prev"} onChange={() => setStartMode("continue_prev")} />
                        <span>앞 번호 목록에 이어</span>
                      </label>
                      <label className="inline-flex items-center gap-2 text-neutral-400 cursor-not-allowed">
                        <input type="radio" name="hwpx-num-start" disabled checked={startMode === "continue_recent"} onChange={() => setStartMode("continue_recent")} />
                        <span>이전 번호 목록에 이어</span>
                      </label>
                      <label className="inline-flex items-center gap-2 text-neutral-900 cursor-pointer">
                        <input
                          type="radio"
                          name="hwpx-num-start"
                          checked={startMode === "new"}
                          onChange={() => setStartMode("new")}
                          className="accent-[#0066cc] cursor-pointer"
                        />
                        <span>새 번호 목록 시작</span>
                      </label>
                      <div className="pl-5 flex items-center gap-2 mt-0.5">
                        <span className="text-neutral-800">1수준 시작 번호</span>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={startNum}
                          onChange={(e) => setStartNum(Math.max(1, parseInt(e.target.value || "1", 10)))}
                          className="w-24 bg-white border border-neutral-400 px-2 py-0.5 text-xs text-neutral-900 outline-none focus:border-[#0066cc]"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 우측 버튼 열 */}
          <div className="w-20 flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-1.5 bg-white border border-neutral-400 hover:bg-neutral-100 text-xs font-medium text-neutral-900 cursor-pointer"
            >
              확인
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-1.5 bg-white border border-neutral-400 hover:bg-neutral-100 text-xs font-medium text-neutral-900 cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StyleModal({
  isOpen,
  onClose,
  onApply,
  currentStyleInfo,
  onOpenParaShape,
  onOpenCharShape,
  onOpenBulletNumber,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (preset: string) => void;
  currentStyleInfo?: {
    marginLeftPt?: number;
    marginRightPt?: number;
    firstLineType?: string;
    align?: string;
    lineSpacingPct?: number;
    fontFamily?: string;
    sizePt?: number;
    charWidthPct?: number;
    letterSpacingPct?: number;
    listKind?: string;
  };
  onOpenParaShape?: () => void;
  onOpenCharShape?: () => void;
  onOpenBulletNumber?: () => void;
}) {
  const [styles, setStyles] = useState([
    { id: "body", name: "Normal", fontFamily: "굴림체", sizePt: 10, align: "왼쪽", lineSpacingPct: 160, nextStyle: "Normal", builtIn: true },
  ]);
  const [selectedId, setSelectedId] = useState("body");
  if (!isOpen) return null;

  const activeStyle = styles.find((s) => s.id === selectedId) || styles[0];
  const mapFontDisplayName = (raw?: string) => {
    const first = (raw || "").split(",")[0].replace(/['"]/g, "").trim();
    if (!first || /^gulimche$/i.test(first)) return "굴림체";
    if (/^gulim$/i.test(first)) return "굴림";
    if (/^batangche$/i.test(first)) return "바탕체";
    if (/^batang$/i.test(first)) return "바탕";
    if (/^dotumche$/i.test(first)) return "돋움체";
    if (/^dotum$/i.test(first)) return "돋움";
    if (/^malgun gothic$/i.test(first)) return "맑은 고딕";
    return first;
  };
  const alignLabel = activeStyle.align;
  const fontLabel = mapFontDisplayName(currentStyleInfo?.fontFamily || activeStyle.fontFamily);
  const sizeLabel = activeStyle.sizePt;
  const leftMarginLabel = 0;
  const rightMarginLabel = 0;
  const firstLineLabel = "보통";
  const lineSpacingLabel = activeStyle.lineSpacingPct;
  const charWidthLabel = 100;
  const letterSpacingLabel = 0;
  const listKindLabel = "없음";

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/30"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "Enter") {
          e.preventDefault();
          onApply(selectedId);
          onClose();
        }
      }}
    >
      <div className="w-[740px] max-w-full bg-[#f0f1f4] border border-neutral-400 shadow-2xl text-neutral-900 overflow-hidden select-none">
        {/* 상단 제목 표시줄 */}
        <div className="bg-[#eef2fb] border-b border-neutral-300 px-3.5 py-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-neutral-900">스타일</span>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-900 text-sm leading-none px-1 cursor-pointer">✕</button>
        </div>

        {/* 본문 */}
        <div className="p-3.5 flex items-start gap-3">
          <div className="flex-1 bg-white border border-neutral-300 p-4 flex gap-5">
            {/* 좌측 스타일 목록 */}
            <div className="w-44 flex flex-col shrink-0">
              <div className="text-xs font-bold text-[#1d4ed8] mb-1.5">스타일 목록</div>
              <div className="flex-1 min-h-[290px] border border-neutral-400 bg-white overflow-y-auto text-xs">
                {styles.map((s) => {
                  const isSel = selectedId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      onDoubleClick={() => { onApply(s.id); onClose(); }}
                      className={`w-full text-left px-2.5 py-1.5 cursor-pointer ${isSel ? "bg-[#d4d4d4] text-neutral-900" : "text-neutral-800 hover:bg-neutral-100"
                        }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  title="스타일 추가"
                  onClick={() => {
                    const nextNum = styles.length;
                    const newId = `custom_${Date.now()}`;
                    setStyles((prev) => [...prev, { id: newId, name: `새 스타일 ${nextNum}`, fontFamily: "굴림체", sizePt: 10, align: "왼쪽", lineSpacingPct: 160, nextStyle: "Normal", builtIn: false }]);
                    setSelectedId(newId);
                  }}
                  className="w-7 h-7 bg-white border border-neutral-300 hover:bg-neutral-100 text-[#1d4ed8] text-base leading-none flex items-center justify-center cursor-pointer"
                >
                  +
                </button>
                <button
                  type="button"
                  title="스타일 편집"
                  onClick={() => { onOpenParaShape?.(); }}
                  className="w-7 h-7 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-600 text-xs flex items-center justify-center cursor-pointer"
                >
                  ✎
                </button>
                <button
                  type="button"
                  title="스타일 삭제"
                  disabled={activeStyle.builtIn}
                  onClick={() => {
                    if (activeStyle.builtIn) return;
                    setStyles((prev) => prev.filter((s) => s.id !== activeStyle.id));
                    setSelectedId("body");
                  }}
                  className={`w-7 h-7 bg-white border border-neutral-300 text-xs flex items-center justify-center ${activeStyle.builtIn ? "text-red-200 cursor-not-allowed" : "text-red-500 hover:bg-neutral-100 cursor-pointer"
                    }`}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 우측 상세 정보 */}
            <div className="flex-1 flex flex-col gap-3 text-xs">
              {/* 문단 모양 정보 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-[#1d4ed8]">문단 모양 정보</span>
                  <button
                    type="button"
                    onClick={() => { onClose(); onOpenParaShape?.(); }}
                    className="px-3 py-0.5 bg-white border border-neutral-400 hover:bg-neutral-100 text-[11px] text-neutral-800 cursor-pointer"
                  >
                    설정...
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 pl-2 text-neutral-800">
                  <div className="flex"><span className="w-24 text-neutral-600">왼쪽 여백</span><span>: {leftMarginLabel} pt</span></div>
                  <div className="flex"><span className="w-20 text-neutral-600">첫 줄</span><span>: {firstLineLabel}</span></div>
                  <div className="flex"><span className="w-24 text-neutral-600">오른쪽 여백</span><span>: {rightMarginLabel} pt</span></div>
                  <div className="flex"><span className="w-20 text-neutral-600">정렬 방식</span><span>: {alignLabel}</span></div>
                  <div className="flex col-span-2"><span className="w-24 text-neutral-600">줄 간격</span><span>: {lineSpacingLabel}%</span></div>
                  <div className="flex col-span-2"><span className="w-24 text-neutral-600">다음 스타일</span><span>: {activeStyle.nextStyle}</span></div>
                </div>
              </div>

              <div className="border-t border-neutral-200" />

              {/* 글자 모양 정보 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-[#1d4ed8]">글자 모양 정보</span>
                  <button
                    type="button"
                    onClick={() => { onClose(); onOpenCharShape?.(); }}
                    className="px-3 py-0.5 bg-white border border-neutral-400 hover:bg-neutral-100 text-[11px] text-neutral-800 cursor-pointer"
                  >
                    설정...
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 pl-2 text-neutral-800">
                  <div className="flex"><span className="w-24 text-neutral-600">글꼴</span><span>: {fontLabel}</span></div>
                  <div className="flex"><span className="w-20 text-neutral-600">장평</span><span>: {charWidthLabel} %</span></div>
                  <div className="flex"><span className="w-24 text-neutral-600">크기</span><span>: {sizeLabel} pt</span></div>
                  <div className="flex"><span className="w-20 text-neutral-600">자간</span><span>: {letterSpacingLabel} %</span></div>
                </div>
              </div>

              <div className="border-t border-neutral-200" />

              {/* 글머리표/문단 번호 정보 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-[#1d4ed8]">글머리표/문단 번호 정보</span>
                  <button
                    type="button"
                    onClick={() => { onClose(); onOpenBulletNumber?.(); }}
                    className="px-3 py-0.5 bg-white border border-neutral-400 hover:bg-neutral-100 text-[11px] text-neutral-800 cursor-pointer"
                  >
                    설정...
                  </button>
                </div>
                <div className="pl-2 text-neutral-800 flex">
                  <span className="w-24 text-neutral-600">종류</span><span>: {listKindLabel}</span>
                </div>
              </div>

              <div className="border-t border-neutral-200" />

              {/* 현재 커서 위치 스타일 */}
              <div>
                <div className="font-bold text-[#1d4ed8] mb-1.5">현재 커서 위치 스타일</div>
                <div className="pl-2 text-neutral-800 flex">
                  <span className="w-24 text-neutral-600">스타일</span><span>: {activeStyle.name}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 우측 확인 버튼 */}
          <div className="w-20 flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={() => { onApply(selectedId); onClose(); }}
              className="w-full py-1.5 bg-white border border-neutral-400 hover:bg-neutral-100 text-xs font-medium text-neutral-900 cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 4. 날짜 / 시간 삽입 모달
export function InsertDateModal({
  isOpen,
  onClose,
  onInsert,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (dateStr: string) => void;
}) {
  if (!isOpen) return null;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const dayName = dayNames[now.getDay()];
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  const formats = [
    `${year}년 ${Number(month)}월 ${Number(day)}일 ${dayName}`,
    `${year}년 ${Number(month)}월 ${Number(day)}일`,
    `${year}. ${Number(month)}. ${Number(day)}.`,
    `${year}-${month}-${day}`,
    `${year}/${month}/${day}`,
    `${year}년 ${Number(month)}월 ${Number(day)}일 ${hours}:${minutes}`,
    `${hours}:${minutes}`,
  ];

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-80 bg-white rounded-xl shadow-2xl border border-neutral-300 p-4 text-neutral-800 flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
          <span>날짜 / 시간 넣기</span>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
        </h4>
        <div className="flex flex-col gap-1.5 text-xs max-h-60 overflow-y-auto">
          {formats.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => { onInsert(fmt); onClose(); }}
              className="px-3 py-1.5 rounded border border-neutral-200 hover:border-[#0066cc] hover:bg-blue-50 text-left transition font-mono text-[11px]"
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// 5. 상용구 삽입 모달
export function AutoTextModal({
  isOpen,
  onClose,
  onInsert,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
}) {
  if (!isOpen) return null;
  const snippets = [
    { title: "인사말 (보고서)", text: "존경하는 교수님 및 평가위원 여러분,\n본 연구 과제의 추진 성과 및 최종 결과 보고서를 다음과 같이 제출합니다." },
    { title: "회의 시작 안내", text: "본 회의는 정족수 충족에 따라 개회되었으며, 상정된 주요 안건을 검토하고 의결을 진행하였습니다." },
    { title: "서식 제출 안내", text: "첨부된 별첨 자료 및 증빙 서류를 확인하여 주시기 바라며, 추가 문의 사항은 담당자에게 연락 바랍니다." },
    { title: "결론 및 제언", text: "본 연구에서 도출된 결과를 종합할 때 향후 지속적인 보완 및 실증 테스트가 요구되며, 이를 위한 구체적 실행 방안을 제안합니다." },
    { title: "감사 인사", text: "본 보고서가 성공적으로 마무리될 수 있도록 협조해 주신 모든 팀원 여러분께 깊은 감사를 드립니다." },
  ];

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-96 bg-white rounded-xl shadow-2xl border border-neutral-300 p-4 text-neutral-800 flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
          <span>상용구 / 빠른 문구 삽입</span>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
        </h4>
        <div className="flex flex-col gap-2 text-xs max-h-72 overflow-y-auto">
          {snippets.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => { onInsert(s.text); onClose(); }}
              className="p-2.5 rounded-lg border border-neutral-200 hover:border-[#0066cc] hover:bg-blue-50 text-left transition flex flex-col gap-1"
            >
              <span className="font-bold text-[#0066cc] text-[11px]">{s.title}</span>
              <span className="text-[11px] text-neutral-600 line-clamp-2 leading-relaxed">{s.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// 6. 쪽 번호 매기기 모달 (Alt+N)
export function PageNumberModal({
  isOpen,
  onClose,
  onApply,
  currentPos = "bottom-center",
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (pos: "bottom-center" | "bottom-left" | "bottom-right" | "top-center" | "none") => void;
  currentPos?: string;
}) {
  const [pos, setPos] = useState(currentPos);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-80 bg-white rounded-xl shadow-2xl border border-neutral-300 p-4 text-neutral-800 flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
          <span className="flex items-center gap-1.5">
            <PageNumberIcon className="w-4 h-4 text-blue-600" />
            <span>쪽 번호 매기기 (Alt+N)</span>
          </span>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
        </h4>
        <div className="flex flex-col gap-2 text-xs">
          <label className="text-[11px] font-bold text-neutral-700">번호 표시 위치</label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "bottom-center", label: "아래 가운데 (- 1 -)" },
              { id: "bottom-right", label: "아래 오른쪽" },
              { id: "bottom-left", label: "아래 왼쪽" },
              { id: "top-center", label: "위 가운데" },
              { id: "none", label: "표시 안 함" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPos(p.id)}
                className={`p-2 rounded border text-left text-[11px] transition ${pos === p.id ? "bg-blue-50 border-[#0066cc] text-[#0066cc] font-bold" : "border-neutral-200 hover:bg-neutral-50"
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded text-xs border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-medium"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(pos as any);
              onClose();
            }}
            className="px-4 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa]"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

// 7. 워터마크 모달
export function WatermarkModal({
  isOpen,
  onClose,
  onApply,
  currentWatermark = "",
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (text: string) => void;
  currentWatermark?: string;
}) {
  const [wm, setWm] = useState(currentWatermark);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-80 bg-white rounded-xl shadow-2xl border border-neutral-300 p-4 text-neutral-800 flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
          <span className="flex items-center gap-1.5">
            <WatermarkIcon className="w-4 h-4 text-red-500" />
            <span>바탕쪽 워터마크 설정</span>
          </span>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
        </h4>
        <div className="flex flex-col gap-2.5 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-neutral-700 mb-1">워터마크 문구</label>
            <input
              type="text"
              value={wm}
              onChange={(e) => setWm(e.target.value)}
              placeholder="예: 대외비, 사본, DRAFT"
              className="w-full bg-neutral-50 border border-neutral-300 rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#0066cc]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-neutral-700 mb-1">추천 프리셋</label>
            <div className="flex flex-wrap gap-1">
              {["대외비", "사본", "DRAFT", "초안", "극비", ""].map((preset) => (
                <button
                  key={preset || "없음"}
                  type="button"
                  onClick={() => setWm(preset)}
                  className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[11px]"
                >
                  {preset || "워터마크 해제"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded text-xs border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-medium"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(wm);
              onClose();
            }}
            className="px-4 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa]"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

// 8. 문서마당 (서식 템플릿 모달)
export function TemplateModal({
  isOpen,
  onClose,
  onLoadTemplate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onLoadTemplate: (templateId: "report" | "resume" | "meeting" | "official") => void;
}) {
  if (!isOpen) return null;

  const templates = [
    {
      id: "report" as const,
      title: "팀플 / 과제 최종 보고서",
      desc: "표지, 연구 배경 및 목적, 본문 분석 표, 수식 결과, 결론 요약 완비 서식",
      icon: "📚",
    },
    {
      id: "resume" as const,
      title: "표준 이력서 및 자기소개서",
      desc: "인적사항 표, 학력/경력 사항, 보유 기술 및 직무 관련 상세 기술서",
      icon: "👔",
    },
    {
      id: "meeting" as const,
      title: "프로젝트 팀 회의록",
      desc: "회의 일시, 장소, 참석자, 논의 안건, 결정 사항 및 Action Item 정리 표",
      icon: "📋",
    },
    {
      id: "official" as const,
      title: "공문서 및 업무 기안서",
      desc: "수신, 발신, 경유, 문서 번호, 기안 제목 및 본문 결재 표준 서식",
      icon: "🏛️",
    },
  ];

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-96 bg-white rounded-xl shadow-2xl border border-neutral-300 p-4 text-neutral-800 flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
          <span className="flex items-center gap-1.5">
            <TemplateIcon className="w-4 h-4 text-amber-600" />
            <span>문서마당 (서식 파일 템플릿)</span>
          </span>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
        </h4>
        <p className="text-[11px] text-neutral-600">
          원하는 서식을 선택하면 한컴 표준 레이아웃과 표가 즉시 적용됩니다.
        </p>
        <div className="flex flex-col gap-2 text-xs">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (confirm(`'${t.title}' 서식을 불러오시겠습니까? 현재 내용이 해당 템플릿으로 변경됩니다.`)) {
                  onLoadTemplate(t.id);
                  onClose();
                }
              }}
              className="p-3 rounded-lg border border-neutral-200 hover:border-[#0066cc] hover:bg-blue-50/50 text-left transition flex items-start gap-3 cursor-pointer group"
            >
              <span className="text-2xl">{t.icon}</span>
              <div className="flex-1">
                <div className="font-bold text-neutral-900 group-hover:text-[#0066cc]">{t.title}</div>
                <div className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{t.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// 9. 표 계산식 및 자릿점 모달
export function TableCalcModal({
  isOpen,
  onClose,
  onCalculate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCalculate: (type: "sum" | "avg" | "comma-add" | "comma-remove") => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-80 bg-white rounded-xl shadow-2xl border border-neutral-300 p-4 text-neutral-800 flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
          <span className="flex items-center gap-1.5">
            <CalcIcon className="w-4 h-4 text-emerald-600" />
            <span>표 계산식 및 자릿점</span>
          </span>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
        </h4>
        <div className="grid grid-cols-1 gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => { onCalculate("sum"); onClose(); }}
            className="px-3 py-2 rounded-lg border border-neutral-200 hover:border-emerald-600 hover:bg-emerald-50 text-left transition flex items-center justify-between"
          >
            <span className="font-bold text-emerald-800">블록 합계 (Sum)</span>
            <span className="text-[10px] text-neutral-400">Ctrl+Shift+S</span>
          </button>
          <button
            type="button"
            onClick={() => { onCalculate("avg"); onClose(); }}
            className="px-3 py-2 rounded-lg border border-neutral-200 hover:border-emerald-600 hover:bg-emerald-50 text-left transition flex items-center justify-between"
          >
            <span className="font-bold text-emerald-800">블록 평균 (Average)</span>
            <span className="text-[10px] text-neutral-400">Ctrl+Shift+A</span>
          </button>
          <div className="border-t border-neutral-200 my-1" />
          <button
            type="button"
            onClick={() => { onCalculate("comma-add"); onClose(); }}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-left transition text-[11px]"
          >
            1,000 단위 자릿점(,) 넣기 (예: 12345 → 12,345)
          </button>
          <button
            type="button"
            onClick={() => { onCalculate("comma-remove"); onClose(); }}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-left transition text-[11px]"
          >
            자릿점 빼기 (예: 12,345 → 12345)
          </button>
        </div>
      </div>
    </div>
  );
}

// 10. 맞춤법 및 띄어쓰기 교정 도우미
export function SpellCheckModal({
  isOpen,
  onClose,
  fullText,
  onFixAll,
}: {
  isOpen: boolean;
  onClose: () => void;
  fullText: string;
  onFixAll: (corrections: Array<{ from: string; to: string }>) => void;
}) {
  if (!isOpen) return null;

  // 주요 한국어 혼동 어휘 사전
  const rules = [
    { from: "되요", to: "돼요", desc: "'되어요'의 준말은 '돼요'입니다." },
    { from: "봬요", to: "봬요", desc: "" },
    { from: "뵈요", to: "봬요", desc: "'뵈어요'의 준말은 '봬요'입니다." },
    { from: "몇일", to: "며칠", desc: "'몇 일'은 비표준어이며 '며칠'이 올바릅니다." },
    { from: "어의없", to: "어이없", desc: "'어이없다'가 올바른 표현입니다." },
    { from: "않되", to: "안 되", desc: "'아니 되다'의 줄임말로 '안 되'가 맞습니다." },
    { from: "금새", to: "금세", desc: "'금시에'의 준말은 '금세'입니다." },
    { from: "왠만", to: "웬만", desc: "'웬만하다'가 올바른 표기입니다." },
    { from: "왠일", to: "웬일", desc: "'웬일'이 올바른 표기입니다." },
    { from: "어떻해", to: "어떡해", desc: "'어떻게 해'의 준말은 '어떡해'입니다." },
  ];

  const foundIssues = rules.filter((r) => r.from !== r.to && fullText.includes(r.from));

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-96 bg-white rounded-xl shadow-2xl border border-neutral-300 p-4 text-neutral-800 flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-600">✓</span>
            <span>한글 맞춤법 및 교정 도우미</span>
          </span>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
        </h4>
        <div className="text-xs">
          {foundIssues.length === 0 ? (
            <div className="py-6 text-center text-neutral-500">
              <div className="text-2xl mb-1">🎉</div>
              <p className="font-bold text-emerald-700">발견된 맞춤법 오류가 없습니다!</p>
              <p className="text-[11px] text-neutral-400 mt-1">문서가 깨끗하게 작성되었습니다.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              <div className="text-[11px] text-red-600 font-bold">
                {foundIssues.length}건의 교정 추천 항목이 있습니다:
              </div>
              {foundIssues.map((issue) => (
                <div key={issue.from} className="p-2 rounded border border-red-200 bg-red-50/50 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="line-through text-red-600 font-bold">{issue.from}</span>
                    <span>→</span>
                    <span className="text-emerald-700 font-bold">{issue.to}</span>
                  </div>
                  <div className="text-[10px] text-neutral-500">{issue.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded text-xs border border-neutral-300 hover:bg-neutral-100 text-neutral-700 font-medium"
          >
            닫기
          </button>
          {foundIssues.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onFixAll(foundIssues.map((i) => ({ from: i.from, to: i.to })));
                onClose();
              }}
              className="px-4 py-1 rounded text-xs bg-emerald-600 text-white font-bold hover:bg-emerald-700"
            >
              모두 교정하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export interface CharShapeApplyValues {
  fontFamily: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  superscript: boolean;
  subscript: boolean;
  color: string;
  shadingColor: string;
  relativeSizePct: number;
  charWidthPct: number;
  charPosPct: number;
  letterSpacingPct: number;
}

function CharShapeNumberInput({
  value,
  min,
  max,
  step = 1,
  className = "w-full px-2 py-1 outline-none",
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  className?: string;
  onChange: (val: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);

  const displayed = editing ? draft : String(value);

  const commitValue = (raw: string) => {
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    onChange(clamped);
    setDraft(String(clamped));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayed}
      onFocus={(e) => {
        setEditing(true);
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (next === "" || next === "-" || next === "." || next === "-.") return;
        const parsed = parseFloat(next);
        if (!isNaN(parsed)) {
          onChange(Math.max(min, Math.min(max, parsed)));
        }
      }}
      onBlur={() => {
        setEditing(false);
        commitValue(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const next = Math.min(max, Math.round((value + step) * 10) / 10);
          onChange(next);
          setDraft(String(next));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.max(min, Math.round((value - step) * 10) / 10);
          onChange(next);
          setDraft(String(next));
        }
      }}
      className={className}
    />
  );
}

export function CharShapeModal({
  initial,
  editorFonts,
  onOpenAddFont,
  onApply,
  onClose,
}: {
  initial: {
    fontFamily: string;
    sizePt: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough?: boolean;
    color: string;
    shadingColor?: string;
    relativeSizePct?: number;
    charWidthPct?: number;
    charPosPct?: number;
    letterSpacingPct?: number;
  };
  editorFonts: Array<{ id?: string; label: string; value: string }>;
  onOpenAddFont: () => void;
  onApply: (values: CharShapeApplyValues) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"basic" | "extended">("basic");
  const [sizePt, setSizePt] = useState<number>(initial.sizePt || 10);
  const [lang, setLang] = useState("대표");
  const [fontFamily, setFontFamily] = useState<string>(initial.fontFamily || editorFonts[0]?.value || "");
  const [relativeSizePct, setRelativeSizePct] = useState<number>(initial.relativeSizePct ?? 100);
  const [charWidthPct, setCharWidthPct] = useState<number>(initial.charWidthPct ?? 100);
  const [charPosPct, setCharPosPct] = useState<number>(initial.charPosPct ?? 0);
  const [letterSpacingPct, setLetterSpacingPct] = useState<number>(initial.letterSpacingPct ?? 0);

  const [bold, setBold] = useState<boolean>(initial.bold);
  const [italic, setItalic] = useState<boolean>(initial.italic);
  const [underline, setUnderline] = useState<boolean>(initial.underline);
  const [strikethrough, setStrikethrough] = useState<boolean>(Boolean(initial.strikethrough));
  const [outlineAttr, setOutlineAttr] = useState<boolean>(false);
  const [shadowAttr, setShadowAttr] = useState<boolean>(false);
  const [embossAttr, setEmbossAttr] = useState<boolean>(false);
  const [engraveAttr, setEngraveAttr] = useState<boolean>(false);
  const [superscript, setSuperscript] = useState<boolean>(false);
  const [subscript, setSubscript] = useState<boolean>(false);

  const [color, setColor] = useState<string>(initial.color || "#000000");
  const [shadingColor, setShadingColor] = useState<string>(initial.shadingColor || "");

  // 확장 탭 상태
  const [underlinePos, setUnderlinePos] = useState<"none" | "bottom" | "top">(initial.underline ? "bottom" : "none");
  const [underlineShape, setUnderlineShape] = useState("실선");
  const [underlineColor, setUnderlineColor] = useState("#000000");
  const [strikeShape, setStrikeShape] = useState("없음");
  const [strikeColor, setStrikeColor] = useState("#000000");
  const [borderKind, setBorderKind] = useState("없음");
  const [borderWidth, setBorderWidth] = useState("0.1mm");
  const [borderColor, setBorderColor] = useState("#000000");
  const [bgFaceColor, setBgFaceColor] = useState("");
  const [bgPatternColor, setBgPatternColor] = useState("#ffffff");
  const [bgPatternShape, setBgPatternShape] = useState("없음");

  const resetNormalStyle = () => {
    setBold(false);
    setItalic(false);
    setUnderline(false);
    setUnderlinePos("none");
    setStrikethrough(false);
    setStrikeShape("없음");
    setOutlineAttr(false);
    setShadowAttr(false);
    setEmbossAttr(false);
    setEngraveAttr(false);
    setSuperscript(false);
    setSubscript(false);
  };

  return (
    <div
      className="fixed inset-0 z-80 flex items-center justify-center bg-black/25 select-none font-sans"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-neutral-400 shadow-2xl rounded-[2px] w-[630px] max-w-[95vw] text-[12px] text-neutral-800 overflow-hidden"
      >
        {/* 상단 타이틀 바 */}
        <div className="bg-[#eef3fc] px-3.5 py-2 border-b border-neutral-200 flex items-center justify-between">
          <span className="font-medium text-neutral-800 text-[13px]">글자 모양</span>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900 cursor-pointer text-sm leading-none px-1"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 본문 + 우측 확인/취소 버튼 */}
        <div className="p-4 flex gap-4">
          <div className="flex-1 min-w-0">
            {/* 탭 바: 기본 | 확장 */}
            <div className="flex items-center border-b border-neutral-200 mb-3">
              <button
                type="button"
                onClick={() => setTab("basic")}
                className={`px-4 py-1.5 text-[12px] cursor-pointer transition ${tab === "basic"
                  ? "border-b-2 border-[#0066cc] text-[#0066cc] font-semibold"
                  : "text-neutral-600 hover:text-neutral-900"
                  }`}
              >
                기본
              </button>
              <div className="w-[1px] h-3 bg-neutral-300" />
              <button
                type="button"
                onClick={() => setTab("extended")}
                className={`px-4 py-1.5 text-[12px] cursor-pointer transition ${tab === "extended"
                  ? "border-b-2 border-[#0066cc] text-[#0066cc] font-semibold"
                  : "text-neutral-600 hover:text-neutral-900"
                  }`}
              >
                확장
              </button>
            </div>

            {tab === "basic" ? (
              <div className="border border-neutral-200 rounded-[2px] p-4 flex flex-col gap-3.5">
                {/* 기준 크기 */}
                <div className="flex items-center gap-4">
                  <span className="w-16 text-neutral-700">기준 크기</span>
                  <div className="flex items-center border border-neutral-300 rounded-[2px] bg-white">
                    <CharShapeNumberInput
                      value={sizePt}
                      min={1}
                      max={200}
                      step={0.5}
                      onChange={setSizePt}
                      className="w-20 px-2 py-1 text-[12px] outline-none"
                    />
                    <span className="text-[11px] text-neutral-500 pr-1">pt</span>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setSizePt(Number(e.target.value));
                      }}
                      className="w-5 py-1 border-l border-neutral-200 bg-neutral-50 text-[11px] outline-none cursor-pointer"
                      title="기준 크기 선택"
                    >
                      <option value="" disabled />
                      {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map((pt) => (
                        <option key={pt} value={pt}>
                          {pt}.0 pt
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 언어별 설정 */}
                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">언어별 설정</div>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-2 pl-2">
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">언어</span>
                      <select
                        value={lang}
                        onChange={(e) => setLang(e.target.value)}
                        className="w-32 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none focus:border-[#0066cc]"
                      >
                        {["대표", "한글", "영문", "한자", "일본어", "기타", "기호", "사용자"].map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">글꼴</span>
                      <select
                        value={fontFamily}
                        onChange={(e) => {
                          if (e.target.value === "__ADD_FONT__") {
                            onOpenAddFont();
                            return;
                          }
                          setFontFamily(e.target.value);
                        }}
                        className="w-36 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none focus:border-[#0066cc]"
                      >
                        {editorFonts.map((f) => (
                          <option key={f.id || f.value} value={f.value}>{f.label}</option>
                        ))}
                        <option value="__ADD_FONT__">➕ 폰트 추가 / 관리...</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">상대 크기</span>
                      <div className="w-32 flex items-center border border-neutral-300 rounded-[2px] bg-white">
                        <CharShapeNumberInput
                          value={relativeSizePct}
                          min={10}
                          max={500}
                          onChange={setRelativeSizePct}
                        />
                        <span className="text-[11px] text-neutral-500 pr-2">%</span>
                      </div>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">장평</span>
                      <div className="w-36 flex items-center border border-neutral-300 rounded-[2px] bg-white">
                        <CharShapeNumberInput
                          value={charWidthPct}
                          min={50}
                          max={200}
                          onChange={setCharWidthPct}
                        />
                        <span className="text-[11px] text-neutral-500 pr-2">%</span>
                      </div>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">글자 위치</span>
                      <div className="w-32 flex items-center border border-neutral-300 rounded-[2px] bg-white">
                        <CharShapeNumberInput
                          value={charPosPct}
                          min={-100}
                          max={100}
                          onChange={setCharPosPct}
                        />
                        <span className="text-[11px] text-neutral-500 pr-2">%</span>
                      </div>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">자간</span>
                      <div className="w-36 flex items-center border border-neutral-300 rounded-[2px] bg-white">
                        <CharShapeNumberInput
                          value={letterSpacingPct}
                          min={-50}
                          max={50}
                          onChange={setLetterSpacingPct}
                        />
                        <span className="text-[11px] text-neutral-500 pr-2">%</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 속성 */}
                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">속성</div>
                  <div className="flex items-center gap-1.5 pl-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setBold(!bold)}
                      title="진하게"
                      className={`w-8 h-8 border rounded-[2px] text-[13px] font-bold cursor-pointer ${bold ? "bg-[#e5f1fb] border-[#0066cc] text-[#0066cc]" : "border-neutral-300 bg-white hover:bg-neutral-50"
                        }`}
                    >
                      가
                    </button>
                    <button
                      type="button"
                      onClick={() => setItalic(!italic)}
                      title="기울임"
                      className={`w-8 h-8 border rounded-[2px] text-[13px] italic cursor-pointer ${italic ? "bg-[#e5f1fb] border-[#0066cc] text-[#0066cc]" : "border-neutral-300 bg-white hover:bg-neutral-50"
                        }`}
                    >
                      가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !underline;
                        setUnderline(next);
                        setUnderlinePos(next ? "bottom" : "none");
                      }}
                      title="밑줄"
                      className={`w-8 h-8 border rounded-[2px] text-[13px] underline cursor-pointer ${underline ? "bg-[#e5f1fb] border-[#0066cc] text-[#0066cc]" : "border-neutral-300 bg-white hover:bg-neutral-50"
                        }`}
                    >
                      가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !strikethrough;
                        setStrikethrough(next);
                        setStrikeShape(next ? "실선" : "없음");
                      }}
                      title="취소선"
                      className={`w-8 h-8 border rounded-[2px] text-[13px] line-through cursor-pointer ${strikethrough ? "bg-[#e5f1fb] border-[#0066cc] text-[#0066cc]" : "border-neutral-300 bg-white hover:bg-neutral-50"
                        }`}
                    >
                      가
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutlineAttr(!outlineAttr)}
                      title="외곽선"
                      className={`w-8 h-8 border rounded-[2px] text-[13px] cursor-pointer ${outlineAttr ? "bg-[#e5f1fb] border-[#0066cc] text-[#0066cc]" : "border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-500"
                        }`}
                      style={{ WebkitTextStroke: "0.5px currentColor", color: outlineAttr ? "#0066cc" : "transparent" }}
                    >
                      가
                    </button>
                    <button
                      type="button"
                      onClick={() => setShadowAttr(!shadowAttr)}
                      title="그림자"
                      className={`w-8 h-8 border rounded-[2px] text-[13px] cursor-pointer ${shadowAttr ? "bg-[#e5f1fb] border-[#0066cc] text-[#0066cc]" : "border-neutral-300 bg-white hover:bg-neutral-50"
                        }`}
                      style={{ textShadow: "1.5px 1.5px 0px rgba(0,0,0,0.35)" }}
                    >
                      가
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEmbossAttr(!embossAttr); if (!embossAttr) setEngraveAttr(false); }}
                      title="양각"
                      className={`w-8 h-8 border rounded-[2px] text-[13px] cursor-pointer ${embossAttr ? "bg-[#e5f1fb] border-[#0066cc] text-[#0066cc]" : "border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-500"
                        }`}
                    >
                      가
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEngraveAttr(!engraveAttr); if (!engraveAttr) setEmbossAttr(false); }}
                      title="음각"
                      className={`w-8 h-8 border rounded-[2px] text-[13px] cursor-pointer ${engraveAttr ? "bg-[#e5f1fb] border-[#0066cc] text-[#0066cc]" : "border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-600"
                        }`}
                    >
                      가
                    </button>

                    <div className="w-2" />

                    <button
                      type="button"
                      onClick={() => { setSuperscript(!superscript); if (!superscript) setSubscript(false); }}
                      title="위 첨자"
                      className={`w-8 h-8 border rounded-[2px] text-[11px] cursor-pointer flex items-center justify-center ${superscript ? "bg-[#e5f1fb] border-[#0066cc] text-[#0066cc] font-bold" : "border-neutral-300 bg-white hover:bg-neutral-50 text-[#0066cc]"
                        }`}
                    >
                      X<sup className="text-[9px]">가</sup>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSubscript(!subscript); if (!subscript) setSuperscript(false); }}
                      title="아래 첨자"
                      className={`w-8 h-8 border rounded-[2px] text-[11px] cursor-pointer flex items-center justify-center ${subscript ? "bg-[#e5f1fb] border-[#0066cc] text-[#0066cc] font-bold" : "border-neutral-300 bg-white hover:bg-neutral-50 text-[#0066cc]"
                        }`}
                    >
                      X<sub className="text-[9px]">가</sub>
                    </button>

                    <div className="w-2" />

                    <button
                      type="button"
                      onClick={resetNormalStyle}
                      title="보통 모양 (속성 해제)"
                      className="w-8 h-8 border border-neutral-300 rounded-[2px] bg-white hover:bg-neutral-50 text-[13px] cursor-pointer"
                    >
                      가
                    </button>
                  </div>

                  {/* 글자 색 / 음영 색 */}
                  <div className="flex items-center gap-8 pl-2 mt-3">
                    <label className="flex items-center gap-3">
                      <span className="text-neutral-700">글자 색</span>
                      <div className="flex items-center border border-neutral-300 rounded-[2px] px-1.5 py-0.5 bg-white">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="w-16 h-5 border-0 bg-transparent cursor-pointer p-0"
                        />
                      </div>
                    </label>
                    <div className="flex items-center gap-3">
                      <span className="text-neutral-700">음영 색</span>
                      <div className="flex items-center gap-1 border border-neutral-300 rounded-[2px] px-1.5 py-0.5 bg-white">
                        {shadingColor ? (
                          <input
                            type="color"
                            value={shadingColor}
                            onChange={(e) => setShadingColor(e.target.value)}
                            className="w-14 h-5 border-0 bg-transparent cursor-pointer p-0"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShadingColor("#fef08a")}
                            className="w-14 h-5 border border-neutral-400 bg-white relative cursor-pointer"
                            title="음영 색 선택"
                          >
                            <svg className="w-full h-full" viewBox="0 0 40 16" preserveAspectRatio="none">
                              <line x1="0" y1="16" x2="40" y2="0" stroke="#dc2626" strokeWidth="1.5" />
                            </svg>
                          </button>
                        )}
                        {shadingColor && (
                          <button
                            type="button"
                            onClick={() => setShadingColor("")}
                            className="text-[10px] text-neutral-500 hover:text-neutral-800 cursor-pointer px-1"
                            title="음영 없음"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* 확장 탭 */
              <div className="border border-neutral-200 rounded-[2px] p-4 grid grid-cols-2 gap-x-8 gap-y-5">
                {/* 밑줄 */}
                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">밑줄</div>
                  <div className="flex flex-col gap-2 pl-2">
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">위치</span>
                      <select
                        value={underlinePos}
                        onChange={(e) => {
                          const v = e.target.value as "none" | "bottom" | "top";
                          setUnderlinePos(v);
                          setUnderline(v !== "none");
                        }}
                        className="w-36 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                      >
                        <option value="none">없음</option>
                        <option value="bottom">글자 아래</option>
                        <option value="top">글자 위</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className={underlinePos === "none" ? "text-neutral-400" : "text-neutral-700"}>모양</span>
                      <select
                        disabled={underlinePos === "none"}
                        value={underlineShape}
                        onChange={(e) => setUnderlineShape(e.target.value)}
                        className="w-36 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white disabled:bg-neutral-50 disabled:text-neutral-400 outline-none"
                      >
                        {["실선", "이중선", "점선", "파선"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className={underlinePos === "none" ? "text-neutral-400" : "text-neutral-700"}>색</span>
                      <input
                        type="color"
                        disabled={underlinePos === "none"}
                        value={underlineColor}
                        onChange={(e) => setUnderlineColor(e.target.value)}
                        className="w-36 h-6 border border-neutral-300 rounded-[2px] bg-white disabled:opacity-40 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {/* 취소선 */}
                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">취소선</div>
                  <div className="flex flex-col gap-2 pl-2">
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">모양</span>
                      <select
                        value={strikeShape}
                        onChange={(e) => {
                          setStrikeShape(e.target.value);
                          setStrikethrough(e.target.value !== "없음");
                        }}
                        className="w-36 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                      >
                        {["없음", "실선", "이중선", "점선"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className={strikeShape === "없음" ? "text-neutral-400" : "text-neutral-700"}>색</span>
                      <input
                        type="color"
                        disabled={strikeShape === "없음"}
                        value={strikeColor}
                        onChange={(e) => setStrikeColor(e.target.value)}
                        className="w-36 h-6 border border-neutral-300 rounded-[2px] bg-white disabled:opacity-40 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {/* 테두리 */}
                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">테두리</div>
                  <div className="flex flex-col gap-2 pl-2">
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">종류</span>
                      <select
                        value={borderKind}
                        onChange={(e) => setBorderKind(e.target.value)}
                        className="w-36 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                      >
                        {["없음", "실선", "점선", "파선"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">굵기</span>
                      <select
                        value={borderWidth}
                        onChange={(e) => setBorderWidth(e.target.value)}
                        className="w-36 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                      >
                        {["0.1mm", "0.12mm", "0.2mm", "0.4mm", "0.7mm", "1.0mm"].map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">색</span>
                      <input
                        type="color"
                        value={borderColor}
                        onChange={(e) => setBorderColor(e.target.value)}
                        className="w-36 h-6 border border-neutral-300 rounded-[2px] bg-white cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {/* 배경 */}
                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">배경</div>
                  <div className="flex flex-col gap-2 pl-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">면 색</span>
                      <div className="w-36 flex items-center gap-1">
                        {bgFaceColor ? (
                          <input
                            type="color"
                            value={bgFaceColor}
                            onChange={(e) => setBgFaceColor(e.target.value)}
                            className="flex-1 h-6 border border-neutral-300 rounded-[2px] bg-white cursor-pointer"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setBgFaceColor("#fef08a")}
                            className="flex-1 h-6 border border-neutral-400 bg-white cursor-pointer"
                            title="면 색 선택"
                          >
                            <svg className="w-full h-full" viewBox="0 0 80 18" preserveAspectRatio="none">
                              <line x1="0" y1="18" x2="80" y2="0" stroke="#dc2626" strokeWidth="1.5" />
                            </svg>
                          </button>
                        )}
                        {bgFaceColor && (
                          <button
                            type="button"
                            onClick={() => setBgFaceColor("")}
                            className="text-[10px] text-neutral-500 hover:text-neutral-800 cursor-pointer px-1"
                            title="면 색 없음"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">무늬 색</span>
                      <input
                        type="color"
                        value={bgPatternColor}
                        onChange={(e) => setBgPatternColor(e.target.value)}
                        className="w-36 h-6 border border-neutral-300 rounded-[2px] bg-white cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">무늬 모양</span>
                      <select
                        value={bgPatternShape}
                        onChange={(e) => setBgPatternShape(e.target.value)}
                        className="w-36 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                      >
                        {["없음", "가로 줄", "세로 줄", "격자"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 우측 확인 / 취소 버튼 */}
          <div className="w-24 flex flex-col gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onApply({
                  fontFamily,
                  sizePt,
                  bold,
                  italic,
                  underline: underline || underlinePos !== "none",
                  strikethrough: strikethrough || strikeShape !== "없음",
                  superscript,
                  subscript,
                  color,
                  shadingColor: shadingColor || bgFaceColor,
                  relativeSizePct,
                  charWidthPct,
                  charPosPct,
                  letterSpacingPct,
                });
                onClose();
              }}
              className="w-full py-1.5 border border-neutral-300 rounded-[2px] bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer"
            >
              확인
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-1.5 border border-neutral-300 rounded-[2px] bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface ParaShapeApplyValues {
  align: "left" | "center" | "right" | "justify";
  marginLeftPt: number;
  marginRightPt: number;
  firstLineType: "none" | "indent" | "outdent";
  firstLinePt: number;
  lineSpacingPct: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
  paraBorderType: string;
  paraBorderWidth: string;
  paraBorderColor: string;
  paraBgColor: string;
}

export function ParaShapeModal({
  initial,
  onApply,
  onClose,
}: {
  initial: {
    align: "left" | "center" | "right" | "justify";
    marginLeftPt?: number;
    marginRightPt?: number;
    firstLineType?: "none" | "indent" | "outdent";
    firstLinePt?: number;
    lineSpacingPct?: number;
    spaceBeforePt?: number;
    spaceAfterPt?: number;
    paraBorderType?: string;
    paraBorderWidth?: string;
    paraBorderColor?: string;
    paraBgColor?: string;
  };
  onApply: (values: ParaShapeApplyValues) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"basic" | "border">("basic");
  const [align, setAlign] = useState<"left" | "center" | "right" | "justify">(initial.align || "justify");
  const [alignExtra, setAlignExtra] = useState<"none" | "distribute" | "divide">("none");
  const [marginLeftPt, setMarginLeftPt] = useState<number>(initial.marginLeftPt ?? 0);
  const [marginRightPt, setMarginRightPt] = useState<number>(initial.marginRightPt ?? 0);
  const [firstLineType, setFirstLineType] = useState<"none" | "indent" | "outdent">(initial.firstLineType ?? "none");
  const [firstLinePt, setFirstLinePt] = useState<number>(initial.firstLinePt ?? 0);
  const [lineSpacingKind, setLineSpacingKind] = useState("글자에 따라");
  const [lineSpacingPct, setLineSpacingPct] = useState<number>(initial.lineSpacingPct ?? 160);
  const [spaceBeforePt, setSpaceBeforePt] = useState<number>(initial.spaceBeforePt ?? 0);
  const [spaceAfterPt, setSpaceAfterPt] = useState<number>(initial.spaceAfterPt ?? 0);
  const [usePageGrid, setUsePageGrid] = useState(true);
  const [hangulBreak, setHangulBreak] = useState("어절");
  const [latinBreak, setLatinBreak] = useState("단어");
  const [minSpacePct, setMinSpacePct] = useState<number>(100);

  // 테두리/배경 탭 상태
  const [paraBorderType, setParaBorderType] = useState(initial.paraBorderType || "없음");
  const [paraBorderWidth, setParaBorderWidth] = useState(initial.paraBorderWidth || "0.1mm");
  const [paraBorderColor, setParaBorderColor] = useState(initial.paraBorderColor || "#000000");
  const [connectParaBorder, setConnectParaBorder] = useState(false);
  const [paraBgColor, setParaBgColor] = useState(initial.paraBgColor || "");
  const [paraPatternColor, setParaPatternColor] = useState("#000000");
  const [paraPatternShape, setParaPatternShape] = useState("없음");

  const alignButtons: Array<{
    key: string;
    title: string;
    targetAlign: "left" | "center" | "right" | "justify";
    extra: "none" | "distribute" | "divide";
    lines: string[];
  }> = [
      { key: "justify", title: "양쪽 정렬", targetAlign: "justify", extra: "none", lines: ["w-4", "w-4", "w-4", "w-4"] },
      { key: "left", title: "왼쪽 정렬", targetAlign: "left", extra: "none", lines: ["w-4", "w-2.5", "w-4", "w-3"] },
      { key: "center", title: "가운데 정렬", targetAlign: "center", extra: "none", lines: ["w-4 mx-auto", "w-2.5 mx-auto", "w-4 mx-auto", "w-3 mx-auto"] },
      { key: "right", title: "오른쪽 정렬", targetAlign: "right", extra: "none", lines: ["w-4 ml-auto", "w-2.5 ml-auto", "w-4 ml-auto", "w-3 ml-auto"] },
      { key: "distribute", title: "배분 정렬", targetAlign: "justify", extra: "distribute", lines: ["w-4", "w-4", "w-4", "w-4 border-dashed"] },
      { key: "divide", title: "나눔 정렬", targetAlign: "justify", extra: "divide", lines: ["w-4", "w-3 mx-auto", "w-4", "w-2 mx-auto"] },
    ];

  return (
    <div
      className="fixed inset-0 z-80 flex items-center justify-center bg-black/25 select-none font-sans"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-neutral-400 shadow-2xl rounded-[2px] w-[660px] max-w-[95vw] text-[12px] text-neutral-800 overflow-hidden"
      >
        {/* 상단 타이틀 바 */}
        <div className="bg-[#eef3fc] px-3.5 py-2 border-b border-neutral-200 flex items-center justify-between">
          <span className="font-medium text-neutral-800 text-[13px]">문단 모양</span>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900 cursor-pointer text-sm leading-none px-1"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 본문 + 우측 확인/취소 버튼 */}
        <div className="p-4 flex gap-4">
          <div className="flex-1 min-w-0">
            {/* 탭 바: 기본 | 테두리/배경 */}
            <div className="flex items-center border-b border-neutral-200 mb-3">
              <button
                type="button"
                onClick={() => setTab("basic")}
                className={`px-4 py-1.5 text-[12px] cursor-pointer transition ${tab === "basic"
                  ? "border-b-2 border-[#0066cc] text-[#0066cc] font-semibold"
                  : "text-neutral-600 hover:text-neutral-900"
                  }`}
              >
                기본
              </button>
              <div className="w-[1px] h-3 bg-neutral-300" />
              <button
                type="button"
                onClick={() => setTab("border")}
                className={`px-4 py-1.5 text-[12px] cursor-pointer transition ${tab === "border"
                  ? "border-b-2 border-[#0066cc] text-[#0066cc] font-semibold"
                  : "text-neutral-600 hover:text-neutral-900"
                  }`}
              >
                테두리/배경
              </button>
            </div>

            {tab === "basic" ? (
              <div className="border border-neutral-200 rounded-[2px] p-4 flex flex-col gap-4">
                {/* 정렬 방식 */}
                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">정렬 방식</div>
                  <div className="flex items-center gap-1.5 pl-2">
                    {alignButtons.map((btn) => {
                      const active = align === btn.targetAlign && alignExtra === btn.extra;
                      return (
                        <button
                          key={btn.key}
                          type="button"
                          title={btn.title}
                          onClick={() => {
                            setAlign(btn.targetAlign);
                            setAlignExtra(btn.extra);
                          }}
                          className={`w-8 h-7 border rounded-[2px] flex flex-col justify-center gap-[2.5px] px-1.5 cursor-pointer ${active
                            ? "bg-[#e5e7eb] border-neutral-500 shadow-inner"
                            : "bg-white border-neutral-300 hover:bg-neutral-50"
                            }`}
                        >
                          {btn.lines.map((cls, idx) => (
                            <span key={idx} className={`h-[1.5px] bg-neutral-700 block ${cls}`} />
                          ))}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 여백 | 첫 줄 */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">여백</div>
                    <div className="flex flex-col gap-2 pl-2">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-700">왼쪽</span>
                        <div className="w-32 flex items-center border border-neutral-300 rounded-[2px] bg-white">
                          <CharShapeNumberInput value={marginLeftPt} min={0} max={300} step={1} onChange={setMarginLeftPt} />
                          <span className="text-[11px] text-neutral-500 pr-2">pt</span>
                        </div>
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-700">오른쪽</span>
                        <div className="w-32 flex items-center border border-neutral-300 rounded-[2px] bg-white">
                          <CharShapeNumberInput value={marginRightPt} min={0} max={300} step={1} onChange={setMarginRightPt} />
                          <span className="text-[11px] text-neutral-500 pr-2">pt</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">첫 줄</div>
                    <div className="flex items-center gap-3 pl-2">
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="paraFirstLine"
                            checked={firstLineType === "none"}
                            onChange={() => setFirstLineType("none")}
                            className="accent-[#0066cc]"
                          />
                          <span>보통</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="paraFirstLine"
                            checked={firstLineType === "indent"}
                            onChange={() => setFirstLineType("indent")}
                            className="accent-[#0066cc]"
                          />
                          <span>들여쓰기</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="paraFirstLine"
                            checked={firstLineType === "outdent"}
                            onChange={() => setFirstLineType("outdent")}
                            className="accent-[#0066cc]"
                          />
                          <span>내어쓰기</span>
                        </label>
                      </div>
                      <div
                        className={`w-28 flex items-center border rounded-[2px] ${firstLineType === "none" ? "border-neutral-200 bg-neutral-50 opacity-50 pointer-events-none" : "border-neutral-300 bg-white"
                          }`}
                      >
                        <CharShapeNumberInput value={firstLinePt} min={0} max={200} step={1} onChange={setFirstLinePt} />
                        <span className="text-[11px] text-neutral-500 pr-2">pt</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 간격 */}
                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">간격</div>
                  <div className="grid grid-cols-2 gap-6 pl-2">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-700">줄 간격</span>
                        <select
                          value={lineSpacingKind}
                          onChange={(e) => setLineSpacingKind(e.target.value)}
                          className="w-32 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                        >
                          {["글자에 따라", "고정값", "여백만 지정"].map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex justify-end">
                        <div className="w-32 flex items-center border border-neutral-300 rounded-[2px] bg-white">
                          <CharShapeNumberInput value={lineSpacingPct} min={50} max={500} step={10} onChange={setLineSpacingPct} />
                          <span className="text-[11px] text-neutral-500 pr-2">%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-700">문단 위</span>
                        <div className="w-32 flex items-center border border-neutral-300 rounded-[2px] bg-white">
                          <CharShapeNumberInput value={spaceBeforePt} min={0} max={200} step={1} onChange={setSpaceBeforePt} />
                          <span className="text-[11px] text-neutral-500 pr-2">pt</span>
                        </div>
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-700">문단 아래</span>
                        <div className="w-32 flex items-center border border-neutral-300 rounded-[2px] bg-white">
                          <CharShapeNumberInput value={spaceAfterPt} min={0} max={200} step={1} onChange={setSpaceAfterPt} />
                          <span className="text-[11px] text-neutral-500 pr-2">pt</span>
                        </div>
                      </label>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 pl-2 mt-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usePageGrid}
                      onChange={(e) => setUsePageGrid(e.target.checked)}
                      className="accent-[#0066cc]"
                    />
                    <span className="text-neutral-700">편집 용지의 줄 격자 사용</span>
                  </label>
                </div>

                {/* 줄 나눔 기준 */}
                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">줄 나눔 기준</div>
                  <div className="grid grid-cols-2 gap-6 pl-2">
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-700">한글 단위</span>
                        <select
                          value={hangulBreak}
                          onChange={(e) => setHangulBreak(e.target.value)}
                          className="w-32 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                        >
                          <option value="어절">어절</option>
                          <option value="글자">글자</option>
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-700">영문 단위</span>
                        <select
                          value={latinBreak}
                          onChange={(e) => setLatinBreak(e.target.value)}
                          className="w-32 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                        >
                          <option value="단어">단어</option>
                          <option value="하이픈">하이픈</option>
                          <option value="글자">글자</option>
                        </select>
                      </label>
                    </div>
                    <div>
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-neutral-700">최소 공백</span>
                        <div className="w-32 flex items-center border border-neutral-300 rounded-[2px] bg-white">
                          <CharShapeNumberInput value={minSpacePct} min={0} max={200} step={5} onChange={setMinSpacePct} />
                          <span className="text-[11px] text-neutral-500 pr-2">%</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* 테두리/배경 탭 */
              <div className="border border-neutral-200 rounded-[2px] p-4 min-h-[260px] grid grid-cols-2 gap-x-8 gap-y-4 content-start">
                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">테두리</div>
                  <div className="flex flex-col gap-2 pl-2">
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">종류</span>
                      <select
                        value={paraBorderType}
                        onChange={(e) => setParaBorderType(e.target.value)}
                        className="w-36 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                      >
                        {["없음", "실선", "점선", "파선"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">굵기</span>
                      <select
                        value={paraBorderWidth}
                        onChange={(e) => setParaBorderWidth(e.target.value)}
                        className="w-36 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                      >
                        {["0.1mm", "0.12mm", "0.2mm", "0.4mm", "0.7mm", "1.0mm"].map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">색</span>
                      <input
                        type="color"
                        value={paraBorderColor}
                        onChange={(e) => setParaBorderColor(e.target.value)}
                        className="w-36 h-6 border border-neutral-300 rounded-[2px] bg-white cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center gap-2 mt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={connectParaBorder}
                        onChange={(e) => setConnectParaBorder(e.target.checked)}
                        className="accent-[#0066cc]"
                      />
                      <span className="text-neutral-700">문단 테두리 연결</span>
                    </label>
                  </div>
                </div>

                <div>
                  <div className="text-[#1e3a8a] font-semibold text-[12px] mb-2">배경</div>
                  <div className="flex flex-col gap-2 pl-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">면 색</span>
                      <div className="w-36 flex items-center gap-1">
                        {paraBgColor ? (
                          <input
                            type="color"
                            value={paraBgColor}
                            onChange={(e) => setParaBgColor(e.target.value)}
                            className="flex-1 h-6 border border-neutral-300 rounded-[2px] bg-white cursor-pointer"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setParaBgColor("#fef08a")}
                            className="flex-1 h-6 border border-neutral-400 bg-white cursor-pointer"
                            title="면 색 선택"
                          >
                            <svg className="w-full h-full" viewBox="0 0 80 18" preserveAspectRatio="none">
                              <line x1="0" y1="18" x2="80" y2="0" stroke="#dc2626" strokeWidth="1.5" />
                            </svg>
                          </button>
                        )}
                        {paraBgColor && (
                          <button
                            type="button"
                            onClick={() => setParaBgColor("")}
                            className="text-[10px] text-neutral-500 hover:text-neutral-800 cursor-pointer px-1"
                            title="면 색 없음"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">무늬 색</span>
                      <input
                        type="color"
                        value={paraPatternColor}
                        onChange={(e) => setParaPatternColor(e.target.value)}
                        className="w-36 h-6 border border-neutral-300 rounded-[2px] bg-white cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">무늬 모양</span>
                      <select
                        value={paraPatternShape}
                        onChange={(e) => setParaPatternShape(e.target.value)}
                        className="w-36 border border-neutral-300 rounded-[2px] px-2 py-1 bg-white outline-none"
                      >
                        {["없음", "가로 줄", "세로 줄", "격자"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 우측 확인 / 취소 버튼 */}
          <div className="w-24 flex flex-col gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onApply({
                  align,
                  marginLeftPt,
                  marginRightPt,
                  firstLineType,
                  firstLinePt,
                  lineSpacingPct,
                  spaceBeforePt,
                  spaceAfterPt,
                  paraBorderType,
                  paraBorderWidth,
                  paraBorderColor,
                  paraBgColor,
                });
                onClose();
              }}
              className="w-full py-1.5 border border-neutral-300 rounded-[2px] bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer"
            >
              확인
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-1.5 border border-neutral-300 rounded-[2px] bg-white hover:bg-neutral-50 text-neutral-800 cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


export function SplitCellModal({
  isOpen,
  initialRows = 1,
  initialCols = 1,
  canMergeBeforeSplit = false,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  initialRows?: number;
  initialCols?: number;
  canMergeBeforeSplit?: boolean;
  onClose: () => void;
  onConfirm: (opts: {
    rows: number;
    cols: number;
    equalRowHeight: boolean;
    mergeBeforeSplit: boolean;
  }) => void;
}) {
  const [useRows, setUseRows] = useState(true);
  const [useCols, setUseCols] = useState(false);
  const [rowsCount, setRowsCount] = useState(2);
  const [colsCount, setColsCount] = useState(2);
  const [equalRowHeight, setEqualRowHeight] = useState(false);
  const [mergeBeforeSplit, setMergeBeforeSplit] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const hasMergedRows = initialRows > 1;
    const hasMergedCols = initialCols > 1;
    if (hasMergedRows || hasMergedCols) {
      setUseRows(hasMergedRows);
      setUseCols(hasMergedCols);
      setRowsCount(hasMergedRows ? initialRows : 2);
      setColsCount(hasMergedCols ? initialCols : 2);
    } else {
      setUseRows(true);
      setUseCols(false);
      setRowsCount(2);
      setColsCount(2);
    }
    setEqualRowHeight(false);
    setMergeBeforeSplit(false);
  }, [isOpen, initialRows, initialCols]);

  if (!isOpen) return null;

  const canSubmit = useRows || useCols;

  const submit = () => {
    if (!canSubmit) return;
    const r = useRows ? Math.max(1, Math.min(20, Math.round(rowsCount) || 2)) : 1;
    const c = useCols ? Math.max(1, Math.min(20, Math.round(colsCount) || 2)) : 1;
    onConfirm({
      rows: r,
      cols: c,
      equalRowHeight,
      mergeBeforeSplit: canMergeBeforeSplit && mergeBeforeSplit,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/30 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "Enter" && canSubmit) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="w-[410px] bg-white border border-neutral-400 shadow-2xl rounded-[3px] text-[12px] text-neutral-800 overflow-hidden">
        <div className="h-9 px-3.5 bg-white border-b border-neutral-200 flex items-center justify-between font-semibold text-[13px] text-neutral-900">
          <span>셀 나누기</span>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900 text-base cursor-pointer px-1 leading-none"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="p-3.5 flex items-start gap-3">
          <div className="flex-1 border border-neutral-200 rounded-[2px] p-3.5 space-y-4">
            <div className="space-y-2.5">
              <div className="text-[12px] font-bold text-[#1d4ed8]">줄/칸 나누기</div>
              <div className="flex items-center gap-2.5 pl-1">
                <label className="inline-flex items-center gap-2 cursor-pointer min-w-[74px]">
                  <input
                    id="split-cell-use-rows"
                    type="checkbox"
                    checked={useRows}
                    onChange={(e) => setUseRows(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#1d4ed8] cursor-pointer"
                  />
                  <span className="text-neutral-800">줄 개수</span>
                </label>
                <input
                  id="split-cell-rows"
                  type="number"
                  min={1}
                  max={20}
                  disabled={!useRows}
                  value={rowsCount}
                  onChange={(e) => setRowsCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className={`w-28 px-2 py-1 border rounded-[2px] outline-none ${useRows
                    ? "bg-white border-neutral-300 text-neutral-900 focus:border-[#1d4ed8]"
                    : "bg-neutral-50 border-neutral-200 text-neutral-300 cursor-not-allowed"
                    }`}
                />
              </div>
              <div className="flex items-center gap-2.5 pl-1">
                <label className="inline-flex items-center gap-2 cursor-pointer min-w-[74px]">
                  <input
                    id="split-cell-use-cols"
                    type="checkbox"
                    checked={useCols}
                    onChange={(e) => setUseCols(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#1d4ed8] cursor-pointer"
                  />
                  <span className="text-neutral-800">칸 개수</span>
                </label>
                <input
                  id="split-cell-cols"
                  type="number"
                  min={1}
                  max={20}
                  disabled={!useCols}
                  value={colsCount}
                  onChange={(e) => setColsCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className={`w-28 px-2 py-1 border rounded-[2px] outline-none ${useCols
                    ? "bg-white border-neutral-300 text-neutral-900 focus:border-[#1d4ed8]"
                    : "bg-neutral-50 border-neutral-200 text-neutral-300 cursor-not-allowed"
                    }`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[12px] font-bold text-[#1d4ed8]">선택 사항</div>
              <label className="flex items-center gap-2 pl-1 cursor-pointer">
                <input
                  id="split-cell-equal-height"
                  type="checkbox"
                  checked={equalRowHeight}
                  onChange={(e) => setEqualRowHeight(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#1d4ed8] cursor-pointer"
                />
                <span className="text-neutral-800">줄 높이를 같게 나누기</span>
              </label>
              <label
                className={`flex items-center gap-2 pl-1 ${canMergeBeforeSplit ? "cursor-pointer" : "cursor-not-allowed"
                  }`}
              >
                <input
                  id="split-cell-merge-first"
                  type="checkbox"
                  disabled={!canMergeBeforeSplit}
                  checked={canMergeBeforeSplit && mergeBeforeSplit}
                  onChange={(e) => setMergeBeforeSplit(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#1d4ed8] disabled:opacity-40"
                />
                <span className={canMergeBeforeSplit ? "text-neutral-800" : "text-neutral-300"}>
                  셀을 합친 후 나누기
                </span>
              </label>
            </div>
          </div>

          <div className="w-[82px] flex flex-col gap-2 shrink-0">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              className={`w-full py-1.5 border rounded-[2px] text-[12px] ${canSubmit
                ? "border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-900 cursor-pointer"
                : "border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed"
                }`}
            >
              나누기
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-1.5 border border-neutral-300 rounded-[2px] bg-white hover:bg-neutral-50 text-neutral-900 cursor-pointer text-[12px]"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeleteTableCellsModal({
  isOpen,
  onKeepShape,
  onDeleteCells,
  onClose,
}: {
  isOpen: boolean;
  onKeepShape: () => void;
  onDeleteCells: () => void;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1350] flex items-center justify-center bg-black/25 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "Enter") {
          e.preventDefault();
          onKeepShape();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="한글"
        className="w-[460px] bg-[#f7f8fa] border border-[#93b4e8] shadow-2xl rounded-[3px] text-[13px] text-neutral-800 overflow-hidden"
      >
        <div className="h-8 px-3 bg-gradient-to-b from-[#eef4fc] to-[#e2ecfa] border-b border-[#c5d7f2] flex items-center text-[13px] font-medium text-neutral-800">
          한글
        </div>
        <div className="p-3 bg-[#f7f8fa]">
          <div className="bg-white border border-neutral-200 rounded-[2px] px-5 py-5">
            <div className="flex items-center gap-4">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                className="shrink-0"
                aria-hidden="true"
              >
                <path
                  d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  fill="#f5b81c"
                />
                <rect x="11.1" y="9" width="1.8" height="5.2" rx="0.9" fill="#ffffff" />
                <circle cx="12" cy="16.6" r="1.05" fill="#ffffff" />
              </svg>
              <p className="text-[13px] text-neutral-800 leading-snug">
                선택된 셀들을 지웁니다. 내용만 지우고 셀 모양은 남겨 둘까요?
              </p>
            </div>
            <div className="my-4 border-t border-neutral-200" />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={onKeepShape}
                className="min-w-[54px] px-3 py-1 bg-[#d4d4d4] hover:bg-[#c8c8c8] border border-neutral-400 rounded-[2px] text-[12px] text-neutral-900 cursor-pointer outline-none"
              >
                예
              </button>
              <button
                type="button"
                onClick={onDeleteCells}
                className="min-w-[54px] px-3 py-1 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-[2px] text-[12px] text-neutral-800 cursor-pointer"
              >
                아니요
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-w-[54px] px-3 py-1 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-[2px] text-[12px] text-neutral-800 cursor-pointer"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
