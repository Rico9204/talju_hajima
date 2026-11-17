import React, { useState } from "react";
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
}: {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (mode: "char" | "para" | "both") => void;
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

            <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-100">
              <span className="font-bold text-[#1e4fa8]">셀 모양 복사</span>
              <div className="flex items-center gap-4 pl-1 text-neutral-600">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={cellAttr} onChange={(e) => setCellAttr(e.target.checked)} className="accent-[#0066cc]" />
                  <span>셀 속성</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={cellBorder} onChange={(e) => setCellBorder(e.target.checked)} className="accent-[#0066cc]" />
                  <span>셀 테두리</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={cellBg} onChange={(e) => setCellBg(e.target.checked)} className="accent-[#0066cc]" />
                  <span>셀 배경</span>
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 pt-1 border-t border-neutral-100">
              <span className="font-bold text-[#1e4fa8]">표에서 적용 대상</span>
              <div className="flex flex-col gap-1 pl-1 text-neutral-600">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="tableTarget" checked={tableTarget === "both"} onChange={() => setTableTarget("both")} className="accent-[#0066cc]" />
                  <span>본문 모양과 셀 모양 둘 다</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="tableTarget" checked={tableTarget === "cellOnly"} onChange={() => setTableTarget("cellOnly")} className="accent-[#0066cc]" />
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
              className="w-full h-8 border-2 border-[#4a89dc] bg-white hover:bg-neutral-50 text-neutral-900 text-[12px] font-medium rounded-xs cursor-pointer shadow-2xs"
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

// 3. 하이퍼링크 모달 (Ctrl+K)
export function HyperlinkModal({
  isOpen,
  onClose,
  onInsert,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string, url: string) => void;
}) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("https://");
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-88 bg-white rounded-xl shadow-2xl border border-neutral-300 p-4 text-neutral-800 flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-900 flex items-center justify-between border-b pb-2">
          <span className="flex items-center gap-1.5">
            <HyperlinkIcon className="w-4 h-4 text-blue-600" />
            <span>하이퍼링크 삽입 (Ctrl+K)</span>
          </span>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700 cursor-pointer">✕</button>
        </h4>
        <div className="flex flex-col gap-2.5 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-neutral-700 mb-1">표시할 텍스트</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="예: 과제 참고 링크"
              className="w-full bg-neutral-50 border border-neutral-300 rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#0066cc]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-neutral-700 mb-1">연결할 웹 주소 (URL)</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-neutral-50 border border-neutral-300 rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#0066cc]"
            />
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
              if (url) {
                onInsert(text || url, url);
                onClose();
              }
            }}
            className="px-4 py-1 rounded text-xs bg-[#0066cc] text-white font-bold hover:bg-[#0055aa]"
          >
            삽입
          </button>
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
                className={`p-2 rounded border text-left text-[11px] transition ${
                  pos === p.id ? "bg-blue-50 border-[#0066cc] text-[#0066cc] font-bold" : "border-neutral-200 hover:bg-neutral-50"
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

