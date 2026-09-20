import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "../context/ProjectContext";
import {
  addFileComment,
  createFilePin,
  deleteFilePin,
  listAllSyncPresence,
  listBranches,
  listFileComments,
  listFilePins,
  listFileVersions,
  listFiles,
  listPinCounts,
  listVersionCalendar,
  promoteVersion as promoteVersionApi,
  setFileTag,
  syncFiles,
  type ActivePresence,
  type FileBranches,
  type FileComment,
  type FileVersion,
  type FileVersionPin,
  type ProjectFile,
  type VersionCalendarEntry,
} from "../api/backend/files";
import { MAX_FILE_SIZE } from "../lib/folderSync";
import { classifyMajor } from "../api/backend/majors";
import FolderSync from "./FolderSync";

// 제품개발/frontend의 워크스페이스(ProjectWorkspacePage의 파일 로딩/승격 로직 + WorkspaceTab의
// 폴더/버전 트리/핀/태그/댓글/동시 동기화 표시 UI)를 이 앱의 화면 형식(페이지 하나 = 화면 하나,
// var(--token) 인라인 스타일)에 맞춰 그대로 이식. talju_hajima 원래의 로컬(ProjectContext) 파일
// 모델은 더 이상 쓰지 않고 실제 백엔드(api/backend/files.ts)와 직접 통신한다 — FolderSync.tsx와
// 동일한 방식.

const PRESENCE_POLL_MS = 3000;
const KEEP_FILE = ".keep";
const TAG_PALETTE = ["#3d52d5", "#f0a500", "#22c55e", "#8b5cf6", "#6b7280", "#2563eb", "#ef4444", "#06b6d4"];

interface TypeMeta {
  bg: string;
  color: string;
  label: string;
}

const TYPE_META: Record<string, TypeMeta> = {
  pdf: { bg: "#ef444418", color: "#ef4444", label: "PDF" },
  doc: { bg: "#3d52d518", color: "#3d52d5", label: "DOC" },
  docx: { bg: "#3d52d518", color: "#3d52d5", label: "DOC" },
  ppt: { bg: "#f0a50018", color: "#f0a500", label: "PPT" },
  pptx: { bg: "#f0a50018", color: "#f0a500", label: "PPT" },
  xls: { bg: "#22c55e18", color: "#22c55e", label: "XLS" },
  xlsx: { bg: "#22c55e18", color: "#22c55e", label: "XLS" },
  zip: { bg: "#8b5cf618", color: "#8b5cf6", label: "ZIP" },
  png: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  jpg: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  jpeg: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  gif: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  svg: { bg: "#06b6d418", color: "#06b6d4", label: "IMG" },
  md: { bg: "#2563eb18", color: "#2563eb", label: "MD" },
  ts: { bg: "#2563eb18", color: "#2563eb", label: "TS" },
  tsx: { bg: "#2563eb18", color: "#2563eb", label: "TSX" },
  js: { bg: "#f59e0b18", color: "#f59e0b", label: "JS" },
  json: { bg: "#6b728018", color: "#6b7280", label: "JSON" },
};
const DEFAULT_TYPE_META: TypeMeta = { bg: "#6b728018", color: "#6b7280", label: "FILE" };

function getTypeMeta(path: string): TypeMeta {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_META[ext] ?? DEFAULT_TYPE_META;
}

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function fileSize(content: string): number {
  return new Blob([content]).size;
}

function downloadFile(path: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || path;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function rootCoversPath(root: string, path: string): boolean {
  return root === "" || path === root || path.startsWith(`${root}/`);
}

interface DiffLine {
  type: "add" | "remove" | "same";
  text: string;
}

type DisplayDiffItem =
  | { kind: "line"; type: "add" | "remove"; text: string }
  | { kind: "change"; oldText: string; newText: string };

// 한 줄을 고쳐 쓴 경우, 줄 단위 diff는 그걸 표현할 방법이 없어서 항상 "그 줄 삭제 + 새 줄 추가"
// 두 개로 쪼개져 나온다(수정이라는 연산 자체가 없음). 화면에서 서로 이어진 remove 한 줄 +
// add 한 줄을 "그 줄이 이렇게 바뀜"으로 묶어 보여주면 실제로는 한 곳을 고친 건데 두 개의 별개
// 변경처럼 보이는 걸 줄일 수 있다.
function groupChangedLines(lines: DiffLine[]): DisplayDiffItem[] {
  const result: DisplayDiffItem[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (cur.type === "remove" && next?.type === "add") {
      result.push({ kind: "change", oldText: cur.text, newText: next.text });
      i += 2;
    } else {
      result.push({ kind: "line", type: cur.type as "add" | "remove", text: cur.text });
      i += 1;
    }
  }
  return result;
}

// 간단한 LCS 기반 라인 diff. 버전 미리보기에서 "수정 사항만" 보여주기 위한 용도라, 별도
// 라이브러리 없이 직접 구현 (파일이 커봤자 이 앱의 업로드 제한(10MB) 수준이라 O(n*m)로 충분).
// CRLF(\r\n)로 저장된 버전과 LF(\n)로 저장된 버전을 비교하면, "\n" 기준으로만 나눴을 때 CRLF
// 쪽 줄 끝에 보이지 않는 "\r"이 남아서 눈엔 똑같아 보이는 줄이 서로 다른 문자열로 비교된다 —
// 그 결과가 "삭제 후 내용이 똑같은 줄을 다시 추가"처럼 보이는 diff. 줄바꿈 문자를 통일해서 나눠
// 이 문제를 원천에서 막는다.
function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  // 파일이 개행으로 끝나면 split이 마지막에 빈 문자열 원소를 하나 더 만든다 — 한쪽 버전만
  // 파일 끝 개행 유무가 다르면(에디터가 저장할 때 자동으로 붙이거나 떼거나), 실제 내용은
  // 같은데 "빈 줄이 추가/삭제됨"처럼 보이는 원인이 된다. 그 인공적인 빈 원소 하나만 제거.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// 줄 diff와 (아래) 줄 안 단어 diff가 똑같은 LCS 로직을 쓰므로, 비교 대상 배열만 바꿔 끼울 수
// 있게 공통 코어로 뽑아둠.
function computeLcsDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "remove", text: a[i] });
      i++;
    } else {
      result.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "remove", text: a[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: "add", text: b[j] });
    j++;
  }
  return collapseNoOpPairs(result);
}

// LCS diff는 줄 내용이 중복될 때 종종 "지우고 똑같은 내용을 바로 다시 씀" 같은 잘못된 정렬을
// 만든다 — 실제로는 안 바뀐 줄인데 remove+add 쌍으로 나오는 것. 같은 변경 덩어리(remove들 뒤에
// add들이 이어지는 구간) 안에서 텍스트가 완전히 같은 remove/add를 찾아 서로 상쇄시켜서 진짜
// 바뀐 줄만 남긴다.
function collapseNoOpPairs(lines: DiffLine[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === "same") {
      result.push(lines[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].type !== "same") j++;
    const block = lines.slice(i, j);

    const removeIdxByText = new Map<string, number[]>();
    block.forEach((l, idx) => {
      if (l.type !== "remove") return;
      const arr = removeIdxByText.get(l.text) ?? [];
      arr.push(idx);
      removeIdxByText.set(l.text, arr);
    });

    const skip = new Set<number>();
    block.forEach((l, idx) => {
      if (l.type !== "add") return;
      const candidates = removeIdxByText.get(l.text);
      if (candidates && candidates.length > 0) {
        skip.add(candidates.shift()!);
        skip.add(idx);
      }
    });

    block.forEach((l, idx) => {
      if (!skip.has(idx)) result.push(l);
    });
    i = j;
  }
  return result;
}

