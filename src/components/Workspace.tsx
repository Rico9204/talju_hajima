import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useProject } from "../context/ProjectContext";
import {
  addFileComment,
  createFilePin,
  deleteFilePin,
  listActiveCollabUsers,
  listAllSyncPresence,
  listBranches,
  listFileComments,
  listFilePins,
  listFileVersions,
  listFiles,
  listPinCounts,
  listVersionCalendar,
  moveFile,
  promoteVersion as promoteVersionApi,
  setFileTag,
  syncFiles,
  type ActivePresence,
  type CollabActiveFile,
  type FileBranches,
  type FileComment,
  type FileVersion,
  type FileVersionPin,
  type ProjectFile,
  type VersionCalendarEntry,
} from "../api/backend/files";
import { MAX_FILE_SIZE } from "../lib/folderSync";
import { classifyMajor } from "../api/backend/majors";
import { isRichDocPath, isSlidesPath, isCollabDocPath, isSnapshotContent } from "../lib/richDoc";
import { extractSnapshotTextSummary } from "../lib/snapshotPreview";
import FolderSync from "./FolderSync";
import QuickEditModal from "./QuickEditModal";
import DocEditorModal from "./DocEditorModal";
import SlidesEditorModal from "./SlidesEditorModal";
import OfficePreview, { isOfficePreviewablePath, isOfficeEditablePath } from "./OfficePreview";
import OfficeEditModal from "./OfficeEditModal";
import { isPptxPath, isZipPath, extractPptxTextSummary, listZipEntries, type ZipEntry } from "../lib/binaryPreview";

const COLLAB_PRESENCE_POLL_MS = 4000;
// 다른 사람이 올린 변경사항(파일 목록/버전 목록)을 내 화면에도 반영하기 위한 폴링 주기 — 이게
// 없으면 남이 "바로 수정"을 끝내고 저장해도, 내가 새로고침하기 전까지는 옛날 내용/버전 개수가
// 그대로 보인다.
const DATA_REFRESH_POLL_MS = 5000;

// 제품개발/frontend의 워크스페이스(ProjectWorkspacePage의 파일 로딩/승격 로직 + WorkspaceTab의
// 폴더/버전 트리/핀/태그/댓글/동시 동기화 표시 UI)를 이 앱의 화면 형식(페이지 하나 = 화면 하나,
// var(--token) 인라인 스타일)에 맞춰 그대로 이식. talju_hajima 원래의 로컬(ProjectContext) 파일
// 모델은 더 이상 쓰지 않고 실제 백엔드(api/backend/files.ts)와 직접 통신한다 — FolderSync.tsx와
// 동일한 방식.

const PRESENCE_POLL_MS = 3000;
const KEEP_FILE = ".keep";
const TAG_PALETTE = ["#3d52d5", "#f0a500", "#22c55e", "#8b5cf6", "#6b7280", "#2563eb", "#ef4444", "#06b6d4"];

// 파일/폴더 목록의 드래그 앤 드롭 순서 변경 — 서버에는 저장하지 않고 이 브라우저에 프로젝트+폴더별로만
// 기억한다(다른 팀원 화면이나 다른 기기에는 영향 없음, 단순 개인 보기 설정).
function customOrderKey(kind: "file" | "folder", projectId: string, dir: string | null): string {
  return `workspace-${kind}-order:${projectId}:${dir ?? ""}`;
}

function loadCustomOrder(kind: "file" | "folder", projectId: string, dir: string | null): string[] | null {
  try {
    const raw = localStorage.getItem(customOrderKey(kind, projectId, dir));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveCustomOrder(kind: "file" | "folder", projectId: string, dir: string | null, order: string[]) {
  try {
    localStorage.setItem(customOrderKey(kind, projectId, dir), JSON.stringify(order));
  } catch {
    // localStorage 접근이 막혀있어도(사생활 보호 모드 등) 기능이 죽을 필요는 없다 — 조용히 무시.
  }
}

function applyCustomOrder<T extends { id: string; path: string }>(list: T[], order: string[] | null): T[] {
  if (!order || order.length === 0) return list;
  const index = new Map(order.map((id, i) => [id, i]));
  return [...list].sort((a, b) => {
    const ai = index.has(a.id) ? index.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const bi = index.has(b.id) ? index.get(b.id)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.path.localeCompare(b.path);
  });
}

function applyOrderToNames(names: string[], order: string[] | null): string[] {
  if (!order || order.length === 0) return names;
  const index = new Map(order.map((n, i) => [n, i]));
  return [...names].sort((a, b) => {
    const ai = index.has(a) ? index.get(a)! : Number.MAX_SAFE_INTEGER;
    const bi = index.has(b) ? index.get(b)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

// 드래그 중인 내용을 dataTransfer에서 읽는다 — 파일(여러 개 가능)을 끄는 중인지, 폴더 하나를
// 순서 변경하려고 끄는 중인지를 구분한다.
type DragPayload = { type: "files"; ids: string[] } | { type: "folder"; name: string };

function getDragPayload(e: DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { type?: string; ids?: unknown; name?: unknown };
    if (parsed?.type === "files" && Array.isArray(parsed.ids)) {
      return { type: "files", ids: parsed.ids.filter((id): id is string => typeof id === "string") };
    }
    if (parsed?.type === "folder" && typeof parsed.name === "string") {
      return { type: "folder", name: parsed.name };
    }
  } catch {
    // JSON이 아니면(이전 버전 호환) 파일 id 문자열 하나로 취급
    return { type: "files", ids: [raw] };
  }
  return null;
}

function getDraggedFileIds(e: DragEvent): string[] {
  const payload = getDragPayload(e);
  return payload?.type === "files" ? payload.ids : [];
}

// 파일/폴더 카드 각각의 드래그 박스 히트 영역을 "보이는 칸 크기의 정확히 1.5배"로 넓히는 공용
// 훅 — 칸 자체의 실제 렌더 크기를 ResizeObserver로 재서 그 25%를 사방에 패딩으로 더한다
// (바깥 = 안쪽 + 2*25% = 안쪽의 1.5배). key(파일 id/폴더 이름)별로 독립적으로 추적한다.
function useHitZonePad() {
  const [pad, setPad] = useState<Map<string, { x: number; y: number }>>(new Map());
  const observersRef = useRef<Map<string, ResizeObserver>>(new Map());
  // key별로 ref 콜백 함수 자체를 캐싱한다 — 매 렌더마다 새 인라인 함수를 ref로 넘기면 React가
  // "ref가 바뀌었다"고 보고 매번 null→엘리먼트로 다시 호출해, 아래 setState가 매 렌더 재실행되며
  // 무한 리렌더로 이어진다.
  const measureRefsRef = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());

  function getMeasureRef(key: string) {
    let fn = measureRefsRef.current.get(key);
    if (fn) return fn;
    fn = (el: HTMLDivElement | null) => {
      const existing = observersRef.current.get(key);
      if (existing) {
        existing.disconnect();
        observersRef.current.delete(key);
      }
      if (!el) return;
      const update = () => {
        const rect = el.getBoundingClientRect();
        const nextPad = { x: rect.width * 0.25, y: rect.height * 0.25 };
        setPad((prev) => {
          const cur = prev.get(key);
          // 실측값이 사실상 그대로면(0.5px 미만 차이) state를 안 바꿔서 불필요한 리렌더를 막는다.
          if (cur && Math.abs(cur.x - nextPad.x) < 0.5 && Math.abs(cur.y - nextPad.y) < 0.5) return prev;
          const next = new Map(prev);
          next.set(key, nextPad);
          return next;
        });
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      observersRef.current.set(key, ro);
    };
    measureRefsRef.current.set(key, fn);
    return fn;
  }

  useEffect(() => {
    const observers = observersRef.current;
    return () => {
      observers.forEach((ro) => ro.disconnect());
      observers.clear();
    };
  }, []);

  return { pad, getMeasureRef };
}

// 워크스페이스 파일 목록에서 체크박스로 선택한 항목(파일 경로 또는 폴더 경로가 섞여 있음)을
// "실제 파일 경로" 집합으로 풀어낸다 — 폴더가 선택돼 있으면 그 안의 모든 파일로 펼친다.
// FolderSync의 "선택 동기화"가 이 결과를 그대로 동기화 범위로 쓴다.
function expandSelectedPaths(selectedPaths: Set<string>, allFiles: { path: string }[]): Set<string> {
  const result = new Set<string>();
  const allPathSet = new Set(allFiles.map((f) => f.path));
  for (const p of selectedPaths) {
    if (allPathSet.has(p)) {
      result.add(p);
      continue;
    }
    const prefix = `${p}/`;
    for (const f of allFiles) {
      if (f.path.startsWith(prefix) && f.path.split("/").pop() !== KEEP_FILE) result.add(f.path);
    }
  }
  return result;
}

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
  jsx: { bg: "#f59e0b18", color: "#f59e0b", label: "JSX" },
  json: { bg: "#6b728018", color: "#6b7280", label: "JSON" },
  py: { bg: "#22c55e18", color: "#22c55e", label: "PY" },
  java: { bg: "#ef444418", color: "#ef4444", label: "JAVA" },
  c: { bg: "#6b728018", color: "#6b7280", label: "C" },
  h: { bg: "#6b728018", color: "#6b7280", label: "C" },
  cpp: { bg: "#6b728018", color: "#6b7280", label: "C++" },
  cc: { bg: "#6b728018", color: "#6b7280", label: "C++" },
  hpp: { bg: "#6b728018", color: "#6b7280", label: "C++" },
  go: { bg: "#06b6d418", color: "#06b6d4", label: "GO" },
  rs: { bg: "#f0a50018", color: "#f0a500", label: "RS" },
  rb: { bg: "#ef444418", color: "#ef4444", label: "RB" },
  php: { bg: "#8b5cf618", color: "#8b5cf6", label: "PHP" },
  cs: { bg: "#8b5cf618", color: "#8b5cf6", label: "C#" },
  kt: { bg: "#f0a50018", color: "#f0a500", label: "KT" },
  swift: { bg: "#f0a50018", color: "#f0a500", label: "SWIFT" },
  css: { bg: "#2563eb18", color: "#2563eb", label: "CSS" },
  scss: { bg: "#2563eb18", color: "#2563eb", label: "CSS" },
  html: { bg: "#ef444418", color: "#ef4444", label: "HTML" },
  xml: { bg: "#ef444418", color: "#ef4444", label: "XML" },
  sh: { bg: "#22c55e18", color: "#22c55e", label: "SH" },
  yml: { bg: "#6b728018", color: "#6b7280", label: "YML" },
  yaml: { bg: "#6b728018", color: "#6b7280", label: "YML" },
  sql: { bg: "#06b6d418", color: "#06b6d4", label: "SQL" },
  rtdoc: { bg: "#2563eb18", color: "#2563eb", label: "문서" },
  slides: { bg: "#f0a50018", color: "#f0a500", label: "슬라이드" },
};
const DEFAULT_TYPE_META: TypeMeta = { bg: "#6b728018", color: "#6b7280", label: "FILE" };

// 텍스트로 읽으면 내용이 깨지는(이미지/오피스 문서/압축 등) 확장자 — 이 목록에 있으면 업로드 시
// 텍스트가 아니라 data: URL(base64)로 읽어서 저장하고, 버전 비교/전문보기에서도 줄 단위 diff
// 대신 미리보기(이미지) 또는 "다운로드해서 확인" 안내로 다르게 다룬다.
const BINARY_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "hwp", "hwpx", "zip",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico",
]);

function isBinaryPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return BINARY_EXTENSIONS.has(ext);
}

