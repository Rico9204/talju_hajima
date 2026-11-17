import { useEffect, useState } from "react";
import HwpxEditorModal from "./HwpxEditorModal";
import { newHwpxBytes, HWPX_MIME } from "../lib/hwpx";
import type { WorkspaceFile } from "../api/types";
import type { CollabPresence } from "../lib/collab";

export default function HwpxTestPage() {
  const [hwpxBytes, setHwpxBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState("한컴오피스_기능테스트_문서.hwpx");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sampleText =
          "[팀 프로젝트] 한컴오피스 웹 편집기 기능 테스트\n\n" +
          "본 문서는 한컴오피스 한글의 주요 조판 및 편집 기능을 로그인 없이 바로 테스트할 수 있도록 제공되는 독립형 문서입니다.\n\n" +
          "1. 상단 리본 메뉴 탭 안내\n" +
          "- [파일]: 문서마당 서식(보고서, 이력서, 회의록, 기안서 템플릿 로드), 텍스트(.txt) 및 HTML 내보내기, 인쇄, 편집 용지\n" +
          "- [편집]: 모양 복사(Alt+C), 글자 바꾸기(대/소문자, 전각/반각), 찾아 바꾸기(Ctrl+H)\n" +
          "- [보기]: 줄 번호 표시, 다단 보기(1단/2단/3단), 모눈 격자, 문단 부호\n" +
          "- [입력]: 글상자, 표/그림 캡션, 각주(Footnote), 하이퍼링크(Ctrl+K), 날짜/시간, 상용구(Ctrl+F3), 수식, 표, 도형, 문자표\n" +
          "- [서식]: 위 첨자(x²), 아래 첨자(x₁), 장평, 자간, 글머리표, 번호 목록, 글자 모양(Alt+L), 문단 모양(Alt+T)\n" +
          "- [쪽]: 다단 설정, 쪽 번호 매기기(Alt+N), 바탕쪽 워터마크, 쪽 나누기(Ctrl+Enter)\n" +
          "- [표]: 표 블록 계산식(합계/평균), 1000단위 쉼표 자릿점 넣기/빼기, 셀 합치기(M), 나누기(S), 너비 균등(W)\n" +
          "- [검토/도구]: 한국어 맞춤법 및 띄어쓰기 교정 도우미, 차례(목차) 만들기, 단축키 일람, 문서 통계";

        const bytes = await newHwpxBytes(sampleText);
        if (active) {
          setHwpxBytes(bytes);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFileName(uploadedFile.name);
    const buf = await uploadedFile.arrayBuffer();
    setHwpxBytes(new Uint8Array(buf));
  };

  if (loading || !hwpxBytes) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#181825] text-white gap-3 select-none">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-neutral-300">한글 편집기 기능 테스트 환경을 준비하는 중...</span>
      </div>
    );
  }

  const mockFile: WorkspaceFile = {
    id: 9999,
    name: fileName,
    type: "doc",
    uploader: "테스터",
    avatar: "🧑‍💻",
    date: new Date().toLocaleDateString("ko-KR"),
    size: "18 KB",
    tag: "기능테스트",
    tags: ["기능테스트"],
    folderId: null,
    versions: [],
    comments: [],
  };

  const mockPresence: CollabPresence = {
    key: "tester:test-session",
    me: { id: "tester", name: "테스터" },
    track: () => {},
    leave: () => {},
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#181825] overflow-hidden">
      {/* 상단 테스트 환경 알림 플로팅 바 */}
      <div className="fixed top-2.5 right-6 z-[9999] flex items-center gap-2.5 bg-neutral-900/90 text-white px-3.5 py-1.5 rounded-full border border-neutral-700 shadow-2xl text-xs backdrop-blur-md">
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="font-semibold text-neutral-200">한글 편집기 단독 테스트 모드</span>
        <span className="text-neutral-500">|</span>
        <label className="px-2.5 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold cursor-pointer transition shadow-xs flex items-center gap-1">
          <span>📁 내 .hwpx 파일 열기</span>
          <input type="file" accept=".hwpx" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      <HwpxEditorModal
        projectId="test-project"
        file={mockFile}
        room={1}
        mode="main"
        rawHwpxBytes={hwpxBytes}
        presence={mockPresence}
        editors={[]}
        save={async (_bytes, _text, baseVersionId) => {
          return baseVersionId + 1;
        }}
        onClose={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}