function diffLines(oldText: string, newText: string): DiffLine[] {
  return computeLcsDiff(splitLines(oldText), splitLines(newText));
}

// 공백(연속 공백 포함)을 그대로 토큰으로 남겨서, 토큰을 이어붙이면 원래 줄이 그대로 복원되게
// 만든다 — 그래야 "단어 단위로만 비교하고 화면엔 원래 띄어쓰기 그대로 보여주기"가 가능함.
function tokenizeWords(line: string): string[] {
  return line.split(/(\s+)/).filter((t) => t !== "");
}

function diffWords(oldLine: string, newLine: string): DiffLine[] {
  return computeLcsDiff(tokenizeWords(oldLine), tokenizeWords(newLine));
}

// "페이지" 보기 — 분기 트리 대신, 한 번에 버전 하나만 "페이지"처럼 보여주고 이전/다음 버튼으로
// 넘긴다. 어느 분기인지는 무시하고 오직 저장된 시각 순서로만 넘어간다(공학 전공이 아닌 팀원
// 기본값 — Workspace()의 viewMode 토글 참고). 시작 페이지는 항상 "현재 버전".
function VersionPageFlip({
  versions,
  currentVersionId,
  memberNameById,
  onPromote,
  onShowFull,
}: {
  versions: FileVersion[];
  currentVersionId: string | null;
  memberNameById: Map<string, string>;
  onPromote: (versionId: string) => void;
  onShowFull: (version: FileVersion) => void;
}) {
  const chronological = useMemo(
    () => [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [versions],
  );
  const currentIndex = Math.max(
    0,
    chronological.findIndex((v) => v.id === currentVersionId),
  );
  const [pageIndex, setPageIndex] = useState(currentIndex);
  const [expanded, setExpanded] = useState(true);

  // 파일을 바꿔 고르거나(선택된 버전 목록 자체가 바뀜) 새로고침되면, 다시 "현재 버전" 페이지로.
  useEffect(() => {
    setPageIndex(currentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVersionId, versions.length]);

  const version = chronological[pageIndex];
  if (!version) {
    return <div className="text-xs text-center py-6" style={{ color: "var(--muted-foreground)" }}>버전이 없어요.</div>;
  }
  const prev = pageIndex > 0 ? chronological[pageIndex - 1] : null;
  const isCurrent = version.id === currentVersionId;
  const changes = groupChangedLines(diffLines(prev?.content ?? "", version.content).filter((l) => l.type !== "same"));

  return (
    <div>
      <div
        className="p-3 mb-2"
        style={{ borderRadius: "10px", background: isCurrent ? "var(--primary)" : "var(--muted)", color: isCurrent ? "#fff" : "var(--foreground)" }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-700 truncate">{memberNameById.get(version.authorId) ?? version.authorId}</span>
            <span className="text-xs shrink-0" style={{ color: isCurrent ? "rgba(255,255,255,0.75)" : "var(--muted-foreground)" }}>
              {formatDate(version.createdAt)}
            </span>
          </div>
          {isCurrent && (
            <span className="text-xs px-1.5 py-0.5 font-600 shrink-0" style={{ borderRadius: "4px", background: "rgba(255,255,255,0.25)" }}>
              지금 쓰는 내용
            </span>
          )}
        </div>
        {version.note && (
          <div className="text-xs italic mb-1.5" style={{ color: isCurrent ? "rgba(255,255,255,0.85)" : "var(--muted-foreground)" }}>
            "{version.note}"
          </div>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-600 mb-1.5"
          style={{ color: isCurrent ? "#fff" : "var(--primary)" }}
        >
          {!prev ? "맨 처음 저장한 내용" : changes.length === 0 ? "달라진 내용 없음" : `${changes.length}군데 수정됨`} {expanded ? "▲" : "▼"}
        </button>
        {expanded && (
          <div
            className="text-xs whitespace-pre-wrap p-2 mb-2 max-h-40 overflow-y-auto"
            style={{ borderRadius: "8px", background: isCurrent ? "rgba(255,255,255,0.15)" : "var(--card)", fontFamily: "var(--font-jetbrains)" }}
          >
            {!prev ? (
              <span style={{ opacity: 0.7 }}>새로 만들어진 내용이라 비교할 이전 버전이 없어요.</span>
            ) : changes.length === 0 ? (
              <span style={{ opacity: 0.7 }}>이전 저장과 내용이 같아요.</span>
            ) : (
              changes.map((item, i) =>
                item.kind === "change" ? (
                  <div key={i} className="mb-1">
                    <div style={{ color: isCurrent ? "#fecaca" : "#dc2626", textDecoration: "line-through", opacity: 0.85 }}>
                      {item.oldText || " "}
                    </div>
                    <div style={{ color: isCurrent ? "#bbf7d0" : "#16a34a" }}>{item.newText || " "}</div>
                  </div>
                ) : (
                  <div key={i} style={{ color: item.type === "add" ? (isCurrent ? "#bbf7d0" : "#16a34a") : isCurrent ? "#fecaca" : "#dc2626" }}>
                    {item.type === "add" ? "+ " : "- "}
                    {item.text || " "}
                  </div>
                ),
              )
            )}
          </div>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={() => onShowFull(version)}
            className="flex-1 text-xs font-600 py-1.5"
            style={{ borderRadius: "20px", background: isCurrent ? "rgba(255,255,255,0.2)" : "var(--card)", color: isCurrent ? "#fff" : "var(--foreground)" }}
          >
            전체 내용 보기
          </button>
          {!isCurrent && (
            <button
              onClick={() => onPromote(version.id)}
              className="flex-1 text-xs font-700 py-1.5"
              style={{ borderRadius: "20px", color: "#fff", background: "var(--primary)" }}
            >
              이 버전으로 되돌리기
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
          disabled={pageIndex === 0}
          className="text-xs font-700 px-3 py-1.5"
          style={{ borderRadius: "20px", background: "var(--muted)", color: pageIndex === 0 ? "var(--muted-foreground)" : "var(--foreground)", opacity: pageIndex === 0 ? 0.5 : 1 }}
        >
          ← 이전 페이지
        </button>
        <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          {pageIndex + 1} / {chronological.length}
        </span>
        <button
          onClick={() => setPageIndex((i) => Math.min(chronological.length - 1, i + 1))}
          disabled={pageIndex === chronological.length - 1}
          className="text-xs font-700 px-3 py-1.5"
          style={{ borderRadius: "20px", background: "var(--muted)", color: pageIndex === chronological.length - 1 ? "var(--muted-foreground)" : "var(--foreground)", opacity: pageIndex === chronological.length - 1 ? 0.5 : 1 }}
        >
          다음 페이지 →
        </button>
      </div>
    </div>
  );
}

const CAL_WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function calToDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calBuildMonthGrid(monthDate: Date): Date[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

// "새 버전 업로드" 버튼 옆의 달력 — 기본은 지금 선택된 파일 기준으로 언제 올라왔는지만 보여주고,
// "전체 보기"를 누르면 프로젝트 전체 파일의 업로드 이력으로 바뀐다(그 날 올라온 파일 이름들이
// 쭉 나열됨 — 파일이 여러 개일 때 의미가 생김). 날짜를 누른 파일을 클릭하면 그 파일로 이동.
function VersionCalendarModal({
  projectId,
  currentFileId,
  currentFileName,
  memberNameById,
  onClose,
  onSelectFile,
}: {
  projectId: string;
  currentFileId: string;
  currentFileName: string;
  memberNameById: Map<string, string>;
  onClose: () => void;
  onSelectFile: (fileId: string) => void;
}) {
  const [scope, setScope] = useState<"file" | "all">("file");
  const [entries, setEntries] = useState<VersionCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listVersionCalendar(projectId, scope === "file" ? currentFileId : undefined)
      .then(({ data }) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [projectId, scope, currentFileId]);

  const entriesByDay = useMemo(() => {
    const m = new Map<string, VersionCalendarEntry[]>();
    for (const e of entries) {
      const key = e.createdAt.slice(0, 10);
      const list = m.get(key) ?? [];
      list.push(e);
      m.set(key, list);
    }
    return m;
  }, [entries]);

  const monthGrid = useMemo(() => calBuildMonthGrid(monthDate), [monthDate]);
  const todayKey = calToDateKey(new Date());
  const dayEntries = selectedDate ? (entriesByDay.get(selectedDate) ?? []) : [];

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(15,23,42,0.45)" }} onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="text-sm font-700">업로드 달력</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {scope === "file" ? currentFileName : "워크스페이스 전체"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScope((s) => (s === "file" ? "all" : "file"))}
              className="text-xs font-600 px-3 py-1.5"
              style={{ background: "var(--muted)", color: scope === "all" ? "var(--primary)" : "var(--foreground)", borderRadius: "20px" }}
            >
              {scope === "file" ? "전체 보기" : "이 파일만"}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-lg"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setMonthDate((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="w-7 h-7 flex items-center justify-center text-sm font-700"
              style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "50%" }}
            >
              ‹
            </button>
            <div className="text-sm font-700">{monthDate.getFullYear()}년 {monthDate.getMonth() + 1}월</div>
            <button
              onClick={() => setMonthDate((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="w-7 h-7 flex items-center justify-center text-sm font-700"
              style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "50%" }}
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 mb-1">
            {CAL_WEEKDAY_LABELS.map((w) => (
              <div key={w} className="text-xs font-600 text-center py-1" style={{ color: "var(--muted-foreground)" }}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 mb-4">
            {monthGrid.map((d) => {
              const key = calToDateKey(d);
              const inMonth = d.getMonth() === monthDate.getMonth();
              const count = entriesByDay.get(key)?.length ?? 0;
              const isSelected = key === selectedDate;
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(isSelected ? null : key)}
                  disabled={count === 0}
                  className="flex flex-col items-center justify-center py-1.5 transition-all"
                  style={{
                    borderRadius: "8px",
                    background: isSelected ? "var(--primary)" : isToday ? "var(--secondary)" : "transparent",
                    opacity: inMonth ? 1 : 0.3,
                    cursor: count > 0 ? "pointer" : "default",
                  }}
                >
                  <span className="text-xs font-600" style={{ color: isSelected ? "#fff" : "var(--foreground)" }}>{d.getDate()}</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-0.5"
                    style={{ background: count > 0 ? (isSelected ? "#fff" : "var(--primary)") : "transparent" }}
                  />
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>불러오는 중...</div>
          ) : selectedDate ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>{selectedDate}에 올라온 파일</div>
              {dayEntries.length === 0 ? (
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>이 날엔 업로드가 없어요.</div>
              ) : (
                dayEntries.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => { if (scope === "all") onSelectFile(e.fileId); }}
                    className="flex items-center justify-between gap-2 p-2.5 text-left"
                    style={{ background: "var(--muted)", borderRadius: "10px", cursor: scope === "all" ? "pointer" : "default" }}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-700 truncate">{e.path.split("/").pop()}</div>
                      <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                        {memberNameById.get(e.authorId) ?? "알 수 없음"} · {new Date(e.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>점이 있는 날짜를 눌러보세요.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// 버전 트리 한 노드 + 그 자식들을 재귀적으로 그림 (index.css의 .version-tree가 <li>/<ul> 중첩을
// 보고 위쪽 가로/세로 연결선을 그려서 나뭇가지처럼 보이게 함). 카드를 클릭하면 그 버전이 "포커스"가
// 되어 메모/내용/버튼이 펼쳐지고, 조상·바로 아래 분기만 밝게, 나머지는 흐리게 표시된다.
function VersionNode({
  version,
  childrenByParent,
  currentVersionId,
  openBranchIds,
  pinsByVersion,
  memberNameById,
  focusedVersionId,
  highlightIds,
  versionsById,
  onFocus,
  onPromote,
  onCreatePin,
  onUploadToPin,
  onShowFull,
}: {
  version: FileVersion;
  childrenByParent: Map<string | null, FileVersion[]>;
  currentVersionId: string | null;
  openBranchIds: Set<string>;
  pinsByVersion: Map<string, FileVersionPin[]>;
  memberNameById: Map<string, string>;
  focusedVersionId: string | null;
  highlightIds: Set<string>;
  versionsById: Map<string, FileVersion>;
  onFocus: (versionId: string) => void;
  onPromote: (versionId: string) => void;
  onCreatePin: (versionId: string) => void;
  onUploadToPin: (pinId: string) => void;
  onShowFull: (version: FileVersion) => void;
}) {
  const isCurrent = version.id === currentVersionId;
  const isOpenBranch = openBranchIds.has(version.id);
  const pinsHere = pinsByVersion.get(version.id) ?? [];
  const expanded = version.id === focusedVersionId;
  const isDimmed = highlightIds.size > 0 && !highlightIds.has(version.id);
  const children = childrenByParent.get(version.id) ?? [];
  const cardRef = useRef<HTMLDivElement>(null);
  const parentVersion = version.parentVersionId ? versionsById.get(version.parentVersionId) : null;
  // parentVersion이 없으면(맨 첫 버전) 비교 대상이 없으니 전체를 추가된 내용으로 취급.
  const changedLines = expanded
    ? diffLines(parentVersion?.content ?? "", version.content).filter((l) => l.type !== "same")
    : [];
  const displayChanges = groupChangedLines(changedLines);

  useEffect(() => {
    if (expanded) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [expanded]);

  return (
    <li>
      <div
        ref={cardRef}
        className="text-left transition-opacity"
        style={{
          width: expanded ? 220 : "auto",
          background: isCurrent ? "var(--primary)" : "var(--card)",
          boxShadow: "var(--shadow-card)",
          borderRadius: "10px",
          border: isOpenBranch && !isCurrent ? "1px solid #ef4444" : "1px solid transparent",
          opacity: isDimmed ? 0.35 : 1,
        }}
      >
        <button onClick={() => onFocus(version.id)} className="w-full flex flex-col gap-1 text-left px-3 py-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-700 truncate" style={{ color: isCurrent ? "#fff" : "var(--foreground)" }}>
              {memberNameById.get(version.authorId) ?? version.authorId}
            </span>
            {isCurrent && (
              <span className="text-xs px-1.5 py-0.5 font-600 shrink-0" style={{ borderRadius: "4px", background: "rgba(255,255,255,0.25)", color: "#fff" }}>
                현재
              </span>
            )}
            {isOpenBranch && !isCurrent && (
              <span className="text-xs px-1.5 py-0.5 font-600 shrink-0" style={{ borderRadius: "4px", background: "#ef444418", color: "#ef4444" }}>
                분기
              </span>
            )}
            {pinsHere.map((p) => (
              <span key={p.id} className="text-xs px-1.5 py-0.5 font-600 shrink-0" style={{ borderRadius: "4px", background: "#8b5cf618", color: "#8b5cf6" }}>
                📌 {p.label}
              </span>
            ))}
          </div>
          <span className="text-xs" style={{ color: isCurrent ? "rgba(255,255,255,0.75)" : "var(--muted-foreground)" }}>
            {formatDate(version.createdAt)}
          </span>
        </button>
        {expanded && (
          <div className="px-3 pb-3">
            {version.note && (
              <div className="text-xs italic mb-1.5" style={{ color: isCurrent ? "rgba(255,255,255,0.85)" : "var(--muted-foreground)" }}>
                "{version.note}"
              </div>
            )}
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-600" style={{ color: isCurrent ? "rgba(255,255,255,0.75)" : "var(--muted-foreground)" }}>
                수정 사항 {displayChanges.length > 0 ? `(${displayChanges.length}곳)` : ""}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowFull(version);
                }}
                className="w-5 h-5 flex items-center justify-center text-xs font-700 shrink-0"
                style={{
                  borderRadius: "6px",
                  background: isCurrent ? "rgba(255,255,255,0.2)" : "var(--card)",
                  color: isCurrent ? "#fff" : "var(--primary)",
                  border: isCurrent ? "none" : "1px solid var(--border)",
                }}
                title="전문 보기"
              >
                +
              </button>
            </div>
            <div
              className="text-xs whitespace-pre-wrap p-2 max-h-28 overflow-y-auto text-left"
              style={{ borderRadius: "8px", background: isCurrent ? "rgba(255,255,255,0.15)" : "var(--muted)", color: isCurrent ? "#fff" : "var(--foreground)", fontFamily: "var(--font-jetbrains)" }}
            >
              {displayChanges.length === 0 ? (
                <span style={{ opacity: 0.7 }}>{parentVersion ? "이전 버전과 내용이 같아요." : "수정 이력이 없는 첫 버전이에요."}</span>
              ) : (
                displayChanges.map((item, i) =>
                  item.kind === "change" ? (
                    (() => {
                      const words = diffWords(item.oldText, item.newText);
                      return (
                        <div key={i} className="mb-1">
                          <div style={{ color: isCurrent ? "rgba(255,255,255,0.75)" : "var(--foreground)", opacity: 0.85 }}>
                            -{" "}
                            {words
                              .filter((w) => w.type !== "add")
                              .map((w, wi) =>
                                w.type === "remove" ? (
                                  <span key={wi} style={{ background: isCurrent ? "rgba(239,68,68,0.35)" : "#fecaca", color: isCurrent ? "#fff" : "#991b1b", textDecoration: "line-through" }}>
                                    {w.text}
                                  </span>
                                ) : (
                                  <span key={wi}>{w.text}</span>
                                ),
                              )}
                          </div>
                          <div style={{ color: isCurrent ? "#fff" : "var(--foreground)" }}>
                            +{" "}
                            {words
                              .filter((w) => w.type !== "remove")
                              .map((w, wi) =>
                                w.type === "add" ? (
                                  <span key={wi} style={{ background: isCurrent ? "rgba(34,197,94,0.35)" : "#bbf7d0", color: isCurrent ? "#fff" : "#166534" }}>
                                    {w.text}
                                  </span>
                                ) : (
                                  <span key={wi}>{w.text}</span>
                                ),
                              )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div
                      key={i}
                      style={{ color: item.type === "add" ? (isCurrent ? "#bbf7d0" : "#16a34a") : isCurrent ? "#fecaca" : "#dc2626" }}
                    >
                      {item.type === "add" ? "+ " : "- "}
                      {item.text || " "}
                    </div>
                  ),
                )
              )}
            </div>
            {!isCurrent && (
              <button
                onClick={() => onPromote(version.id)}
                className="w-full text-xs font-700 px-3 py-1.5 mt-2"
                style={{ borderRadius: "20px", color: "#fff", background: "var(--primary)" }}
              >
                이 버전을 현재로 지정
              </button>
            )}
            {pinsHere.length > 0 ? (
              <button
                onClick={() => onUploadToPin(pinsHere[0].id)}
                className="w-full text-xs font-700 px-3 py-1.5 mt-1.5"
                style={{ borderRadius: "20px", border: "2px solid #8b5cf6", color: isCurrent ? "#fff" : "#8b5cf6", background: "transparent" }}
              >
                📌 {pinsHere[0].label}로 새 버전 업로드
              </button>
            ) : (
              <button
                onClick={() => onCreatePin(version.id)}
                className="w-full text-xs font-600 px-3 py-1.5 mt-1.5"
                style={{
                  borderRadius: "20px",
                  border: `1px solid ${isCurrent ? "rgba(255,255,255,0.5)" : "var(--border)"}`,
                  color: isCurrent ? "#fff" : "var(--muted-foreground)",
                  background: "transparent",
                }}
              >
                📌 이 버전에 핀 꽂기
              </button>
            )}
          </div>
        )}
      </div>
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <VersionNode
              key={c.id}
              version={c}
              childrenByParent={childrenByParent}
              currentVersionId={currentVersionId}
              openBranchIds={openBranchIds}
              pinsByVersion={pinsByVersion}
              memberNameById={memberNameById}
              focusedVersionId={focusedVersionId}
              highlightIds={highlightIds}
              versionsById={versionsById}
              onFocus={onFocus}
              onPromote={onPromote}
              onCreatePin={onCreatePin}
              onUploadToPin={onUploadToPin}
              onShowFull={onShowFull}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Workspace() {
  const { project, team, currentMember } = useProject();
  const memberNameById = useMemo(
    () => new Map(team.members.filter((m): m is typeof m & { userId: string } => m.userId !== null).map((m) => [m.userId, m.name])),
    [team.members],
  );

  // 버전 이력을 "공학자"(분기 트리) 또는 "쉬운 보기"(순서대로 나열)로 보는지 — 로컬에 저장해둔
  // 사용자의 선택이 있으면 그걸 쓰고, 없으면 전공(odcloud 표준분류대계열) 기반으로 기본값을
  // 한 번 추정한다. 판단 불가/미확인 상태에서는 더 쉬운 쪽을 기본값으로 둔다.
  const [viewMode, setViewMode] = useState<"engineer" | "simple">(() => {
    try {
      const saved = localStorage.getItem("workspace-version-view-mode");
      if (saved === "engineer" || saved === "simple") return saved;
    } catch {
      // localStorage 접근 불가(프라이빗 창 등) — 기본값으로 계속 진행
    }
    return "simple";
  });
  const [viewModeChosen, setViewModeChosen] = useState(() => {
    try {
      return localStorage.getItem("workspace-version-view-mode") !== null;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (viewModeChosen || !currentMember?.school || !currentMember?.major) return;
    classifyMajor(currentMember.school, currentMember.major)
      .then((engineering) => {
        if (engineering === true) setViewMode("engineer");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMember?.school, currentMember?.major, viewModeChosen]);

  function chooseViewMode(mode: "engineer" | "simple") {
    setViewMode(mode);
    setViewModeChosen(true);
    try {
      localStorage.setItem("workspace-version-view-mode", mode);
    } catch {
      // 저장 실패해도 이번 세션 안에서는 정상 동작 — 그냥 다음 방문 때 다시 추정하게 됨
    }
  }

  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [branches, setBranches] = useState<FileBranches[]>([]);
  const [pinCounts, setPinCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [currentDir, setCurrentDir] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"versions" | "comments">("versions");
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [comments, setComments] = useState<FileComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editingTagFileId, setEditingTagFileId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [uploadingNewVersion, setUploadingNewVersion] = useState(false);
  const [activePresence, setActivePresence] = useState<ActivePresence[]>([]);
  const [pins, setPins] = useState<FileVersionPin[]>([]);
  const [focusedVersionId, setFocusedVersionId] = useState<string | null>(null);
  const [fullTextVersion, setFullTextVersion] = useState<FileVersion | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const uploadTargetPinIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newVersionInputRef = useRef<HTMLInputElement>(null);

  async function refresh(): Promise<ProjectFile[]> {
    const [filesRes, branchesRes, pinCountsRes] = await Promise.all([listFiles(project.id), listBranches(project.id), listPinCounts(project.id)]);
    setFiles(filesRes.data);
    setBranches(branchesRes.data);
    setPinCounts(new Map(pinCountsRes.data.map((p) => [p.fileId, p.count])));
    return filesRes.data;
  }

  useEffect(() => {
    setCurrentDir(null);
    setSelectedFileId(null);
    setTagFilter(null);
    setCreatingFolder(false);
    refresh().catch(() => setError("워크스페이스 정보를 불러오지 못했습니다."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { data } = await listAllSyncPresence(project.id);
        if (!cancelled) setActivePresence(data.active);
      } catch {
        if (!cancelled) setActivePresence([]);
      }
    }
    poll();
    const timer = setInterval(poll, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [project.id]);

  function isFileSyncing(path: string): boolean {
    return activePresence.some((p) => rootCoversPath(p.root, path));
  }

  const branchIdsByFile = new Map(branches.map((b) => [b.file.id, new Set(b.branches.map((v) => v.id))]));
  const openBranchCount = branches.reduce((sum, b) => sum + b.branches.length, 0);
  const knownTags = Array.from(new Set(files.map((f) => f.tag).filter((t): t is string => !!t))).sort();

  const prefix = currentDir ? `${currentDir}/` : "";
  const subfolders = new Set<string>();
  const directFilesAll: ProjectFile[] = [];
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      if (rest !== KEEP_FILE) directFilesAll.push(f);
    } else {
      subfolders.add(rest.slice(0, slash));
    }
  }
  directFilesAll.sort((a, b) => a.path.localeCompare(b.path));
  const directFiles = tagFilter ? directFilesAll.filter((f) => f.tag === tagFilter) : directFilesAll;
  const folderNames = Array.from(subfolders).sort();
  const breadcrumbParts = currentDir ? currentDir.split("/") : [];

  function countRealFilesUnder(folderPath: string): number {
    const p = `${folderPath}/`;
    return files.filter((f) => f.path.startsWith(p) && f.path.split("/").pop() !== KEEP_FILE).length;
  }

  function openFolder(name: string) {
    setCurrentDir(currentDir ? `${currentDir}/${name}` : name);
    setSelectedFileId(null);
    setTagFilter(null);
  }

  function goToBreadcrumb(index: number) {
    setCurrentDir(index < 0 ? null : breadcrumbParts.slice(0, index + 1).join("/"));
    setSelectedFileId(null);
    setTagFilter(null);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setUploadError(null);
    try {
      const path = currentDir ? `${currentDir}/${name}/${KEEP_FILE}` : `${name}/${KEEP_FILE}`;
      await syncFiles(project.id, [{ path, content: "" }]);
      setNewFolderName("");
      setCreatingFolder(false);
      await refresh();
    } catch {
      setUploadError("폴더 생성에 실패했습니다.");
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      const note = uploadNote.trim() || undefined;
      const entries: { path: string; content: string; baseVersionId?: string; note?: string }[] = [];
      for (const file of Array.from(fileList)) {
        if (file.size > MAX_FILE_SIZE) {
          setUploadError(`${file.name}은(는) 용량 제한(10MB)을 초과해 업로드할 수 없습니다.`);
          continue;
        }
        let content: string;
        try {
          content = await file.text();
        } catch {
          setUploadError(`${file.name}을(를) 텍스트로 읽을 수 없습니다 (바이너리 파일은 지원하지 않습니다).`);
          continue;
        }
        const path = currentDir ? `${currentDir}/${file.name}` : file.name;
        const existing = files.find((f) => f.path === path);
        entries.push({ path, content, baseVersionId: existing?.currentVersionId ?? undefined, note });
      }
      if (entries.length > 0) {
        await syncFiles(project.id, entries);
        setUploadNote("");
        await refresh();
      }
    } catch {
      setUploadError("파일 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadNewVersion(fileList: FileList | null) {
    if (!selectedFile || !fileList || fileList.length === 0) return;
    const file = fileList[0];
    const pinId = uploadTargetPinIdRef.current;
    uploadTargetPinIdRef.current = null;
    setUploadError(null);
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`${file.name}은(는) 용량 제한(10MB)을 초과해 업로드할 수 없습니다.`);
      return;
    }
    setUploadingNewVersion(true);
    try {
      let content: string;
      try {
        content = await file.text();
      } catch {
        setUploadError(`${file.name}을(를) 텍스트로 읽을 수 없습니다 (바이너리 파일은 지원하지 않습니다).`);
        return;
      }
      const baseVersionId = pinId ? pins.find((p) => p.id === pinId)?.versionId : (selectedFile.currentVersionId ?? undefined);
      await syncFiles(project.id, [
        { path: selectedFile.path, content, baseVersionId, note: uploadNote.trim() || undefined, pinId: pinId ?? undefined },
      ]);
      setUploadNote("");
      await refresh();
      await refreshVersionsAndPins();
    } catch {
      setUploadError("새 버전 업로드에 실패했습니다.");
    } finally {
      setUploadingNewVersion(false);
    }
  }

  async function handleSaveTag(fileId: string) {
    try {
      await setFileTag(project.id, fileId, tagDraft.trim());
      setEditingTagFileId(null);
      await refresh();
    } catch {
      setUploadError("태그 저장에 실패했습니다.");
    }
  }

  useEffect(() => {
    setFocusedVersionId(null);
    setFullTextVersion(null);
    if (!selectedFileId) {
      setVersions([]);
      setComments([]);
      setPins([]);
      return;
    }
    let cancelled = false;
    setLoadingVersions(true);
    Promise.all([
      listFileVersions(project.id, selectedFileId),
      listFileComments(project.id, selectedFileId),
      listFilePins(project.id, selectedFileId),
    ])
      .then(([versionsRes, commentsRes, pinsRes]) => {
        if (cancelled) return;
        setVersions(versionsRes.data);
        setComments(commentsRes.data);
        setPins(pinsRes.data);
      })
      .catch(() => {
        if (!cancelled) {
          setVersions([]);
          setComments([]);
          setPins([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, selectedFileId]);

  async function refreshVersionsAndPins() {
    if (!selectedFileId) return;
    const [versionsRes, pinsRes] = await Promise.all([
      listFileVersions(project.id, selectedFileId),
      listFilePins(project.id, selectedFileId),
    ]);
    setVersions(versionsRes.data);
    setPins(pinsRes.data);
  }

  async function handlePromote(fileId: string, versionId: string) {
    setError(null);
    try {
      await promoteVersionApi(project.id, fileId, versionId);
      await refresh();
    } catch {
      setError("버전 지정에 실패했습니다.");
    }
  }

  async function refreshPinCounts() {
    const { data } = await listPinCounts(project.id);
    setPinCounts(new Map(data.map((p) => [p.fileId, p.count])));
  }

  async function handleCreatePin(versionId: string) {
    if (!selectedFileId) return;
    try {
      await createFilePin(project.id, selectedFileId, versionId);
      await Promise.all([refreshVersionsAndPins(), refreshPinCounts()]);
    } catch {
      setUploadError("핀 생성에 실패했습니다.");
    }
  }

  async function handleDeletePin(pinId: string) {
    if (!selectedFileId) return;
    try {
      await deleteFilePin(project.id, selectedFileId, pinId);
      await Promise.all([refreshVersionsAndPins(), refreshPinCounts()]);
    } catch {
      setUploadError("핀 삭제에 실패했습니다.");
    }
  }

  function handleUploadToPin(pinId: string) {
    uploadTargetPinIdRef.current = pinId;
    newVersionInputRef.current?.click();
  }

  async function handleAddComment() {
    if (!selectedFileId || !commentDraft.trim()) return;
    try {
      await addFileComment(project.id, selectedFileId, commentDraft.trim());
      setCommentDraft("");
      const { data } = await listFileComments(project.id, selectedFileId);
      setComments(data);
    } catch {
      setUploadError("댓글 등록에 실패했습니다.");
    }
  }

  const selectedFile = selectedFileId ? (files.find((f) => f.id === selectedFileId) ?? null) : null;
  const openBranchIds = selectedFileId ? (branchIdsByFile.get(selectedFileId) ?? new Set<string>()) : new Set<string>();

  const versionChildrenByParent = new Map<string | null, FileVersion[]>();
  for (const v of versions) {
    const list = versionChildrenByParent.get(v.parentVersionId) ?? [];
    list.push(v);
    versionChildrenByParent.set(v.parentVersionId, list);
  }
  for (const list of versionChildrenByParent.values()) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rootVersions = versionChildrenByParent.get(null) ?? [];

  const pinsByVersion = new Map<string, FileVersionPin[]>();
  for (const p of pins) {
    const list = pinsByVersion.get(p.versionId) ?? [];
    list.push(p);
    pinsByVersion.set(p.versionId, list);
  }

  const effectiveFocusId = focusedVersionId ?? selectedFile?.currentVersionId ?? null;
  const versionsById = new Map(versions.map((v) => [v.id, v]));
  const highlightIds = new Set<string>();
  if (effectiveFocusId) {
    let cur: string | null = effectiveFocusId;
    while (cur) {
      highlightIds.add(cur);
      cur = versionsById.get(cur)?.parentVersionId ?? null;
    }
    for (const child of versionChildrenByParent.get(effectiveFocusId) ?? []) highlightIds.add(child.id);
  }

  const allVisibleSelected = directFiles.length > 0 && directFiles.every((f) => selectedPaths.has(f.path));

  function toggleFile(path: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const f of directFiles) {
        if (allVisibleSelected) next.delete(f.path);
        else next.add(f.path);
      }
      return next;
    });
  }

  function handleDownloadSelected() {
    for (const f of files) {
      if (selectedPaths.has(f.path)) downloadFile(f.path, f.content);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-7">
        <div className="text-xs font-600 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          파일 워크스페이스 · {project.name}
        </div>
        <h1 className="text-3xl font-600" style={{ fontFamily: "var(--font-fraunces)" }}>Workspace</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
          파일 {files.length}개 · 해소되지 않은 분기 {openBranchCount}건
        </p>
      </div>

      {error && (
        <div className="text-sm mb-4 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "var(--radius-sm)" }}>
          {error}
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm flex-wrap">
        <button onClick={() => goToBreadcrumb(-1)} className="font-700" style={{ color: currentDir ? "var(--primary)" : "var(--foreground)" }}>
          ⬡ 워크스페이스
        </button>
        {breadcrumbParts.map((part, i) => (
          <span key={i} className="flex items-center gap-2">
            <span style={{ color: "var(--muted-foreground)" }}>/</span>
            <button onClick={() => goToBreadcrumb(i)} className="font-700" style={{ color: i === breadcrumbParts.length - 1 ? "var(--foreground)" : "var(--primary)" }}>
              {part}
            </button>
          </span>
        ))}
      </div>

      <FolderSync />

      {/* 업로드 존 */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void uploadFiles(e.dataTransfer.files);
        }}
        className="mb-3 border-2 border-dashed p-5 text-center transition-all cursor-pointer"
        style={{ borderColor: dragOver ? "var(--primary)" : "var(--border)", background: dragOver ? "var(--secondary)" : "var(--card)", borderRadius: "var(--radius)" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="text-2xl mb-2">⬆</div>
        <div className="text-sm font-600">
          {uploading ? "업로드 중..." : `${currentDir ? `"${currentDir}"에 업로드` : "워크스페이스 루트에 업로드"} — 드래그하거나 클릭`}
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>텍스트 기반 파일(코드, 문서 등), 파일당 최대 10MB</div>
      </div>
      <input
        value={uploadNote}
        onChange={(e) => setUploadNote(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder="업로드 메모 (버전 노트, 선택)..."
        className="w-full text-sm px-3.5 py-2.5 outline-none mb-6"
        style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)" }}
      />
      {uploadError && <p className="text-xs mb-4" style={{ color: "#ef4444" }}>{uploadError}</p>}

      {/* 하위 폴더 그리드 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-700">폴더</h2>
          {!creatingFolder && (
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
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              placeholder="폴더 이름"
              className="flex-1 text-sm px-3 py-2 outline-none"
              style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--muted)" }}
            />
            <button onClick={handleCreateFolder} className="text-xs font-700 px-4 py-2" style={{ borderRadius: "var(--radius-sm)", color: "#fff", background: "var(--primary)" }}>
              만들기
            </button>
            <button
              onClick={() => {
                setCreatingFolder(false);
                setNewFolderName("");
              }}
              className="text-xs font-600 px-3 py-2"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "var(--radius-sm)" }}
            >
              취소
            </button>
          </div>
        )}

        {folderNames.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {folderNames.map((name) => (
              <button
                key={name}
                onClick={() => openFolder(name)}
                className="flex items-center gap-3 p-4 text-left transition-all"
                style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
              >
                <div className="w-10 h-10 flex items-center justify-center text-lg shrink-0" style={{ background: "var(--secondary)", borderRadius: "10px" }}>📁</div>
                <div className="min-w-0">
                  <div className="text-sm font-700 truncate">{name}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    파일 {countRealFilesUnder(currentDir ? `${currentDir}/${name}` : name)}개
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 태그 필터 */}
      {knownTags.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setTagFilter(null)}
            className="text-xs font-600 px-3 py-1.5"
            style={{ borderRadius: "20px", background: tagFilter === null ? "var(--primary)" : "var(--muted)", color: tagFilter === null ? "#fff" : "var(--muted-foreground)" }}
          >
            전체
          </button>
          {knownTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className="text-xs font-600 px-3 py-1.5"
              style={{ borderRadius: "20px", background: tagFilter === t ? tagColor(t) : `${tagColor(t)}18`, color: tagFilter === t ? "#fff" : tagColor(t) }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* 파일 목록 툴바 */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-sm font-700">파일{currentDir ? ` — ${currentDir}` : ""}</h2>
        {!selectedFile && (
          <div className="flex items-center gap-2.5">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={directFiles.length === 0} />
              전체 선택
            </label>
            <button
              onClick={handleDownloadSelected}
              disabled={selectedPaths.size === 0}
              className="text-xs font-700 px-3 py-1.5"
              style={{ borderRadius: "20px", color: "#fff", background: "var(--primary)", opacity: selectedPaths.size === 0 ? 0.4 : 1 }}
            >
              다운로드 ({selectedPaths.size})
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* 파일 목록 */}
        <div className={`${selectedFile ? "lg:col-span-2" : "lg:col-span-3"} flex flex-col gap-2`}>
          {directFiles.map((f) => {
            const meta = getTypeMeta(f.path);
            const isSelected = selectedFileId === f.id;
            const fileBranchCount = branchIdsByFile.get(f.id)?.size ?? 0;
            const name = f.path.slice(prefix.length);
            const uploaderName = memberNameById.get(f.lastEditorId ?? "") ?? "알 수 없음";
            const compact = !!selectedFile;
            return (
              <div
                key={f.id}
                className={`flex items-center gap-3 transition-all ${compact ? "p-2.5" : "p-4"}`}
                style={{ background: isSelected ? "var(--primary)" : "var(--card)", color: isSelected ? "#fff" : "var(--foreground)", boxShadow: "var(--shadow-card)", borderRadius: "var(--radius)" }}
              >
                {!compact && <input type="checkbox" checked={selectedPaths.has(f.path)} onChange={() => toggleFile(f.path)} className="shrink-0" />}
                <button onClick={() => setSelectedFileId(isSelected ? null : f.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div
                    className={`flex items-center justify-center font-700 shrink-0 ${compact ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs"}`}
                    style={{ background: isSelected ? "rgba(255,255,255,0.2)" : meta.bg, color: isSelected ? "#fff" : meta.color, borderRadius: "10px" }}
                  >
                    {meta.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isFileSyncing(f.path) && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#22c55e" }} title="지금 폴더 연동으로 동기화 중인 파일입니다" />}
                      <div className="text-sm font-600 truncate">{name}</div>
                    </div>
                    {!compact && (
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap" style={{ color: isSelected ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)" }}>
                        <span className="text-xs">{uploaderName}</span>
                        <span className="text-xs">·</span>
                        <span className="text-xs">{formatDate(f.updatedAt)}</span>
                        <span className="text-xs">·</span>
                        <span className="text-xs">{formatSize(fileSize(f.content))}</span>
                      </div>
                    )}
                  </div>
                  {fileBranchCount > 0 && (
                    <span className="text-xs font-700 px-2 py-0.5 shrink-0" style={{ borderRadius: "20px", background: isSelected ? "rgba(255,255,255,0.25)" : "#ef444418", color: isSelected ? "#fff" : "#ef4444" }}>
                      분기 {fileBranchCount}
                    </span>
                  )}
                  {(pinCounts.get(f.id) ?? 0) > 0 && (
                    <span className="text-xs font-700 px-2 py-0.5 shrink-0" style={{ borderRadius: "20px", background: isSelected ? "rgba(255,255,255,0.25)" : "#8b5cf618", color: isSelected ? "#fff" : "#8b5cf6" }}>
                      📌 {pinCounts.get(f.id)}
                    </span>
                  )}
                </button>
                {editingTagFileId === f.id ? (
                  <input
                    autoFocus
                    list="workspace-tag-options"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveTag(f.id)}
                    onBlur={() => handleSaveTag(f.id)}
                    placeholder="태그"
                    className="w-24 text-xs px-2 py-1 outline-none shrink-0"
                    style={{ border: "1px solid var(--border)", borderRadius: "20px", background: isSelected ? "rgba(255,255,255,0.2)" : "var(--muted)", color: isSelected ? "#fff" : "var(--foreground)" }}
                  />
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTagFileId(f.id);
                      setTagDraft(f.tag ?? "");
                    }}
                    className="text-xs font-600 px-2.5 py-1 shrink-0"
                    style={
                      f.tag
                        ? { borderRadius: "20px", background: isSelected ? "rgba(255,255,255,0.25)" : `${tagColor(f.tag)}18`, color: isSelected ? "#fff" : tagColor(f.tag) }
                        : { borderRadius: "20px", background: isSelected ? "rgba(255,255,255,0.15)" : "var(--muted)", color: isSelected ? "rgba(255,255,255,0.8)" : "var(--muted-foreground)" }
                    }
                  >
                    {f.tag ?? "+ 태그"}
                  </button>
                )}
              </div>
            );
          })}
          {directFiles.length === 0 && folderNames.length === 0 && (
            <div className="p-8 text-center text-sm border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}>
              동기화된 파일이 없습니다.
            </div>
          )}
          {directFiles.length === 0 && directFilesAll.length > 0 && (
            <div className="p-8 text-center text-sm border-2 border-dashed" style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}>
              이 태그의 파일이 없습니다.
            </div>
          )}
        </div>

        {/* 버전 이력 / 댓글 패널 */}
        <div className={selectedFile ? "lg:col-span-3" : "lg:col-span-2"}>
          {selectedFile ? (
            <div className="p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
              <h3 className="text-sm font-700 mb-0.5 leading-snug break-all">{selectedFile.path}</h3>
              <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                {loadingVersions ? "불러오는 중..." : `${versions.length}개 버전 · ${formatSize(fileSize(selectedFile.content))} · 최근 수정 ${formatDate(selectedFile.updatedAt)}`}
              </p>

              {detailTab === "versions" && (
                <>
                  <input
                    ref={newVersionInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      void handleUploadNewVersion(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex gap-1.5 mb-4">
                    <button
                      onClick={() => {
                        uploadTargetPinIdRef.current = null;
                        newVersionInputRef.current?.click();
                      }}
                      disabled={uploadingNewVersion}
                      className="flex-1 text-xs font-700 py-2"
                      style={{ borderRadius: "10px", border: "2px solid var(--primary)", color: "var(--primary)", background: "transparent", opacity: uploadingNewVersion ? 0.6 : 1 }}
                    >
                      {uploadingNewVersion ? "업로드 중..." : `+ 새 버전 업로드 (${selectedFile.path.split("/").pop()} 갱신)`}
                    </button>
                    <button
                      onClick={() => setCalendarOpen(true)}
                      title="업로드 달력"
                      className="w-9 shrink-0 flex items-center justify-center text-sm"
                      style={{ borderRadius: "10px", border: "2px solid var(--border)", color: "var(--foreground)", background: "transparent" }}
                    >
                      📅
                    </button>
                  </div>
                </>
              )}

              <div className="flex gap-1.5 mb-3 p-1" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                {(["versions", "comments"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDetailTab(t)}
                    className="flex-1 text-xs font-700 py-1.5 transition-all"
                    style={{ background: detailTab === t ? "var(--card)" : "transparent", color: detailTab === t ? "var(--primary)" : "var(--muted-foreground)", borderRadius: "7px", boxShadow: detailTab === t ? "var(--shadow-card)" : "none" }}
                  >
                    {t === "versions" ? `버전 이력 (${versions.length})` : `댓글 (${comments.length})`}
                  </button>
                ))}
              </div>

              {detailTab === "versions" ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>보기 방식</span>
                    <div className="flex gap-1 p-0.5" style={{ background: "var(--muted)", borderRadius: "20px" }}>
                      {([["simple", "페이지"], ["engineer", "버전트리"]] as const).map(([id, label]) => (
                        <button
                          key={id}
                          onClick={() => chooseViewMode(id)}
                          className="text-xs font-600 px-2.5 py-1 transition-all"
                          style={{
                            background: viewMode === id ? "var(--card)" : "transparent",
                            color: viewMode === id ? "var(--primary)" : "var(--muted-foreground)",
                            borderRadius: "16px",
                            boxShadow: viewMode === id ? "var(--shadow-card)" : "none",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {viewMode === "simple" ? (
                    <div className="overflow-auto max-h-80">
                      <VersionPageFlip
                        versions={versions}
                        currentVersionId={selectedFile.currentVersionId}
                        memberNameById={memberNameById}
                        onPromote={(versionId) => handlePromote(selectedFile.id, versionId)}
                        onShowFull={setFullTextVersion}
                      />
                    </div>
                  ) : (
                    <>
                      {pins.length > 0 && (
                        <div className="flex gap-1.5 mb-3 flex-wrap">
                          {pins.map((p) => (
                            <span key={p.id} className="flex items-center gap-1.5 text-xs font-600 pl-2.5 pr-1.5 py-1" style={{ borderRadius: "20px", background: "#8b5cf618", color: "#8b5cf6" }}>
                              📌 {p.label}
                              <button onClick={() => handleDeletePin(p.id)} className="w-4 h-4 flex items-center justify-center rounded-full">
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="version-tree-scroll overflow-auto max-h-80">
                        <ul className="version-tree">
                          {rootVersions.map((v) => (
                            <VersionNode
                              key={v.id}
                              version={v}
                              childrenByParent={versionChildrenByParent}
                              currentVersionId={selectedFile.currentVersionId}
                              openBranchIds={openBranchIds}
                              pinsByVersion={pinsByVersion}
                              memberNameById={memberNameById}
                              focusedVersionId={effectiveFocusId}
                              highlightIds={highlightIds}
                              versionsById={versionsById}
                              onFocus={setFocusedVersionId}
                              onPromote={(versionId) => handlePromote(selectedFile.id, versionId)}
                              onCreatePin={handleCreatePin}
                              onUploadToPin={handleUploadToPin}
                              onShowFull={setFullTextVersion}
                            />
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700 shrink-0" style={{ background: "var(--secondary)", color: "var(--primary)" }}>
                        {(memberNameById.get(c.authorId) ?? "?").slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-700">{memberNameById.get(c.authorId) ?? c.authorId}</span>
                          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{formatDate(c.createdAt)}</span>
                        </div>
                        <p className="text-xs mt-0.5 leading-relaxed px-3 py-2" style={{ background: "var(--muted)", borderRadius: "10px" }}>{c.content}</p>
                      </div>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <div className="text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>아직 댓글이 없어요. 첫 코멘트를 남겨보세요.</div>
                  )}
                  <div className="flex gap-2 mt-1">
                    <input
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                      placeholder="이 파일에 코멘트 남기기..."
                      className="flex-1 text-xs px-3 py-2 outline-none"
                      style={{ background: "var(--muted)", borderRadius: "20px" }}
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={!commentDraft.trim()}
                      className="px-3 text-xs font-700 shrink-0"
                      style={{ borderRadius: "20px", color: "#fff", background: "var(--primary)", opacity: commentDraft.trim() ? 1 : 0.4 }}
                    >
                      등록
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className="p-8 text-center h-full flex flex-col items-center justify-center border-2 border-dashed"
              style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
            >
              <div className="text-3xl mb-3">⬡</div>
              <div className="text-sm font-600">파일을 선택하면</div>
              <div className="text-sm">버전 이력과 댓글을 확인할 수 있어요</div>
            </div>
          )}
        </div>
      </div>

      <datalist id="workspace-tag-options">
        {knownTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {fullTextVersion && (
        <div
          onClick={() => setFullTextVersion(null)}
          className="fixed inset-0 flex items-center justify-center z-50 p-6"
          style={{ background: "rgba(15,23,42,0.5)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[80vh] flex flex-col"
            style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.28)" }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <div className="text-sm font-700">전문 보기</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {memberNameById.get(fullTextVersion.authorId) ?? fullTextVersion.authorId} · {formatDate(fullTextVersion.createdAt)}
                </div>
              </div>
              <button
                onClick={() => setFullTextVersion(null)}
                className="w-8 h-8 flex items-center justify-center text-lg"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
              >
                ×
              </button>
            </div>
            <pre
              className="flex-1 overflow-auto text-xs whitespace-pre-wrap p-4 m-0"
              style={{ color: "var(--foreground)", fontFamily: "var(--font-jetbrains)" }}
            >
              {fullTextVersion.content}
            </pre>
          </div>
        </div>
      )}

      {calendarOpen && selectedFile && (
        <VersionCalendarModal
          projectId={project.id}
          currentFileId={selectedFile.id}
          currentFileName={selectedFile.path.split("/").pop() ?? selectedFile.path}
          memberNameById={memberNameById}
          onClose={() => setCalendarOpen(false)}
          onSelectFile={(fileId) => {
            setSelectedFileId(fileId);
            setCalendarOpen(false);
          }}
        />
      )}
    </div>
  );
}