// content가 data: URL(base64, 업로드된 바이너리 파일) 또는 Yjs 스냅샷(리치 문서/슬라이드)인지 —
// 둘 다 줄 단위 diff로 비교하면 의미가 없어서(전자는 원본이 텍스트가 아니고, 후자는 내부 구조가
// base64 한 덩어리라 바뀔 때마다 전체가 다르게 보임) 버전 비교 화면에서 공통으로 건너뛴다.
function isBinaryContent(content: string): boolean {
  return content.startsWith("data:") || isSnapshotContent(content);
}

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
  if (isBinaryContent(content)) {
    // data:<mime>;base64,<data> — 콤마 뒤 base64 길이로 실제 바이트 수를 근사 계산
    // (Blob([content]).size를 쓰면 base64 텍스트 자체의 바이트 수라 실제 파일보다 부풀어 보임).
    const base64 = content.slice(content.indexOf(",") + 1);
    const padding = (base64.match(/=+$/) ?? [""])[0].length;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }
  return new Blob([content]).size;
}

// 브라우저에서 선택한 파일을 저장용 문자열로 읽는다 — 텍스트 확장자는 그대로 텍스트로,
// 이미지/문서/압축 등은 원본 바이트가 안 깨지게 data: URL(base64)로 읽는다.
function readFileForUpload(file: File): Promise<string> {
  if (!isBinaryPath(file.name)) return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function downloadFile(path: string, content: string): void {
  const name = path.split("/").pop() || path;
  let blob: Blob;
  if (isBinaryContent(content)) {
    const comma = content.indexOf(",");
    const mimeMatch = content.slice(0, comma).match(/^data:(.*?)(;base64)?$/);
    const mime = mimeMatch?.[1] || "application/octet-stream";
    const binaryString = atob(content.slice(comma + 1));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else {
    blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
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

interface FullTextDiffLine {
  text: string;
  changed: boolean;
  // 이 줄이 이전 버전의 어떤 줄을 고쳐 쓴 것이면(remove+add 쌍) 그 이전 내용을 담아 호버 시
  // 보여준다. 완전히 새로 생긴 줄이면 null(비교할 이전 내용이 없다는 뜻).
  oldText: string | null;
}

// "페이지" 보기용 — diff 결과에서 remove만 있는 줄(새 버전엔 없는 줄)은 건너뛰고, same/add 줄을
// 순서대로 이어 붙여 "새 버전의 전체 내용"을 그대로 복원하면서, 바뀐 줄만 changed=true로 표시한다.
function buildFullTextDiff(oldText: string, newText: string): FullTextDiffLine[] {
  const raw = diffLines(oldText, newText);
  const result: FullTextDiffLine[] = [];
  let i = 0;
  while (i < raw.length) {
    const cur = raw[i];
    const next = raw[i + 1];
    if (cur.type === "same") {
      result.push({ text: cur.text, changed: false, oldText: null });
      i += 1;
    } else if (cur.type === "remove" && next?.type === "add") {
      result.push({ text: next.text, changed: true, oldText: cur.text });
      i += 2;
    } else if (cur.type === "add") {
      result.push({ text: cur.text, changed: true, oldText: null });
      i += 1;
    } else {
      // remove만 있고 이어지는 add가 없음 — 새 버전엔 없는 줄이라 표시할 자리가 없어 건너뜀
      i += 1;
    }
  }
  return result;
}

// "페이지" 보기 — 분기 트리 대신, 한 번에 버전 하나만 "페이지"처럼 보여주고 이전/다음 버튼으로
// 넘긴다. 어느 분기인지는 무시하고 오직 저장된 시각 순서로만 넘어간다(공학 전공이 아닌 팀원
// 기본값 — Workspace()의 viewMode 토글 참고). 시작 페이지는 항상 "현재 버전".
// 줄 단위 diff(FullTextDiffLine[])를 그려주는 공용 뷰 — "페이지" 미리보기 상자와 "전문 보기"
// 큰 창 양쪽에서 재사용한다. 수정된 줄은 노란 배경, 마우스를 올리면 수정 전 내용을 말풍선으로
// 보여준다. 말풍선은 document.body에 포털로 그려서(고정 위치, 뷰포트 기준) 스크롤 영역의
// overflow에 잘리거나 아래 버튼들에 가려지는 문제 없이 항상 맨 위에 온전히 보인다.
function DiffLinesView({ lines, highlightOnDark }: { lines: FullTextDiffLine[]; highlightOnDark: boolean }) {
  const [hover, setHover] = useState<{ left: number; anchor: number; placement: "below" | "above"; text: string } | null>(null);

  function showTooltip(e: React.MouseEvent<HTMLDivElement>, text: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 336));
    // 화면 아래쪽에 가까우면 줄 아래 대신 위쪽에 띄워서 화면 밖으로 안 나가게 한다.
    if (rect.bottom + 160 < window.innerHeight) {
      setHover({ left, anchor: rect.bottom + 4, placement: "below", text });
    } else {
      setHover({ left, anchor: window.innerHeight - rect.top + 4, placement: "above", text });
    }
  }

  if (lines.length === 0) {
    return <span style={{ opacity: 0.7 }}>내용이 비어있어요.</span>;
  }

  return (
    <>
      {lines.map((line, i) => (
        <div
          key={i}
          onMouseEnter={line.changed ? (e) => showTooltip(e, line.oldText !== null ? `이전: ${line.oldText || " "}` : "새로 추가된 줄") : undefined}
          onMouseLeave={line.changed ? () => setHover(null) : undefined}
          style={{
            background: line.changed ? (highlightOnDark ? "rgba(255,255,255,0.25)" : "#fde68a80") : "transparent",
            borderRadius: line.changed ? "3px" : 0,
            padding: line.changed ? "0 3px" : 0,
            margin: line.changed ? "0 -3px" : 0,
          }}
        >
          {line.text || " "}
        </div>
      ))}
      {hover &&
        createPortal(
          <div
            className="fixed whitespace-pre-wrap"
            style={{
              left: hover.left,
              ...(hover.placement === "below" ? { top: hover.anchor } : { bottom: hover.anchor }),
              zIndex: 9999,
              minWidth: "160px",
              maxWidth: "320px",
              maxHeight: "40vh",
              overflowY: "auto",
              borderRadius: "8px",
              padding: "6px 8px",
              background: "#1f2937",
              color: "#fca5a5",
              boxShadow: "0 8px 24px rgba(15,18,53,0.3)",
              fontFamily: "var(--font-jetbrains)",
              fontSize: "12px",
              pointerEvents: "none",
            }}
          >
            {hover.text}
          </div>,
          document.body,
        )}
    </>
  );
}

// 바이너리/스냅샷 파일에서 텍스트만 뽑아 일반 텍스트 버전 비교(diffLines)에 그대로 흘려보내는
// 공통 훅 — .pptx(슬라이드 텍스트)와 .rtdoc/.slides(Yjs 스냅샷 텍스트)가 이 로직을 공유한다.
// content가 바뀔 때마다 두 버전(비교 기준/현재)을 다시 비동기로 추출해야 해서 훅으로 분리.
function useExtractedCompareTexts(
  parentContent: string | undefined,
  content: string | undefined,
  applicable: boolean,
  extract: (content: string) => Promise<string>,
) {
  const [state, setState] = useState<{ parentText: string; text: string; ready: boolean }>({
    parentText: "",
    text: "",
    ready: true,
  });

  useEffect(() => {
    if (!applicable) {
      setState({ parentText: "", text: "", ready: true });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, ready: false }));
    Promise.all([parentContent ? extract(parentContent) : Promise.resolve(""), content ? extract(content) : Promise.resolve("")])
      .then(([parentText, text]) => {
        if (!cancelled) setState({ parentText, text, ready: true });
      })
      .catch(() => {
        if (!cancelled) setState({ parentText: "", text: "", ready: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentContent, content, applicable]);

  return { applicable, ...state };
}

function usePptxCompareTexts(parentContent: string | undefined, content: string | undefined, path: string) {
  const applicable = isPptxPath(path) && !!content?.startsWith("data:");
  return useExtractedCompareTexts(
    parentContent?.startsWith("data:") ? parentContent : undefined,
    content,
    applicable,
    extractPptxTextSummary,
  );
}

// .rtdoc/.slides(Yjs 스냅샷)도 pptx와 같은 방식 — 본문/슬라이드 텍스트만 뽑아 줄 단위로 비교한다.
function useSnapshotCompareTexts(parentContent: string | undefined, content: string | undefined, path: string) {
  const applicable = isCollabDocPath(path) && !!content && isSnapshotContent(content);
  return useExtractedCompareTexts(
    parentContent && isSnapshotContent(parentContent) ? parentContent : undefined,
    content,
    applicable,
    (c) => extractSnapshotTextSummary(c, path),
  );
}

// .zip은 "미리보기"할 내용 자체가 없어서, 대신 안에 어떤 파일들이 들어있는지 목록을 보여준다.
function ZipEntriesList({ content }: { content: string }) {
  const [entries, setEntries] = useState<ZipEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setFailed(false);
    listZipEntries(content)
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (failed) return <span style={{ opacity: 0.7 }}>압축 파일 목록을 읽지 못했어요.</span>;
  if (!entries) return <span style={{ opacity: 0.7 }}>목록을 불러오는 중...</span>;
  if (entries.length === 0) return <span style={{ opacity: 0.7 }}>빈 압축 파일이에요.</span>;
  return (
    <div>
      {entries.map((e) => (
        <div key={e.path} className="flex justify-between gap-2">
          <span className="truncate">{e.path}</span>
          <span className="shrink-0" style={{ opacity: 0.7 }}>
            {formatSize(e.size)}
          </span>
        </div>
      ))}
    </div>
  );
}

function VersionPageFlip({
  versions,
  currentVersionId,
  memberNameById,
  onPromote,
  onShowFull,
  onViewingVersionChange,
  jumpTo,
  path,
}: {
  versions: FileVersion[];
  currentVersionId: string | null;
  memberNameById: Map<string, string>;
  onPromote: (versionId: string) => void;
  onShowFull: (version: FileVersion) => void;
  path: string;
  // 지금 몇 번째 페이지(어느 버전)를 보고 있는지 부모에 알려준다 — "이 페이지에 댓글 달기"가
  // 트리 보기의 focusedVersionId와 같은 방식으로 동작하게 하기 위해 필요.
  onViewingVersionChange: (versionId: string | null) => void;
  // 핀 클릭 등으로 특정 버전 페이지로 바로 넘기고 싶을 때 — nonce는 같은 핀을 연달아 눌러도
  // (id는 안 바뀌어도) 효과가 다시 발동하게 하기 위한 값.
  jumpTo: { id: string; nonce: number } | null;
}) {
  const chronological = useMemo(
    () => [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [versions],
  );
  const versionsById = useMemo(() => new Map(versions.map((v) => [v.id, v])), [versions]);
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

  // 핀 등을 클릭해 특정 버전으로 바로 이동 요청이 오면 그 버전이 있는 페이지로 넘긴다.
  useEffect(() => {
    if (!jumpTo) return;
    const idx = chronological.findIndex((v) => v.id === jumpTo.id);
    if (idx >= 0) setPageIndex(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo]);

  const version = chronological[pageIndex];
  // 페이지 넘기기는 시간순이지만, 비교 기준은 "바로 앞 페이지"가 아니라 이 버전이 실제로 어떤
  // 버전을 고쳐서 만들어졌는지(parentVersionId) — 분기가 있으면 시간상 이전 페이지와 실제
  // 수정 전 버전이 다를 수 있기 때문.
  const parent = version?.parentVersionId ? (versionsById.get(version.parentVersionId) ?? null) : null;
  const isCurrent = version?.id === currentVersionId;
  const isBinary = !!version && isBinaryContent(version.content);
  const pptxCompare = usePptxCompareTexts(parent?.content, version?.content, path);
  const snapshotCompare = useSnapshotCompareTexts(parent?.content, version?.content, path);
  const textCompare = pptxCompare.applicable ? pptxCompare : snapshotCompare;
  // Hooks는 조건 없이 항상 같은 순서로 호출되어야 하므로(버전 목록이 비동기로 나중에 채워질 때도
  // 안전하게), version이 아직 없을 수 있는 상태를 감안해 옵셔널 체이닝으로 처리하고 useMemo 자체는
  // 아래 "버전 없음" 조기 반환보다 먼저 호출한다. 바이너리 파일은 줄 단위로 의미가 없어 diff는 건너뜀
  // (단, .pptx/.rtdoc/.slides는 텍스트만 뽑아 비교하므로 예외).
  const fullTextLines = useMemo(() => {
    if (textCompare.applicable) return textCompare.ready ? buildFullTextDiff(textCompare.parentText, textCompare.text) : [];
    return isBinary ? [] : buildFullTextDiff(parent?.content ?? "", version?.content ?? "");
  }, [isBinary, parent, version, textCompare]);
  const changedCount = fullTextLines.filter((l) => l.changed).length;

  // Hooks 규칙상 "버전 없음" 조기 반환보다 먼저 호출해야 한다(버전 목록이 비동기로 채워질 때도
  // 매 렌더 같은 순서로 훅이 호출되게).
  useEffect(() => {
    onViewingVersionChange(version?.id ?? null);
  }, [version?.id, onViewingVersionChange]);

  if (!version) {
    return <div className="text-xs text-center py-6" style={{ color: "var(--muted-foreground)" }}>버전이 없어요.</div>;
  }

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
          {textCompare.applicable
            ? !textCompare.ready
              ? "내용 불러오는 중..."
              : !parent
                ? "맨 처음 저장한 내용"
                : changedCount === 0
                  ? "수정 전 버전과 내용이 같음"
                  : `${changedCount}줄 수정됨 (텍스트 기준)`
            : isBinary
              ? "바이너리 파일"
              : !parent
                ? "맨 처음 저장한 내용"
                : changedCount === 0
                  ? "수정 전 버전과 내용이 같음"
                  : `${changedCount}줄 수정됨`}{" "}
          {expanded ? "▲" : "▼"}
        </button>
        {expanded && (
          <div
            onDoubleClick={() => onShowFull(version)}
            title="더블클릭하면 크게 볼 수 있어요"
            className="text-xs whitespace-pre-wrap p-2 mb-2 max-h-40 overflow-y-auto cursor-zoom-in"
            style={{ borderRadius: "8px", background: isCurrent ? "rgba(255,255,255,0.15)" : "var(--card)", fontFamily: "var(--font-jetbrains)" }}
          >
            {textCompare.applicable ? (
              !textCompare.ready ? (
                <span style={{ opacity: 0.7 }}>불러오는 중...</span>
              ) : (
                <DiffLinesView lines={fullTextLines} highlightOnDark={isCurrent} />
              )
            ) : isBinary ? (
              version.content.startsWith("data:image/") ? (
                <img src={version.content} alt={version.note ?? "이미지 미리보기"} className="max-w-full rounded" />
              ) : isSnapshotContent(version.content) ? (
                <span style={{ opacity: 0.7 }}>문서/슬라이드는 줄글 비교 대신 열어서 확인하세요 (파일 목록의 ✏️ 바로 수정 버튼).</span>
              ) : isOfficePreviewablePath(path) ? (
                <OfficePreview path={path} content={version.content} />
              ) : isZipPath(path) ? (
                <ZipEntriesList content={version.content} />
              ) : (
                <span style={{ opacity: 0.7 }}>이미지가 아닌 바이너리 파일이에요. 더블클릭하거나 "전체 내용 보기"로 다운로드하세요.</span>
              )
            ) : (
              <DiffLinesView lines={fullTextLines} highlightOnDark={isCurrent} />
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
  path,
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
  path: string;
}) {
  const isCurrent = version.id === currentVersionId;
  const isOpenBranch = openBranchIds.has(version.id);
  const pinsHere = pinsByVersion.get(version.id) ?? [];
  const expanded = version.id === focusedVersionId;
  const isDimmed = highlightIds.size > 0 && !highlightIds.has(version.id);
  const children = childrenByParent.get(version.id) ?? [];
  const cardRef = useRef<HTMLDivElement>(null);
  const parentVersion = version.parentVersionId ? versionsById.get(version.parentVersionId) : null;
  const isBinary = isBinaryContent(version.content);
  const pptxCompare = usePptxCompareTexts(parentVersion?.content, version.content, path);
  const snapshotCompare = useSnapshotCompareTexts(parentVersion?.content, version.content, path);
  const textCompare = pptxCompare.applicable ? pptxCompare : snapshotCompare;
  // parentVersion이 없으면(맨 첫 버전) 비교 대상이 없으니 전체를 추가된 내용으로 취급.
  // 바이너리 파일은 줄 단위로 비교하는 게 의미 없어(base64 덩어리) diff 자체를 건너뜀
  // (단, .pptx/.rtdoc/.slides는 텍스트만 뽑아 비교하므로 예외).
  const changedLines =
    expanded && textCompare.applicable
      ? textCompare.ready
        ? diffLines(textCompare.parentText, textCompare.text).filter((l) => l.type !== "same")
        : []
      : expanded && !isBinary
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
                {textCompare.applicable
                  ? !textCompare.ready
                    ? "내용 불러오는 중..."
                    : `수정 사항 ${displayChanges.length > 0 ? `(${displayChanges.length}곳)` : ""}`
                  : isBinary
                    ? "바이너리 파일"
                    : `수정 사항 ${displayChanges.length > 0 ? `(${displayChanges.length}곳)` : ""}`}
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
              {textCompare.applicable && !textCompare.ready ? (
                <span style={{ opacity: 0.7 }}>불러오는 중...</span>
              ) : isBinary && !textCompare.applicable ? (
                version.content.startsWith("data:image/") ? (
                  <img src={version.content} alt={version.note ?? "이미지 미리보기"} className="max-w-full rounded" />
                ) : isSnapshotContent(version.content) ? (
                  <span style={{ opacity: 0.7 }}>문서/슬라이드는 줄글 비교 대신 열어서 확인하세요 (파일 목록의 ✏️ 바로 수정 버튼).</span>
                ) : isOfficePreviewablePath(path) ? (
                  <OfficePreview path={path} content={version.content} />
                ) : isZipPath(path) ? (
                  <ZipEntriesList content={version.content} />
                ) : (
                  <span style={{ opacity: 0.7 }}>이미지가 아닌 바이너리 파일이에요. 우측 상단 "+"로 다운로드하세요.</span>
                )
              ) : displayChanges.length === 0 ? (
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
              path={path}
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
  // 파일 목록에서 폴더 카드/상위 경로(breadcrumb)로 드래그 앤 드롭해서 옮기는 기능용 상태 —
  // dragOver(OS 파일 탐색기에서 업로드용으로 끌어다 놓는 것)와는 별개다. 체크박스로 여러 파일을
  // 선택한 상태에서 그중 하나를 드래그하면 선택된 전부를 함께 옮긴다.
  const [draggingFileIds, setDraggingFileIds] = useState<string[]>([]);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  // 같은 폴더 안에서 파일을 드래그해서 다른 파일 위에 놓으면 그 앞으로 순서가 바뀐다 — 이 순서는
  // 서버에 저장하지 않고 이 브라우저에만 폴더별로 기억된다(localStorage).
  const [dragOverFileId, setDragOverFileId] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  // 파일 목록 위에서 마우스로 네모 박스를 그려 여러 파일을 한번에 선택하는 기능(드래그 박스 선택).
  // 파일 행 자체를 눌러서 시작하면(= HTML5 드래그 이동) 여기서 안 건드리고, 행과 행 사이 빈 공간을
  // 눌러서 시작했을 때만 박스가 켜진다.
  const [selectBoxRect, setSelectBoxRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const rowElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const folderElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const selectDragRef = useRef<{
    startX: number;
    startY: number;
    additive: boolean;
    moved: boolean;
    baseSelection: Set<string>;
    entries: { path: string; rect: DOMRect }[];
  } | null>(null);
  // 폴더를 드래그해서 다른 폴더 위에 놓으면 그 앞으로 순서가 바뀐다(파일과 마찬가지로 이 브라우저에만 기억).
  const [draggingFolderName, setDraggingFolderName] = useState<string | null>(null);
  const [folderOrder, setFolderOrder] = useState<string[] | null>(null);
  // 폴더/파일 칸의 드래그 박스 히트 영역을 "보이는 칸 크기의 1.5배"로 정확히 맞추기 위해, 칸
  // 자체의 실측 크기(ResizeObserver)를 추적해서 그 25%만큼을 사방으로 더 넓힌다
  // (바깥쪽 = 안쪽 + 2*25% = 안쪽의 1.5배). 화면 폭/그리드 열 수가 바뀌어도 항상 정확히 비례한다.
  const folderHitZone = useHitZonePad();
  const fileHitZone = useHitZonePad();
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editingTagFileId, setEditingTagFileId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [uploadingNewVersion, setUploadingNewVersion] = useState(false);
  const [activePresence, setActivePresence] = useState<ActivePresence[]>([]);
  const [pins, setPins] = useState<FileVersionPin[]>([]);
  const [focusedVersionId, setFocusedVersionId] = useState<string | null>(null);
  // "페이지" 보기에서 지금 몇 번째 페이지(버전)를 보고 있는지 — VersionPageFlip이 보고해줌.
  // 버전트리 보기의 focusedVersionId와 별개로 관리하고, 댓글 작성 시 "보기 방식"에 맞는 쪽을 쓴다.
  const [pageFlipVersionId, setPageFlipVersionId] = useState<string | null>(null);
  // 핀 등을 눌러 "페이지" 보기를 특정 버전으로 바로 넘기라는 요청 — VersionPageFlip이 소비한다.
  const [pageJumpRequest, setPageJumpRequest] = useState<{ id: string; nonce: number } | null>(null);
  // 댓글 탭에서 "이 버전(페이지)만" / "파일 전체" 필터 — 기본은 파일 전체.
  const [commentFilterVersion, setCommentFilterVersion] = useState(false);
  // 댓글 작성 시 지금 보고 있는 버전에 달지, 파일 전체 댓글로 달지 — 기본은 파일 전체.
  const [commentTargetVersion, setCommentTargetVersion] = useState(false);
  const [fullTextVersion, setFullTextVersion] = useState<FileVersion | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // 핀 기준 "바로 수정" 대상 — 파일 목록/버전 패널의 ✏️(핀)에서 켠다. null이면 파일 메인 버전 기준.
  const [quickEditPin, setQuickEditPin] = useState<{ pinId: string; label: string } | null>(null);
  // 지금 열려있는 리치 문서/슬라이드 편집기 대상 파일 id — null이면 안 열림.
  const [docEditorFileId, setDocEditorFileId] = useState<string | null>(null);
  const [slidesEditorFileId, setSlidesEditorFileId] = useState<string | null>(null);
  // 지금 열려있는 워드/엑셀/PPT(OnlyOffice) 편집기 대상 파일 id — null이면 안 열림.
  const [officeEditFileId, setOfficeEditFileId] = useState<string | null>(null);
  const [creatingDocOrSlides, setCreatingDocOrSlides] = useState(false);
  const [creatingDocKind, setCreatingDocKind] = useState<"rtdoc" | "slides" | null>(null);
  const [newDocName, setNewDocName] = useState("");
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

  // 폴더를 옮겨다닐 때마다 그 폴더에 저장해둔 드래그 순서(있으면)를 불러온다.
  useEffect(() => {
    setCustomOrder(loadCustomOrder("file", project.id, currentDir));
    setFolderOrder(loadCustomOrder("folder", project.id, currentDir));
  }, [project.id, currentDir]);

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

  // "바로 수정"(실시간 공동편집) 중인 사람 — 파일 목록에 "N명이 바로 수정 중" 배지를 보여주기 위해
  // sync-presence와 같은 방식으로 주기적으로 폴링한다. 실제 편집 동기화는 웹소켓이 따로 맡는다.
  const [collabActive, setCollabActive] = useState<CollabActiveFile[]>([]);
  const [quickEditFileId, setQuickEditFileId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { data } = await listActiveCollabUsers(project.id);
        if (!cancelled) setCollabActive(data);
      } catch {
        if (!cancelled) setCollabActive([]);
      }
    }
    poll();
    const timer = setInterval(poll, COLLAB_PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [project.id]);

  function collabUsersFor(fileId: string): { userId: string; name: string }[] {
    return collabActive.find((c) => c.fileId === fileId)?.users ?? [];
  }

  // 다른 사람이 올린 변경사항을 새로고침 없이도 보이게 하는 폴링 — 파일 목록(버전 개수/최근 수정
  // 시각 등)을 주기적으로 다시 불러온다. currentDir/selectedFileId 같은 지금 보고 있는 화면
  // 상태는 안 건드리고 데이터만 갱신하므로, 보던 화면이 갑자기 초기화되지 않는다.
  useEffect(() => {
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, DATA_REFRESH_POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // 지금 선택해서 보고 있는 파일의 버전/댓글/핀도 같은 이유로 주기적으로 다시 불러온다 — 남이
  // "바로 수정"을 저장하면 몇 초 안에 새 버전이 여기 자동으로 나타난다.
  useEffect(() => {
    if (!selectedFileId) return;
    const timer = setInterval(() => {
      Promise.all([
        listFileVersions(project.id, selectedFileId),
        listFileComments(project.id, selectedFileId),
        listFilePins(project.id, selectedFileId),
      ])
        .then(([versionsRes, commentsRes, pinsRes]) => {
          setVersions(versionsRes.data);
          setComments(commentsRes.data);
          setPins(pinsRes.data);
        })
        .catch(() => {});
    }, DATA_REFRESH_POLL_MS);
    return () => clearInterval(timer);
  }, [project.id, selectedFileId]);

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
  const directFilesFiltered = tagFilter ? directFilesAll.filter((f) => f.tag === tagFilter) : directFilesAll;
  const directFiles = applyCustomOrder(directFilesFiltered, customOrder);
  const folderNames = applyOrderToNames(Array.from(subfolders).sort(), folderOrder);
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

  // 파일(여러 개 가능)을 다른 폴더(또는 workspace 루트, targetDir=null)로 옮긴다 — 폴더 카드나
  // breadcrumb 위로 드래그 앤 드롭했을 때 호출된다. id는 그대로 두고 path만 바꾸므로 버전/댓글/핀이
  // 유지됨. 체크박스로 여러 파일을 선택해 함께 드래그했으면 fileIds에 전부 들어온다.
  async function handleMoveFilesToFolder(fileIds: string[], targetDir: string | null) {
    setUploadError(null);
    let failCount = 0;
    for (const fileId of fileIds) {
      const file = files.find((f) => f.id === fileId);
      if (!file) continue;
      const baseName = file.path.split("/").pop();
      if (!baseName) continue;
      const newPath = targetDir ? `${targetDir}/${baseName}` : baseName;
      if (newPath === file.path) continue;
      try {
        await moveFile(project.id, fileId, newPath);
      } catch {
        failCount += 1;
      }
    }
    await refresh();
    if (failCount > 0) {
      setUploadError(
        fileIds.length > 1
          ? `${failCount}개 파일을 옮기지 못했어요 — 그 위치에 같은 이름의 파일이 이미 있을 수 있어요.`
          : "파일을 옮기지 못했어요 — 그 위치에 같은 이름의 파일이 이미 있을 수 있어요.",
      );
    }
  }

  // 같은 폴더 안에서 파일을 드래그해 다른 파일(targetFileId) 위에 놓으면 그 파일 바로 앞으로
  // 끌어온 파일(들)을 옮긴다. 서버에는 저장하지 않고 이 브라우저에 폴더별로만 기억한다.
  function handleReorderFiles(draggedIds: string[], targetFileId: string) {
    if (draggedIds.includes(targetFileId)) return;
    const currentOrderIds = directFiles.map((f) => f.id);
    const withoutDragged = currentOrderIds.filter((id) => !draggedIds.includes(id));
    const targetIndex = withoutDragged.indexOf(targetFileId);
    if (targetIndex === -1) return;
    const next = [...withoutDragged.slice(0, targetIndex), ...draggedIds, ...withoutDragged.slice(targetIndex)];
    setCustomOrder(next);
    saveCustomOrder("file", project.id, currentDir, next);
  }

  // 폴더를 드래그해서 다른 폴더(targetName) 위에 놓으면 그 폴더 바로 앞으로 옮긴다.
  function handleReorderFolders(draggedName: string, targetName: string) {
    if (draggedName === targetName) return;
    const withoutDragged = folderNames.filter((n) => n !== draggedName);
    const targetIndex = withoutDragged.indexOf(targetName);
    if (targetIndex === -1) return;
    const next = [...withoutDragged.slice(0, targetIndex), draggedName, ...withoutDragged.slice(targetIndex)];
    setFolderOrder(next);
    saveCustomOrder("folder", project.id, currentDir, next);
  }

  // 파일 목록 거의 어디서나(파일 칸 위를 포함해서) 마우스를 누른 채 드래그하면 네모 박스가 그려지고,
  // 그 박스에 걸친 파일/폴더가 체크박스로 선택된다. 옮기기 손잡이(⠿)는 자체 onMouseDown에서
  // stopPropagation 하므로 여기로 안 올라온다. 움직임이 거의 없으면(=그냥 클릭) 선택을 건드리지
  // 않아서, 파일 이름이나 폴더를 클릭해서 여는 동작과 부딪히지 않는다.
  function handleFileListMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const entries: { path: string; rect: DOMRect }[] = [];
    for (const f of directFiles) {
      const el = rowElsRef.current.get(f.id);
      if (el) entries.push({ path: f.path, rect: el.getBoundingClientRect() });
    }
    for (const name of folderNames) {
      const folderPath = currentDir ? `${currentDir}/${name}` : name;
      const el = folderElsRef.current.get(name);
      if (el) entries.push({ path: folderPath, rect: el.getBoundingClientRect() });
    }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    selectDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      additive,
      moved: false,
      baseSelection: additive ? new Set(selectedPaths) : new Set(),
      entries,
    };

    function onMove(ev: MouseEvent) {
      const drag = selectDragRef.current;
      if (!drag) return;
      if (!drag.moved) {
        if (Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 4) return;
        drag.moved = true;
      }
      const left = Math.min(drag.startX, ev.clientX);
      const top = Math.min(drag.startY, ev.clientY);
      const width = Math.abs(ev.clientX - drag.startX);
      const height = Math.abs(ev.clientY - drag.startY);
      setSelectBoxRect({ left, top, width, height });
      const right = left + width;
      const bottom = top + height;
      const next = new Set(drag.baseSelection);
      for (const entry of drag.entries) {
        const r = entry.rect;
        const intersects = r.left < right && r.right > left && r.top < bottom && r.bottom > top;
        if (intersects) next.add(entry.path);
      }
      setSelectedPaths(next);
    }
    function onUp() {
      selectDragRef.current = null;
      setSelectBoxRect(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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

  // 새 리치 문서/슬라이드 파일을 빈 내용으로 만들고(워크스페이스 파일 목록에 등록), 바로
  // 해당 편집기를 연다 — 실제 내용(문서 구조)은 편집기가 열리면서 웹소켓으로 채워진다
  // (collab.service.ts: 빈 content면 클라이언트가 기본 구조를 만듦).
  async function handleCreateDocOrSlides() {
    if (!creatingDocKind) return;
    const kind = creatingDocKind;
    const name = newDocName.trim() || (kind === "rtdoc" ? "새 문서" : "새 슬라이드");
    setCreatingDocOrSlides(true);
    setUploadError(null);
    try {
      const path = currentDir ? `${currentDir}/${name}.${kind}` : `${name}.${kind}`;
      await syncFiles(project.id, [{ path, content: "" }]);
      const refreshed = await refresh();
      const created = refreshed.find((f) => f.path === path);
      setCreatingDocKind(null);
      setNewDocName("");
      if (!created) return;
      if (kind === "rtdoc") setDocEditorFileId(created.id);
      else setSlidesEditorFileId(created.id);
    } catch {
      setUploadError(kind === "rtdoc" ? "문서 생성에 실패했습니다." : "슬라이드 생성에 실패했습니다.");
    } finally {
      setCreatingDocOrSlides(false);
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
          content = await readFileForUpload(file);
        } catch {
          setUploadError(`${file.name}을(를) 읽지 못했습니다.`);
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
        content = await readFileForUpload(file);
      } catch {
        setUploadError(`${file.name}을(를) 읽지 못했습니다.`);
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

  // 핀 등을 클릭해 그 버전으로 바로 이동 — "페이지" 보기면 그 페이지로 넘기고, "버전트리" 보기면
  // 그 버전에 포커스를 준다(트리 카드가 펼쳐지고 자동 스크롤됨, VersionNode 참고).
  function handleJumpToVersion(versionId: string) {
    if (viewMode === "simple") {
      setPageJumpRequest({ id: versionId, nonce: Date.now() });
    } else {
      setFocusedVersionId(versionId);
    }
  }

  async function handleAddComment(versionId?: string) {
    if (!selectedFileId || !commentDraft.trim()) return;
    try {
      await addFileComment(project.id, selectedFileId, commentDraft.trim(), versionId);
      setCommentDraft("");
      const { data } = await listFileComments(project.id, selectedFileId);
      setComments(data);
    } catch {
      setUploadError("댓글 등록에 실패했습니다.");
    }
  }

  const selectedFile = selectedFileId ? (files.find((f) => f.id === selectedFileId) ?? null) : null;
  const openBranchIds = selectedFileId ? (branchIdsByFile.get(selectedFileId) ?? new Set<string>()) : new Set<string>();
  // 지금 보고 있는 폴더의 파일 목록(directFiles) 안에서 "이전/다음 파일"로 넘어가기 위한 인덱스 계산.
  const selectedFileIndex = selectedFile ? directFiles.findIndex((f) => f.id === selectedFile.id) : -1;
  const prevFile = selectedFileIndex > 0 ? directFiles[selectedFileIndex - 1] : null;
  const nextFile = selectedFileIndex >= 0 && selectedFileIndex < directFiles.length - 1 ? directFiles[selectedFileIndex + 1] : null;

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
  // 지금 화면에 "보이고 있는" 버전 — 페이지 보기면 그 페이지, 버전트리 보기면 포커스된 버전.
  // 댓글을 "이 버전에" 달거나 필터링할 때 이 값을 기준으로 삼는다.
  const viewingVersionId = viewMode === "simple" ? pageFlipVersionId : effectiveFocusId;
  const viewingVersionLabel =
    viewMode === "simple"
      ? "지금 보고 있는 페이지"
      : viewingVersionId === selectedFile?.currentVersionId
        ? "현재 버전"
        : "포커스된 버전";
  const versionsById = new Map(versions.map((v) => [v.id, v]));
  // "전문 보기" 모달의 .pptx/.rtdoc/.slides 텍스트 비교 — 조건부 IIFE 안에서는 훅을 못 부르므로
  // (fullTextVersion이 null↔값 토글될 때 훅 호출 순서가 깨짐) 컴포넌트 최상위에서 항상 호출한다.
  const fullTextParentContent = fullTextVersion?.parentVersionId ? versionsById.get(fullTextVersion.parentVersionId)?.content : undefined;
  const fullTextPptxCompareRaw = usePptxCompareTexts(fullTextParentContent, fullTextVersion?.content, selectedFile?.path ?? "");
  const fullTextSnapshotCompare = useSnapshotCompareTexts(fullTextParentContent, fullTextVersion?.content, selectedFile?.path ?? "");
  const fullTextPptxCompare = fullTextPptxCompareRaw.applicable ? fullTextPptxCompareRaw : fullTextSnapshotCompare;
  const highlightIds = new Set<string>();
  if (effectiveFocusId) {
    let cur: string | null = effectiveFocusId;
    while (cur) {
      highlightIds.add(cur);
      cur = versionsById.get(cur)?.parentVersionId ?? null;
    }
    for (const child of versionChildrenByParent.get(effectiveFocusId) ?? []) highlightIds.add(child.id);
  }

  // "전체 선택"/다운로드 대상에는 지금 보고 있는 폴더의 파일뿐 아니라 하위 폴더(카드)도 포함한다 —
  // 폴더를 선택해서 다운로드하면 그 안의 모든 파일을 받아온다.
  const visibleEntryPaths = [...directFiles.map((f) => f.path), ...folderNames.map((name) => (currentDir ? `${currentDir}/${name}` : name))];
  const allVisibleSelected = visibleEntryPaths.length > 0 && visibleEntryPaths.every((p) => selectedPaths.has(p));

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
      for (const p of visibleEntryPaths) {
        if (allVisibleSelected) next.delete(p);
        else next.add(p);
      }
      return next;
    });
  }

  function handleDownloadSelected() {
    for (const path of selectedPaths) {
      const file = files.find((f) => f.path === path);
      if (file) {
        downloadFile(file.path, file.content);
        continue;
      }
      // files 중에 그 경로가 없으면 폴더로 보고, 그 안의 모든 실제 파일을 내려받는다.
      const folderPrefix = `${path}/`;
      for (const f of files) {
        if (f.path.startsWith(folderPrefix) && f.path.split("/").pop() !== KEEP_FILE) {
          downloadFile(f.path, f.content);
        }
      }
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

      {/* Breadcrumb — 파일을 여기로 드래그 앤 드롭하면 그 상위 폴더(또는 루트)로 옮겨진다. */}
      <div className="flex items-center gap-2 mb-5 text-sm flex-wrap">
        <button
          onClick={() => goToBreadcrumb(-1)}
          onDragOver={(e) => {
            if (draggingFileIds.length === 0) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDragEnter={() => draggingFileIds.length > 0 && setDragOverTarget("root")}
          onDragLeave={() => setDragOverTarget((cur) => (cur === "root" ? null : cur))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverTarget(null);
            const fileIds = getDraggedFileIds(e);
            setDraggingFileIds([]);
            if (fileIds.length > 0) void handleMoveFilesToFolder(fileIds, null);
          }}
          className="font-700 px-1.5 py-0.5"
          style={{
            color: currentDir ? "var(--primary)" : "var(--foreground)",
            borderRadius: "6px",
            background: dragOverTarget === "root" ? "var(--primary)" : "transparent",
            ...(dragOverTarget === "root" ? { color: "#fff" } : {}),
          }}
        >
          ⬡ 워크스페이스
        </button>
        {breadcrumbParts.map((part, i) => {
          const dirPath = breadcrumbParts.slice(0, i + 1).join("/");
          const isLast = i === breadcrumbParts.length - 1;
          return (
            <span key={i} className="flex items-center gap-2">
              <span style={{ color: "var(--muted-foreground)" }}>/</span>
              <button
                onClick={() => goToBreadcrumb(i)}
                onDragOver={(e) => {
                  if (draggingFileIds.length === 0 || isLast) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDragEnter={() => draggingFileIds.length > 0 && !isLast && setDragOverTarget(dirPath)}
                onDragLeave={() => setDragOverTarget((cur) => (cur === dirPath ? null : cur))}
                onDrop={(e) => {
                  if (isLast) return;
                  e.preventDefault();
                  setDragOverTarget(null);
                  const fileIds = getDraggedFileIds(e);
                  setDraggingFileIds([]);
                  if (fileIds.length > 0) void handleMoveFilesToFolder(fileIds, dirPath);
                }}
                className="font-700 px-1.5 py-0.5"
                style={{
                  color: isLast ? "var(--foreground)" : "var(--primary)",
                  borderRadius: "6px",
                  background: dragOverTarget === dirPath ? "var(--primary)" : "transparent",
                  ...(dragOverTarget === dirPath ? { color: "#fff" } : {}),
                }}
              >
                {part}
              </button>
            </span>
          );
        })}
      </div>

      <FolderSync selectedPaths={expandSelectedPaths(selectedPaths, files)} />

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
        <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>코드·문서 등 텍스트 파일부터 이미지·PDF·워드·엑셀·압축 파일까지, 파일당 최대 10MB</div>
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

      {/* 하위 폴더 그리드 — 폴더 카드가 없는 빈 곳도 드래그 박스 시작점으로 쓸 수 있게 여기도
          handleFileListMouseDown을 붙인다(파일 목록 쪽과 동일한 핸들러, 대상은 folderElsRef로 따로 추적). */}
      <div className="mb-6 pb-2" onMouseDown={handleFileListMouseDown}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-sm font-700">폴더</h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            {!creatingFolder && (
              <button
                onClick={() => setCreatingFolder(true)}
                className="text-xs font-700 px-3 py-1.5 transition-all"
                style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "20px" }}
              >
                + 새 폴더 만들기
              </button>
            )}
            {!creatingDocKind && (
              <>
                <button
                  onClick={() => {
                    setCreatingDocKind("rtdoc");
                    setNewDocName("");
                  }}
                  disabled={creatingDocOrSlides}
                  className="text-xs font-700 px-3 py-1.5 transition-all"
                  style={{ background: "#2563eb18", color: "#2563eb", borderRadius: "20px", opacity: creatingDocOrSlides ? 0.6 : 1 }}
                >
                  + 새 문서 만들기
                </button>
                <button
                  onClick={() => {
                    setCreatingDocKind("slides");
                    setNewDocName("");
                  }}
                  disabled={creatingDocOrSlides}
                  className="text-xs font-700 px-3 py-1.5 transition-all"
                  style={{ background: "#f0a50018", color: "#f0a500", borderRadius: "20px", opacity: creatingDocOrSlides ? 0.6 : 1 }}
                >
                  + 새 슬라이드 만들기
                </button>
              </>
            )}
          </div>
        </div>

        {creatingDocKind && (
          <div className="flex gap-2 mb-3">
            <input
              autoFocus
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateDocOrSlides()}
              placeholder={creatingDocKind === "rtdoc" ? "문서 이름 (예: 회의록)" : "슬라이드 이름 (예: 발표자료)"}
              className="flex-1 text-sm px-3 py-2 outline-none"
              style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--muted)" }}
            />
            <button
              onClick={handleCreateDocOrSlides}
              disabled={creatingDocOrSlides}
              className="text-xs font-700 px-4 py-2"
              style={{ borderRadius: "var(--radius-sm)", color: "#fff", background: "var(--primary)", opacity: creatingDocOrSlides ? 0.6 : 1 }}
            >
              {creatingDocOrSlides ? "만드는 중..." : "만들기"}
            </button>
            <button
              onClick={() => {
                setCreatingDocKind(null);
                setNewDocName("");
              }}
              className="text-xs font-600 px-3 py-2"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "var(--radius-sm)" }}
            >
              취소
            </button>
          </div>
        )}

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

        {(folderNames.length > 0 || currentDir) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {currentDir && (() => {
              const parentDir = breadcrumbParts.slice(0, -1).join("/") || null;
              const isDragOver = dragOverTarget === "..";
              return (
                <button
                  onClick={() => goToBreadcrumb(breadcrumbParts.length - 2)}
                  onDragOver={(e) => {
                    if (draggingFileIds.length === 0) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDragEnter={() => draggingFileIds.length > 0 && setDragOverTarget("..")}
                  onDragLeave={() => setDragOverTarget((cur) => (cur === ".." ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverTarget(null);
                    const fileIds = getDraggedFileIds(e);
                    setDraggingFileIds([]);
                    if (fileIds.length > 0) void handleMoveFilesToFolder(fileIds, parentDir);
                  }}
                  className="flex items-center gap-3 p-4 text-left transition-all"
                  style={{
                    background: isDragOver ? "var(--primary)" : "var(--card)",
                    borderRadius: "var(--radius)",
                    boxShadow: "var(--shadow-card)",
                    outline: isDragOver ? "2px dashed #fff" : "none",
                    outlineOffset: "-4px",
                  }}
                >
                  <div className="w-10 h-10 flex items-center justify-center text-lg shrink-0" style={{ background: "var(--secondary)", borderRadius: "10px" }}>⬆</div>
                  <div className="min-w-0">
                    <div className="text-sm font-700 truncate" style={{ color: isDragOver ? "#fff" : undefined }}>상위 폴더로</div>
                    <div className="text-xs" style={{ color: isDragOver ? "rgba(255,255,255,0.8)" : "var(--muted-foreground)" }}>
                      {isDragOver ? "여기로 놓으면 밖으로 빠져요" : "파일을 여기로 끌어오면 꺼내져요"}
                    </div>
                  </div>
                </button>
              );
            })()}
            {folderNames.map((name) => {
              const folderPath = currentDir ? `${currentDir}/${name}` : name;
              const isDragOver = dragOverTarget === folderPath;
              const isDraggingThis = draggingFolderName === name;
              const isChecked = selectedPaths.has(folderPath);
              // 측정 전(첫 렌더)에는 적당한 기본값을 쓰고, ResizeObserver가 한 번 돌고 나면
              // 실제 카드 크기의 정확히 25%(= 전체 1.5배)로 맞춰진다.
              const pad = folderHitZone.pad.get(name) ?? { x: 20, y: 20 };
              return (
                // 바깥쪽(히트 영역)은 음수 margin으로 실제 폴더 칸보다 정확히 1.5배 넓혀서, 카드
                // 사이 여백까지 드래그 박스 선택/드롭 대상이 되게 한다. 안쪽 padding으로 다시
                // 상쇄해서 보이는 폴더 카드 자체의 크기/위치는 그대로다.
                <div
                  key={name}
                  style={{
                    marginLeft: -pad.x,
                    marginRight: -pad.x,
                    marginTop: -pad.y,
                    marginBottom: -pad.y,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <div
                    ref={(el) => {
                      if (el) folderElsRef.current.set(name, el);
                      else folderElsRef.current.delete(name);
                    }}
                    onDragOver={(e) => {
                      if (draggingFileIds.length === 0 && !(draggingFolderName && draggingFolderName !== name)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDragEnter={() => {
                      if (draggingFileIds.length > 0 || (draggingFolderName && draggingFolderName !== name)) setDragOverTarget(folderPath);
                    }}
                    onDragLeave={() => setDragOverTarget((cur) => (cur === folderPath ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverTarget(null);
                      const payload = getDragPayload(e);
                      setDraggingFileIds([]);
                      setDraggingFolderName(null);
                      if (payload?.type === "files" && payload.ids.length > 0) {
                        void handleMoveFilesToFolder(payload.ids, folderPath);
                      } else if (payload?.type === "folder" && payload.name !== name) {
                        handleReorderFolders(payload.name, name);
                      }
                    }}
                    style={{ paddingLeft: pad.x, paddingRight: pad.x, paddingTop: pad.y, paddingBottom: pad.y }}
                  >
                    <div
                      ref={folderHitZone.getMeasureRef(name)}
                      className="flex items-center gap-2 transition-all p-4"
                      style={{
                        background: isDragOver ? "var(--primary)" : "var(--card)",
                        borderRadius: "var(--radius)",
                        boxShadow: "var(--shadow-card)",
                        outline: isDragOver ? "2px dashed #fff" : isChecked ? "2px solid var(--primary)" : "none",
                        outlineOffset: isDragOver ? "-4px" : "-2px",
                        opacity: isDraggingThis ? 0.5 : 1,
                      }}
                    >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleFile(folderPath)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  <span
                    draggable
                    onMouseDown={(e) => e.stopPropagation()}
                    onDragStart={(e) => {
                      setDraggingFolderName(name);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", JSON.stringify({ type: "folder", name }));
                    }}
                    onDragEnd={() => {
                      setDraggingFolderName(null);
                      setDragOverTarget(null);
                    }}
                    title="끌어서 순서 바꾸기"
                    className="shrink-0 flex items-center justify-center"
                    style={{ width: "14px", cursor: "grab", color: isDragOver ? "rgba(255,255,255,0.7)" : "var(--muted-foreground)", fontSize: "13px", letterSpacing: "-2px" }}
                  >
                    ⠿
                  </span>
                      <button onClick={() => openFolder(name)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <div className="w-10 h-10 flex items-center justify-center text-lg shrink-0" style={{ background: "var(--secondary)", borderRadius: "10px" }}>📁</div>
                        <div className="min-w-0">
                          <div className="text-sm font-700 truncate" style={{ color: isDragOver ? "#fff" : undefined }}>{name}</div>
                          <div className="text-xs" style={{ color: isDragOver ? "rgba(255,255,255,0.8)" : "var(--muted-foreground)" }}>
                            파일 {countRealFilesUnder(folderPath)}개
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
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
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <h2 className="text-sm font-700">파일{currentDir ? ` — ${currentDir}` : ""}</h2>
        {!selectedFile && (
          <div className="flex items-center gap-2.5">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={visibleEntryPaths.length === 0} />
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
      {!selectedFile && (
        <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
          💡 파일/폴더 칸 위를 그대로 드래그하면 네모 박스로 여러 개를 한번에 선택할 수 있어요 (이름을 눌러 열거나 ⠿ 손잡이로 옮기는 동작과는 구분돼요).
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* 파일 목록 — 행과 행 사이나 목록 아래 빈 공간을 드래그하면 네모 박스로 여러 파일을 한번에 선택할 수 있다. */}
        <div
          className={`${selectedFile ? "lg:col-span-2" : "lg:col-span-3"} flex flex-col gap-2 pb-10`}
          onMouseDown={handleFileListMouseDown}
        >
          {directFiles.map((f) => {
            const meta = getTypeMeta(f.path);
            const isSelected = selectedFileId === f.id;
            const isChecked = selectedPaths.has(f.path);
            const fileBranchCount = branchIdsByFile.get(f.id)?.size ?? 0;
            const name = f.path.slice(prefix.length);
            const uploaderName = memberNameById.get(f.lastEditorId ?? "") ?? "알 수 없음";
            const compact = !!selectedFile;
            const isDragging = draggingFileIds.includes(f.id);
            const isReorderTarget = dragOverFileId === f.id;
            // 측정 전(첫 렌더)에는 적당한 기본값을 쓰고, ResizeObserver가 한 번 돌고 나면 실제
            // 행 크기의 정확히 25%(= 전체 1.5배)로 맞춰진다 — 폴더 카드와 동일한 방식.
            const rowPad = fileHitZone.pad.get(f.id) ?? { x: 20, y: 20 };
            return (
              // 바깥쪽(히트 영역)은 음수 margin으로 실제 파일 행보다 정확히 1.5배 넓혀서, 행
              // 사이 여백까지 드래그 박스 선택/드롭 대상이 되게 한다(폴더 카드와 동일한 기법).
              // 안쪽 padding으로 다시 상쇄해서 보이는 파일 행 자체의 크기/위치는 그대로다.
              <div
                key={f.id}
                style={{ marginLeft: -rowPad.x, marginRight: -rowPad.x, marginTop: -rowPad.y, marginBottom: -rowPad.y, position: "relative", zIndex: 1 }}
              >
                <div
                  ref={(el) => {
                    if (el) rowElsRef.current.set(f.id, el);
                    else rowElsRef.current.delete(f.id);
                  }}
                  onDragOver={(e) => {
                    if (draggingFileIds.length === 0 || isDragging) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDragEnter={() => {
                    if (draggingFileIds.length > 0 && !isDragging) setDragOverFileId(f.id);
                  }}
                  onDragLeave={() => setDragOverFileId((cur) => (cur === f.id ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverFileId(null);
                    const ids = getDraggedFileIds(e);
                    setDraggingFileIds([]);
                    setDragOverTarget(null);
                    if (ids.length > 0) handleReorderFiles(ids, f.id);
                  }}
                  style={{ paddingLeft: rowPad.x, paddingRight: rowPad.x, paddingTop: rowPad.y, paddingBottom: rowPad.y }}
                >
                  <div
                    ref={fileHitZone.getMeasureRef(f.id)}
                    className={`flex items-center gap-3 transition-all ${compact ? "p-2.5" : "p-4"}`}
                    style={{
                      background: isSelected ? "var(--primary)" : "var(--card)",
                      color: isSelected ? "#fff" : "var(--foreground)",
                      boxShadow: isReorderTarget ? "inset 0 2px 0 var(--primary)" : "var(--shadow-card)",
                      borderRadius: "var(--radius)",
                      opacity: isDragging ? 0.5 : 1,
                      outline: isChecked ? "2px solid var(--primary)" : "none",
                      outlineOffset: "-2px",
                    }}
                  >
                {!compact && <input type="checkbox" checked={selectedPaths.has(f.path)} onChange={() => toggleFile(f.path)} className="shrink-0" />}
                {/* 옮기기/순서 변경 전용 손잡이 — 이 아이콘만 눌러서 끌면 파일 이동/정렬이 되고,
                    그 외 행 배경을 누르면 여러 파일 선택용 드래그 박스가 시작된다. */}
                <span
                  draggable
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => {
                    // 체크박스로 여러 파일을 선택해둔 채로 그중 하나를 끌면 선택된 전부를 함께 옮긴다.
                    const ids = selectedPaths.has(f.path) && selectedPaths.size > 1
                      ? directFilesAll.filter((file) => selectedPaths.has(file.path)).map((file) => file.id)
                      : [f.id];
                    setDraggingFileIds(ids);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", JSON.stringify({ type: "files", ids }));
                  }}
                  onDragEnd={() => {
                    setDraggingFileIds([]);
                    setDragOverTarget(null);
                    setDragOverFileId(null);
                  }}
                  title="끌어서 폴더로 옮기거나 순서 바꾸기"
                  className="shrink-0 flex items-center justify-center"
                  style={{ width: "16px", height: "100%", minHeight: "24px", cursor: "grab", color: isSelected ? "rgba(255,255,255,0.6)" : "var(--muted-foreground)", fontSize: "13px", letterSpacing: "-2px" }}
                >
                  ⠿
                </span>
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
                  {collabUsersFor(f.id).length > 0 && (
                    <span
                      className="text-xs font-700 px-2 py-0.5 shrink-0 flex items-center gap-1"
                      style={{ borderRadius: "20px", background: isSelected ? "rgba(255,255,255,0.25)" : "#22c55e18", color: isSelected ? "#fff" : "#22c55e" }}
                      title={collabUsersFor(f.id).map((u) => u.name).join(", ") + "님이 바로 수정 중"}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isSelected ? "#fff" : "#22c55e" }} />
                      바로 수정 중 {collabUsersFor(f.id).length}
                    </span>
                  )}
                </button>
                {isRichDocPath(f.path) || isSlidesPath(f.path) ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isRichDocPath(f.path)) setDocEditorFileId(f.id);
                      else setSlidesEditorFileId(f.id);
                    }}
                    title="바로 수정 — 실시간 공동편집으로 지금 바로 고치기"
                    className="w-7 h-7 flex items-center justify-center text-xs shrink-0"
                    style={{ borderRadius: "50%", background: isSelected ? "rgba(255,255,255,0.2)" : "var(--muted)", color: isSelected ? "#fff" : "var(--foreground)" }}
                  >
                    ✏️
                  </button>
                ) : isOfficeEditablePath(f.path) ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOfficeEditFileId(f.id);
                    }}
                    title="바로 수정 — 워드/엑셀/PPT 편집기로 지금 바로 고치기"
                    className="w-7 h-7 flex items-center justify-center text-xs shrink-0"
                    style={{ borderRadius: "50%", background: isSelected ? "rgba(255,255,255,0.2)" : "var(--muted)", color: isSelected ? "#fff" : "var(--foreground)" }}
                  >
                    ✏️
                  </button>
                ) : (
                  !isBinaryPath(f.path) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuickEditFileId(f.id);
                    }}
                    title="바로 수정 — 폴더 연동 없이 지금 바로 고치기"
                    className="w-7 h-7 flex items-center justify-center text-xs shrink-0"
                    style={{ borderRadius: "50%", background: isSelected ? "rgba(255,255,255,0.2)" : "var(--muted)", color: isSelected ? "#fff" : "var(--foreground)" }}
                  >
                    ✏️
                  </button>
                  )
                )}
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
                </div>
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
          {selectBoxRect &&
            createPortal(
              <div
                className="fixed pointer-events-none"
                style={{
                  left: selectBoxRect.left,
                  top: selectBoxRect.top,
                  width: selectBoxRect.width,
                  height: selectBoxRect.height,
                  background: "rgba(61, 82, 213, 0.15)",
                  border: "1.5px solid var(--primary)",
                  borderRadius: "4px",
                  zIndex: 9999,
                }}
              />,
              document.body,
            )}
        </div>

        {/* 버전 이력 / 댓글 패널 */}
        <div className={selectedFile ? "lg:col-span-3" : "lg:col-span-2"}>
          {selectedFile ? (
            <div className="p-5" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <h3 className="text-sm font-700 leading-snug break-all">{selectedFile.path}</h3>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => prevFile && setSelectedFileId(prevFile.id)}
                    disabled={!prevFile}
                    title={prevFile ? `이전 파일: ${prevFile.path.split("/").pop()}` : "이전 파일 없음"}
                    className="text-xs font-600 px-2 py-1"
                    style={{ borderRadius: "8px", background: "var(--muted)", color: "var(--muted-foreground)", opacity: prevFile ? 1 : 0.4 }}
                  >
                    ◀ 이전
                  </button>
                  <button
                    onClick={() => nextFile && setSelectedFileId(nextFile.id)}
                    disabled={!nextFile}
                    title={nextFile ? `다음 파일: ${nextFile.path.split("/").pop()}` : "다음 파일 없음"}
                    className="text-xs font-600 px-2 py-1"
                    style={{ borderRadius: "8px", background: "var(--muted)", color: "var(--muted-foreground)", opacity: nextFile ? 1 : 0.4 }}
                  >
                    다음 ▶
                  </button>
                </div>
              </div>
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
                    {isRichDocPath(selectedFile.path) || isSlidesPath(selectedFile.path) ? (
                      <button
                        onClick={() => {
                          if (isRichDocPath(selectedFile.path)) setDocEditorFileId(selectedFile.id);
                          else setSlidesEditorFileId(selectedFile.id);
                        }}
                        title="바로 수정 — 실시간 공동편집으로 지금 바로 고치기"
                        className="w-9 shrink-0 flex items-center justify-center text-sm"
                        style={{ borderRadius: "10px", border: "2px solid var(--border)", color: "var(--foreground)", background: "transparent" }}
                      >
                        ✏️
                      </button>
                    ) : isOfficeEditablePath(selectedFile.path) ? (
                      <button
                        onClick={() => setOfficeEditFileId(selectedFile.id)}
                        title="바로 수정 — 워드/엑셀/PPT 편집기로 지금 바로 고치기"
                        className="w-9 shrink-0 flex items-center justify-center text-sm"
                        style={{ borderRadius: "10px", border: "2px solid var(--border)", color: "var(--foreground)", background: "transparent" }}
                      >
                        ✏️
                      </button>
                    ) : (
                      !isBinaryContent(selectedFile.content) && (
                        <button
                          onClick={() => setQuickEditFileId(selectedFile.id)}
                          title="바로 수정 — 폴더 연동 없이 지금 바로 고치기"
                          className="w-9 shrink-0 flex items-center justify-center text-sm"
                          style={{ borderRadius: "10px", border: "2px solid var(--border)", color: "var(--foreground)", background: "transparent" }}
                        >
                          ✏️
                        </button>
                      )
                    )}
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

                  {/* 핀 — 눌러서 그 버전(페이지)으로 바로 이동, ✏️는 그 핀 기준 바로 수정,
                      ×는 삭제. 보기 방식(페이지/버전트리)과 무관하게 항상 보인다. */}
                  {pins.length > 0 && (
                    <div className="flex gap-1.5 mb-3 flex-wrap">
                      {pins.map((p) => (
                        <span key={p.id} className="flex items-center gap-1 text-xs font-600 pl-2.5 pr-1.5 py-1" style={{ borderRadius: "20px", background: "#8b5cf618", color: "#8b5cf6" }}>
                          <button onClick={() => handleJumpToVersion(p.versionId)} title="이 핀의 버전으로 이동">
                            📌 {p.label}
                          </button>
                          {!isBinaryContent(versionsById.get(p.versionId)?.content ?? "") && (
                            <button
                              onClick={() => setQuickEditPin({ pinId: p.id, label: p.label })}
                              title="이 핀 기준으로 바로 수정"
                              className="w-4 h-4 flex items-center justify-center rounded-full"
                            >
                              ✏️
                            </button>
                          )}
                          <button onClick={() => handleDeletePin(p.id)} title="핀 삭제" className="w-4 h-4 flex items-center justify-center rounded-full">
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {viewMode === "simple" ? (
                    <div className="overflow-auto max-h-80">
                      <VersionPageFlip
                        versions={versions}
                        currentVersionId={selectedFile.currentVersionId}
                        memberNameById={memberNameById}
                        onPromote={(versionId) => handlePromote(selectedFile.id, versionId)}
                        onShowFull={setFullTextVersion}
                        onViewingVersionChange={setPageFlipVersionId}
                        jumpTo={pageJumpRequest}
                        path={selectedFile.path}
                      />
                    </div>
                  ) : (
                    <>
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
                              path={selectedFile.path}
                            />
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* 파일 전체 댓글 / 지금 보고 있는 버전(페이지)의 댓글만 보기 전환 */}
                  <div className="flex gap-1 p-0.5 self-start" style={{ background: "var(--muted)", borderRadius: "20px" }}>
                    {([[false, `전체 ${comments.length}`], [true, `${viewingVersionId ? viewingVersionLabel : "이 버전"} ${comments.filter((c) => c.versionId === viewingVersionId).length}`]] as const).map(
                      ([val, label]) => (
                        <button
                          key={String(val)}
                          onClick={() => setCommentFilterVersion(val)}
                          disabled={val && !viewingVersionId}
                          className="text-xs font-600 px-2.5 py-1 transition-all"
                          style={{
                            background: commentFilterVersion === val ? "var(--card)" : "transparent",
                            color: commentFilterVersion === val ? "var(--primary)" : "var(--muted-foreground)",
                            borderRadius: "16px",
                            boxShadow: commentFilterVersion === val ? "var(--shadow-card)" : "none",
                            opacity: val && !viewingVersionId ? 0.5 : 1,
                          }}
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </div>

                  {(commentFilterVersion ? comments.filter((c) => c.versionId === viewingVersionId) : comments).map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700 shrink-0" style={{ background: "var(--secondary)", color: "var(--primary)" }}>
                        {(memberNameById.get(c.authorId) ?? "?").slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-700">{memberNameById.get(c.authorId) ?? c.authorId}</span>
                          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{formatDate(c.createdAt)}</span>
                          {c.versionId && (
                            <span className="text-xs px-1.5 py-0.5 font-600 shrink-0" style={{ borderRadius: "4px", background: "#8b5cf618", color: "#8b5cf6" }}>
                              📌 버전 댓글{c.versionId === selectedFile?.currentVersionId ? " · 현재" : ""}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5 leading-relaxed px-3 py-2" style={{ background: "var(--muted)", borderRadius: "10px" }}>{c.content}</p>
                      </div>
                    </div>
                  ))}
                  {(commentFilterVersion ? comments.filter((c) => c.versionId === viewingVersionId) : comments).length === 0 && (
                    <div className="text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>
                      {commentFilterVersion ? "이 버전에 남긴 댓글이 없어요." : "아직 댓글이 없어요. 첫 코멘트를 남겨보세요."}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 mt-1">
                    {viewingVersionId && (
                      <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        <input type="checkbox" checked={commentTargetVersion} onChange={(e) => setCommentTargetVersion(e.target.checked)} />
                        {viewingVersionLabel}에 댓글 남기기 (끄면 파일 전체 댓글)
                      </label>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddComment(commentTargetVersion && viewingVersionId ? viewingVersionId : undefined)}
                        placeholder={commentTargetVersion && viewingVersionId ? `${viewingVersionLabel}에 코멘트 남기기...` : "이 파일에 코멘트 남기기..."}
                        className="flex-1 text-xs px-3 py-2 outline-none"
                        style={{ background: "var(--muted)", borderRadius: "20px" }}
                      />
                      <button
                        onClick={() => handleAddComment(commentTargetVersion && viewingVersionId ? viewingVersionId : undefined)}
                        disabled={!commentDraft.trim()}
                        className="px-3 text-xs font-700 shrink-0"
                        style={{ borderRadius: "20px", color: "#fff", background: "var(--primary)", opacity: commentDraft.trim() ? 1 : 0.4 }}
                      >
                        등록
                      </button>
                    </div>
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

      {fullTextVersion && (() => {
        // 전문 보기 안에서도 페이지 넘기듯 이전/다음 버전으로 바로 이동할 수 있게 — "페이지"
        // 보기(VersionPageFlip)와 같은 기준(시간순)으로 순서를 매긴다.
        const chronological = [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const fullTextIndex = chronological.findIndex((v) => v.id === fullTextVersion.id);
        const prevVersion = fullTextIndex > 0 ? chronological[fullTextIndex - 1] : null;
        const nextVersion = fullTextIndex >= 0 && fullTextIndex < chronological.length - 1 ? chronological[fullTextIndex + 1] : null;

        return (
        <div
          onClick={() => setFullTextVersion(null)}
          className="fixed inset-0 flex items-center justify-center z-50 p-6"
          style={{ background: "rgba(15,23,42,0.5)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl h-[90vh] flex flex-col"
            style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.28)" }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <div className="text-sm font-700">전문 보기</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {memberNameById.get(fullTextVersion.authorId) ?? fullTextVersion.authorId} · {formatDate(fullTextVersion.createdAt)}
                  {fullTextIndex >= 0 && ` · ${fullTextIndex + 1} / ${chronological.length}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isBinaryContent(fullTextVersion.content) && !isSnapshotContent(fullTextVersion.content) && (
                  <button
                    onClick={() => downloadFile(selectedFile?.path ?? "file", fullTextVersion.content)}
                    className="text-xs font-700 px-3 py-1.5"
                    style={{ borderRadius: "20px", background: "var(--primary)", color: "#fff" }}
                  >
                    다운로드
                  </button>
                )}
                {isSnapshotContent(fullTextVersion.content) && selectedFile && (
                  <button
                    onClick={() => {
                      setFullTextVersion(null);
                      if (isRichDocPath(selectedFile.path)) setDocEditorFileId(selectedFile.id);
                      else if (isSlidesPath(selectedFile.path)) setSlidesEditorFileId(selectedFile.id);
                    }}
                    className="text-xs font-700 px-3 py-1.5"
                    style={{ borderRadius: "20px", background: "var(--primary)", color: "#fff" }}
                  >
                    바로 수정
                  </button>
                )}
                <button
                  onClick={() => setFullTextVersion(null)}
                  className="w-8 h-8 flex items-center justify-center text-lg"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
                >
                  ×
                </button>
              </div>
            </div>
            {fullTextPptxCompare.applicable ? (
              !fullTextPptxCompare.ready ? (
                <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                  슬라이드 내용 불러오는 중...
                </div>
              ) : (
                <div
                  className="flex-1 overflow-auto text-xs whitespace-pre-wrap p-4"
                  style={{ color: "var(--foreground)", fontFamily: "var(--font-jetbrains)" }}
                >
                  <DiffLinesView lines={buildFullTextDiff(fullTextPptxCompare.parentText, fullTextPptxCompare.text)} highlightOnDark={false} />
                </div>
              )
            ) : isBinaryContent(fullTextVersion.content) ? (
              fullTextVersion.content.startsWith("data:image/") ? (
                <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                  <img src={fullTextVersion.content} alt="전문 미리보기" className="max-w-full max-h-full object-contain" />
                </div>
              ) : isSnapshotContent(fullTextVersion.content) ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <span>문서/슬라이드는 여기서 바로 볼 수 없어요.</span>
                  <span>위의 "바로 수정" 버튼으로 최신 내용을 확인해주세요.</span>
                </div>
              ) : selectedFile && isOfficePreviewablePath(selectedFile.path) ? (
                <div className="flex-1 overflow-auto p-4">
                  <OfficePreview path={selectedFile.path} content={fullTextVersion.content} />
                </div>
              ) : selectedFile && isZipPath(selectedFile.path) ? (
                <div className="flex-1 overflow-auto text-xs p-4" style={{ fontFamily: "var(--font-jetbrains)" }}>
                  <ZipEntriesList content={fullTextVersion.content} />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <span>이미지가 아닌 파일이라 화면에서 바로 볼 수 없어요.</span>
                  <span>위의 "다운로드" 버튼으로 받아서 확인해주세요.</span>
                </div>
              )
            ) : (
              <div
                className="flex-1 overflow-auto text-xs whitespace-pre-wrap p-4"
                style={{ color: "var(--foreground)", fontFamily: "var(--font-jetbrains)" }}
              >
                <DiffLinesView
                  lines={buildFullTextDiff(
                    (fullTextVersion.parentVersionId ? versionsById.get(fullTextVersion.parentVersionId)?.content : undefined) ?? "",
                    fullTextVersion.content,
                  )}
                  highlightOnDark={false}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={() => prevVersion && setFullTextVersion(prevVersion)}
                disabled={!prevVersion}
                className="text-xs font-700 px-3 py-1.5"
                style={{ borderRadius: "20px", background: "var(--muted)", color: prevVersion ? "var(--foreground)" : "var(--muted-foreground)", opacity: prevVersion ? 1 : 0.5 }}
              >
                ← 이전 페이지
              </button>
              <button
                onClick={() => nextVersion && setFullTextVersion(nextVersion)}
                disabled={!nextVersion}
                className="text-xs font-700 px-3 py-1.5"
                style={{ borderRadius: "20px", background: "var(--muted)", color: nextVersion ? "var(--foreground)" : "var(--muted-foreground)", opacity: nextVersion ? 1 : 0.5 }}
              >
                다음 페이지 →
              </button>
            </div>
          </div>
        </div>
        );
      })()}

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

      {quickEditFileId &&
        currentMember?.userId &&
        (() => {
          const target = files.find((f) => f.id === quickEditFileId);
          if (!target) return null;
          return (
            <QuickEditModal
              projectId={project.id}
              fileId={target.id}
              filePath={target.path}
              myUserId={currentMember.userId}
              myName={currentMember.name}
              onClose={async () => {
                setQuickEditFileId(null);
                await refresh();
                await refreshVersionsAndPins();
              }}
            />
          );
        })()}

      {quickEditPin &&
        selectedFile &&
        currentMember?.userId &&
        (() => {
          if (isBinaryContent(selectedFile.content)) return null;
          return (
            <QuickEditModal
              projectId={project.id}
              fileId={selectedFile.id}
              filePath={selectedFile.path}
              pinId={quickEditPin.pinId}
              pinLabel={quickEditPin.label}
              myUserId={currentMember.userId}
              myName={currentMember.name}
              onClose={async () => {
                setQuickEditPin(null);
                await refresh();
                await refreshVersionsAndPins();
              }}
            />
          );
        })()}

      {docEditorFileId &&
        currentMember?.userId &&
        (() => {
          const target = files.find((f) => f.id === docEditorFileId);
          if (!target) return null;
          return (
            <DocEditorModal
              projectId={project.id}
              fileId={target.id}
              filePath={target.path}
              myUserId={currentMember.userId}
              myName={currentMember.name}
              onClose={async () => {
                setDocEditorFileId(null);
                await refresh();
              }}
            />
          );
        })()}

      {slidesEditorFileId &&
        currentMember?.userId &&
        (() => {
          const target = files.find((f) => f.id === slidesEditorFileId);
          if (!target) return null;
          return (
            <SlidesEditorModal
              projectId={project.id}
              fileId={target.id}
              filePath={target.path}
              myUserId={currentMember.userId}
              myName={currentMember.name}
              onClose={async () => {
                setSlidesEditorFileId(null);
                await refresh();
              }}
            />
          );
        })()}

      {officeEditFileId &&
        (() => {
          const target = files.find((f) => f.id === officeEditFileId);
          if (!target) return null;
          return (
            <OfficeEditModal
              projectId={project.id}
              fileId={target.id}
              filePath={target.path}
              onClose={async () => {
                setOfficeEditFileId(null);
                await refresh();
              }}
            />
          );
        })()}
    </div>
  );
}
