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
          "[팀 프로젝트] 한컴오피스 웹 편집기 기능 테스트 (3페이지 이상 샘플 문서)\n\n" +
          "본 문서는 한컴오피스 한글의 주요 조판 및 편집 기능(자동 페이지 넘김, 한 쪽/두 쪽/세 쪽 보기, 확대/축소, 표/도형/수식/차트 편집)을 로그인 없이 바로 테스트할 수 있도록 구성된 다중 페이지 샘플 문서입니다.\n\n" +
          "1. 상단 리본 메뉴 탭 안내\n" +
          "- [파일]: 문서마당 서식(보고서, 이력서, 회의록, 기안서 템플릿 로드), 다른 이름으로 저장하기, PDF 다운로드, 인쇄, 편집 용지(19종 용지 규격 및 여백 설정), 문서 정보\n" +
          "- [편집]: 되돌리기/다시 실행, 오려 두기/복사하기/붙이기, 모양 복사(Ctrl+Alt+C), 조판 부호 지우기, 모두 선택, 찾기/찾아 바꾸기/찾아가기\n" +
          "- [보기]: 확대/축소(50%~300%, 쪽 맞춤, 폭 맞춤), 쪽 모양(한 쪽/두 쪽/세 쪽), 쪽 윤곽(Ctrl+G+L), 표시/숨기기(조판 부호, 문단 부호, 투명 선), 격자 보기, 도구 상자(기본/서식), 문서 창(눈금자), 메모\n" +
          "- [입력]: 글상자, 표/그림 캡션, 각주(Footnote), 하이퍼링크(Ctrl+K), 날짜/시간, 상용구(Ctrl+F3), 수식, 표, 도형, 문자표\n" +
          "- [서식]: 위 첨자(x²), 아래 첨자(x₁), 장평, 자간, 글머리표, 번호 목록, 글자 모양(Alt+L), 문단 모양(Alt+T)\n" +
          "- [쪽]: 다단 설정, 쪽 번호 매기기(Alt+N), 바탕쪽 워터마크, 쪽 나누기(Ctrl+Enter)\n" +
          "- [표]: 표 블록 계산식(합계/평균), 1000단위 쉼표 자릿점 넣기/빼기, 셀 합치기(M), 나누기(S), 너비 균등(W)\n" +
          "- [검토/도구]: 한국어 맞춤법 및 띄어쓰기 교정 도우미, 차례(목차) 만들기, 단축키 일람, 문서 통계\n\n" +
          "2. 실시간 동시 편집(Yjs CRDT) 및 호환성 검증 항목\n" +
          "2.1 문단 및 글자 서식 호환성\n" +
          "여러 사용자가 동시에 같은 문서를 열람하고 편집할 때, Yjs CRDT 동기화 엔진을 통해 문단 추가, 삭제, 순서 이동, 글꼴 변경, 글자 크기, 진하게/기울임/밑줄/취소선, 글자색 및 배경색이 실시간으로 병합됩니다. 또한 한글(.hwpx) 표준 OWPML XML 스키마를 준수하여 한컴오피스 및 한컴독스 웹 에디터에서도 동일한 서식으로 열립니다.\n\n" +
          "2.2 표(Table) 및 셀 서식 처리\n" +
          "표 내부의 각 셀은 독립적인 텍스트 편집, 셀 배경색 지정, 테두리 스타일(실선/점선/파선/없음), 셀 병합 및 분할, 행/열 추가 및 삭제, 합계 및 평균 자동 계산식을 지원합니다. 표 전체 크기는 용지 폭에 맞춰 자동 조정되며, 자유 이동(Floating) 배치 옵션도 지원합니다.\n\n" +
          "2.3 도형, 수식 및 차트 개체 렌더링\n" +
          "사각형, 타원, 직선 등의 도형 개체는 내부 텍스트 입력과 채우기 색상, 선 색상 및 굵기 조절이 가능합니다. 수식 개체는 한컴 수식 스크립트 문법(예: E = mc^2, {a+b} over c, sqrt{x^2 + y^2}, sum_{i=1}^{n} i)을 파싱하여 SVG로 선명하게 렌더링합니다. 차트 개체는 세로 막대, 가로 막대, 꺾은선, 원형 차트를 지원합니다.\n\n" +
          "3. 자동 페이지 넘김 및 다중 쪽 보기 테스트 영역\n" +
          "이 아래 영역은 문서가 A4 용지 1쪽 높이를 초과할 때 자동으로 2쪽, 3쪽으로 분할되는지 확인하기 위해 작성된 테스트 문단입니다.\n\n" +
          "[테스트 문단 01] 팀 프로젝트 협업 환경에서는 문서 작성 중 페이지 경계를 직관적으로 파악하는 것이 중요합니다. 본 편집기는 각 블록의 실측 높이와 상하 여백을 계산해 용지 높이를 넘는 순간 다음 페이지 시트를 자동으로 생성합니다.\n\n" +
          "[테스트 문단 02] 사용자가 문단 중간에서 엔터(Enter) 키를 눌러 새 문단을 추가하거나 긴 내용을 붙여넣어 페이지 경계를 넘어가더라도 입력 포커스와 커서(Caret) 위치가 끊기지 않고 다음 페이지로 자연스럽게 이어집니다.\n\n" +
          "[테스트 문단 03] [보기] 메뉴의 [쪽 모양]에서 '한 쪽', '두 쪽', '세 쪽' 보기를 전환하면 전체 페이지 시트가 선택한 열 수에 맞춰 나란히 정렬되며, 현재 화면 크기에 맞게 배율이 자동 조정됩니다.\n\n" +
          "[테스트 문단 04] 상단 메뉴의 '쪽 윤곽(Ctrl+G+L)'을 끄고 켜면 용지 외곽 테두리와 그림자, 그리고 본문 여백 모서리의 꺾쇠(자름표) 표시선이 함께 토글됩니다.\n\n" +
          "[테스트 문단 05] '표시/숨기기' 하위 메뉴에서 조판 부호, 문단 부호(↵), 투명 선을 제어할 수 있으며, '격자 보기'를 켜면 모든 페이지 시트 배경에 16px 간격의 모눈 격자가 표시됩니다.\n\n" +
          "[테스트 문단 06] '도구 상자' 하위 메뉴에서는 상단 기본 리본 툴바('기본')와 빠른 서식 툴바('서식')를 각각 숨기거나 다시 표시할 수 있어, 넓은 편집 공간이 필요할 때 유용합니다.\n\n" +
          "[테스트 문단 07] '문서 창' 하위 메뉴의 '눈금자'를 통해 가로 눈금자 표시 여부를 전환할 수 있으며, 편집 용지에서 용지 크기나 좌우 여백을 변경하면 눈금자 눈금도 즉시 반영됩니다.\n\n" +
          "[테스트 문단 08] 하단 상태 표시줄에서는 현재 커서가 위치한 쪽 번호와 전체 쪽 수(예: 1/3 쪽)가 실시간으로 갱신되며, 쪽 번호를 클릭하면 '찾아가기' 대화상자가 열립니다.\n\n" +
          "[테스트 문단 09] 이제 3페이지 이상으로 자연스럽게 넘어가는지 확인하기 위한 추가 본문입니다. 각 페이지 시트는 A4 기본 규격(210mm × 297mm)을 따르며, 용지 설정을 B5나 Letter, 가로 방향으로 변경하면 페이지 분할 기준 높이도 즉시 재계산됩니다.\n\n" +
          "[테스트 문단 10] 이미지나 표, 차트처럼 높이가 큰 개체가 페이지 하단 여유 공간보다 클 경우에는 다음 페이지의 첫 블록으로 자동 이동하여 개체가 페이지 경계에서 반으로 잘리지 않도록 보호합니다.\n\n" +
          "[테스트 문단 11] 또한 [쪽] 메뉴나 Ctrl+Enter로 강제 쪽 나누기(pageBreak)를 적용한 문단은 남은 여유 공간과 무관하게 항상 새 페이지의 시작 위치에 배치됩니다.\n\n" +
          "[테스트 문단 12] 본 샘플 문서는 페이지 넘김, 두 쪽 보기, 세 쪽 보기, 확대/축소, 찾기/찾아 바꾸기, 찾아가기 등 모든 보기·편집 시나리오를 한 번에 검증할 수 있도록 충분히 긴 분량으로 구성되었습니다.\n\n" +
          "4. 결론 및 향후 점검 사항\n" +
          "[테스트 문단 13] 한 쪽, 두 쪽, 세 쪽 보기 전환 시 모든 페이지가 화면 안에 잘림 없이 배치되는지 확인하세요.\n\n" +
          "[테스트 문단 14] 마지막 문단까지 입력 및 스크롤이 원활하게 동작하는지 확인한 뒤, 수정된 문서를 .hwpx 또는 .pdf로 내보내어 한컴 뷰어에서 동일하게 열리는지 검증할 수 있습니다.";

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
