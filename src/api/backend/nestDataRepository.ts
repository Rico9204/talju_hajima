import { apiClient } from "./client";
import type { DataRepository } from "../dataRepository";
import { summarizeEvaluations } from "../../lib/evaluationSummary";
import type {
  Project,
  NewProjectInput,
  TeamData,
  Member,
  Folder,
  WorkspaceFile,
  FileVersion,
  FileComment,
  Task,
  NewTaskInput,
  TaskStatus,
  TaskPriority,
  ChecklistItem,
  TaskComment,
  TaskCommentReaction,
  ScheduleEvent,
  NewScheduleEventInput,
  ScheduleEventType,
  ChatMessage,
  ChatReaction,
  ProfileLink,
  BoardPost,
  BoardComment,
  BoardAttachment,
  BoardPoll,
  BoardPostReport,
  AdminDocType,
  MyAdminApplication,
  EvaluationPhase,
  EvaluationEntry,
  PeerEvaluationRecord,
  EvaluationData,
  EvaluationScoreMethod,
  EvaluationPercentiles,
} from "../types";

// ============================================================================
// 실제 NestJS 백엔드(제품개발/backend)를 이 앱(talju_hajima-main)의 DataRepository
// 인터페이스에 맞춰 연결하는 구현체. 원래 이 인터페이스는 Supabase 모델(숫자 id, 1단계 폴더,
// 선형 버전 목록 등)을 기준으로 설계돼 있어서, 실제 백엔드(UUID, 경로 기반 폴더, 분기형 버전
// 이력)와는 모양이 다르다 — 아래 각 함수가 그 차이를 메꾸는 매핑 계층. 자세한 설계 결정과
// 한계는 talju_hajima_이식기록.txt 참고.
// ============================================================================

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const COLOR_PALETTE = ["#3d52d5", "#f0a500", "#22c55e", "#8b5cf6", "#6b7280", "#2563eb", "#ef4444", "#06b6d4"];

// 이 백엔드엔 아직 진짜 실시간 pub/sub(웹소켓)이 없는 영역들(작업/일정/프레즌스/채팅그룹 멤버 등)
// — 대신 주기적으로 다시 불러와서 "거의 실시간"처럼 보이게 한다. Workspace의 DATA_REFRESH_POLL_MS
// (5초)와 같은 값으로 맞춤.
const DATA_REFRESH_POLL_MS = 5000;
function colorForName(name: string): string {
  return COLOR_PALETTE[hashId(name) % COLOR_PALETTE.length];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatSize(content: string): string {
  const bytes = new Blob([content]).size;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const EXT_TYPE: Record<string, WorkspaceFile["type"]> = {
  pdf: "pdf",
  doc: "doc",
  docx: "doc",
  ppt: "ppt",
  pptx: "ppt",
  xls: "xls",
  xlsx: "xls",
  zip: "zip",
  png: "img",
  jpg: "img",
  jpeg: "img",
  gif: "img",
  svg: "img",
};
const UPLOAD_BINARY_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "hwp", "hwpx", "zip",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico",
]);

// uploadFile이 받는 브라우저 File 객체를 저장용 문자열로 읽는다 — 텍스트 확장자는 그대로
// 텍스트로, 이미지/문서/압축 등은 원본 바이트가 안 깨지게 data: URL(base64)로 읽는다
// (Workspace.tsx의 readFileForUpload와 같은 방식 — 거긴 로컬 비공개 함수라 여기 따로 둠).
function readFileContentForUpload(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!UPLOAD_BINARY_EXTENSIONS.has(ext)) return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function fileType(path: string): WorkspaceFile["type"] {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPE[ext] ?? "doc";
}

// 프로젝트 메타(소속/기간/시작·종료일) — 백엔드에 전용 컬럼이 없어서 description 필드에
// JSON으로 얹어 보관한다. 이 마커 없이 그냥 텍스트만 있는 description(다른 앱에서 만든
// 프로젝트 등)은 그 텍스트를 org로만 보여줌.
const EXTRA_MARKER = "talju_extra_v1:";
interface ProjectExtras {
  org: string;
  period: string;
  startDate?: string;
  endDate?: string;
}
function encodeExtras(extras: ProjectExtras): string {
  return EXTRA_MARKER + JSON.stringify(extras);
}
function decodeExtras(description: string | null): ProjectExtras {
  if (description && description.startsWith(EXTRA_MARKER)) {
    try {
      return JSON.parse(description.slice(EXTRA_MARKER.length));
    } catch {
      // fall through
    }
  }
  return { org: description ?? "", period: "" };
}

interface RawProject {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  completedAt: string | null;
  createdAt: string;
}
interface RawAdminApplication {
  id: string;
  userId: string;
  org: string;
  jobTitle: string;
  contact: string;
  docType: string;
  docName: string;
  docSize: number;
  docDeleted: boolean;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
function toMyAdminApplication(raw: RawAdminApplication): MyAdminApplication {
  return {
    id: raw.id,
    status: raw.status,
    org: raw.org,
    jobTitle: raw.jobTitle,
    docType: raw.docType as AdminDocType,
    docName: raw.docName,
    submittedAt: raw.createdAt,
    reviewedAt: raw.reviewedAt,
    reviewNote: raw.reviewNote,
  };
}

function toProject(raw: RawProject): Project {
  const extras = decodeExtras(raw.description);
  return {
    id: raw.id,
    name: raw.name,
    org: extras.org,
    period: extras.period,
    status: raw.completedAt ? "done" : "active",
    startDate: extras.startDate,
    endDate: extras.endDate,
    approvalStatus: raw.approvalStatus ?? "approved",
    completedAt: raw.completedAt ?? undefined,
  };
}

interface RawMember {
  id: string;
  userId: string;
  role: "owner" | "vice_leader" | "member";
  user: {
    id: string;
    email: string;
    name: string;
    trustScore: number | null;
    school: string | null;
    major: string | null;
    student: string | null;
    contact: string | null;
    bannerColor: string | null;
    bannerImageUrl: string | null;
    avatarUrl: string | null;
    links: ProfileLink[];
  };
}
// 최종 평가(phase=final) 평균 — 팀원 전원이 제출을 마쳐야 공개되므로, 아직 안 모였으면
// undefined(= evalCount 0, "평가 대기" 표시)로 둔다.
interface MemberFinalAverage {
  score: number;
  count: number;
  criteria: { role: number; deadline: number; communication: number; collaboration: number; quality: number };
}
function toMember(raw: RawMember, finalAverage?: MemberFinalAverage): Member {
  return {
    id: raw.id,
    userId: raw.userId,
    name: raw.user.name,
    role: raw.role === "owner" ? "팀장" : raw.role === "vice_leader" ? "부팀장" : "팀원",
    school: raw.user.school ?? "",
    major: raw.user.major ?? "",
    student: raw.user.student ?? "",
    contact: raw.user.contact ?? "",
    bannerColor: raw.user.bannerColor,
    bannerImageUrl: raw.user.bannerImageUrl,
    links: raw.user.links ?? [],
    avatar: raw.user.name.slice(0, 1) || "?",
    avatarUrl: raw.user.avatarUrl,
    tasks: { done: 0, total: 0 },
    activities: 0,
    score: finalAverage?.score ?? raw.user.trustScore ?? 0,
    evalCount: finalAverage?.count ?? 0,
    online: false,
    responsibilities: [],
    color: colorForName(raw.user.name),
    criteriaScores: finalAverage?.criteria ?? { role: 0, deadline: 0, communication: 0, collaboration: 0, quality: 0 },
    isLeader: raw.role === "owner",
    // 아래 필드들은 backend/(NestJS)가 아직 지원하지 않는, main 쪽에서 나중에 늘어난 항목들 —
    // 타입만 맞춰두고 기본값으로 둔다(5단계: dataRepository 통합 때 실제 값 연결 예정).
    org: null,
    backgroundColor: null,
    backgroundGradient: null,
    backgroundImageUrl: null,
    glassOpacity: null,
    glassBlur: null,
    isViceLeader: raw.role === "vice_leader",
    lastSeenAt: null,
    tasksViewedAt: null,
    scheduleViewedAt: null,
    workspaceViewedAt: null,
  };
}

interface RawProjectFile {
  id: string;
  projectId: string;
  path: string;
  content: string;
  currentVersionId: string | null;
  lastEditorId: string | null;
  tag: string | null;
  createdAt: string;
  updatedAt: string;
}
interface RawFileVersion {
  id: string;
  fileId: string;
  parentVersionId: string | null;
  authorId: string;
  content: string;
  note: string | null;
  createdAt: string;
}
interface RawFileComment {
  id: string;
  fileId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

const KEEP_FILE = ".keep";
function splitPath(path: string): { folderName: string | null; fileName: string } {
  const slash = path.indexOf("/");
  if (slash === -1) return { folderName: null, fileName: path };
  return { folderName: path.slice(0, slash), fileName: path.slice(slash + 1) };
}

// 숫자 id <-> 실제 UUID/경로 매핑 레지스트리. talju 쪽 인터페이스가 파일/폴더에 number id를
// 기대하기 때문에(백엔드는 UUID), 처음 보는 항목마다 순번을 붙여서 기억해둔다. 세션 동안만
// 유지되면 충분(새로고침하면 다시 1번부터 채워지고, 어차피 매번 목록을 새로 불러오므로 문제 없음).
let nextFolderId = 1;
const folderKeyToId = new Map<string, number>();
const folderIdToKey = new Map<number, string>();
function numericFolderId(projectId: string, name: string): number {
  const key = `${projectId} ${name}`;
  let id = folderKeyToId.get(key);
  if (id === undefined) {
    id = nextFolderId++;
    folderKeyToId.set(key, id);
    folderIdToKey.set(id, key);
  }
  return id;
}
function folderNameForId(id: number): string | null {
  const key = folderIdToKey.get(id);
  if (!key) return null;
  return key.slice(key.indexOf(" ") + 1);
}
function folderProjectIdForId(id: number): string | null {
  const key = folderIdToKey.get(id);
  if (!key) return null;
  return key.slice(0, key.indexOf(" "));
}

interface FileMeta {
  uuid: string;
  projectId: string;
  path: string;
  currentVersionId: string | null;
}
let nextFileId = 1;
const fileUuidToId = new Map<string, number>();
const fileMetaById = new Map<number, FileMeta>();
function registerFile(raw: RawProjectFile): number {
  let id = fileUuidToId.get(raw.id);
  if (id === undefined) {
    id = nextFileId++;
    fileUuidToId.set(raw.id, id);
  }
  fileMetaById.set(id, { uuid: raw.id, projectId: raw.projectId, path: raw.path, currentVersionId: raw.currentVersionId });
  return id;
}

// 버전도 파일과 마찬가지로 UUID <-> 숫자 id 양방향 매핑이 필요하다(promoteFileVersion/
// pinFileVersion/downloadFileVersion이 숫자 id를 받아서 실제 백엔드 UUID로 다시 호출해야 함).
interface VersionMeta {
  uuid: string;
  fileId: number;
}
let nextVersionId = 1;
const versionUuidToId = new Map<string, number>();
const versionMetaById = new Map<number, VersionMeta>();
function registerVersion(uuid: string, fileId: number): number {
  let id = versionUuidToId.get(uuid);
  if (id === undefined) {
    id = nextVersionId++;
    versionUuidToId.set(uuid, id);
  }
  versionMetaById.set(id, { uuid, fileId });
  return id;
}

async function memberNameMap(projectId: string): Promise<Map<string, { name: string; avatar: string }>> {
  const { data } = await apiClient.get<RawMember[]>(`/projects/${projectId}/members`);
  const map = new Map<string, { name: string; avatar: string }>();
  for (const m of data) map.set(m.userId, { name: m.user.name, avatar: m.user.name.slice(0, 1) || "?" });
  return map;
}

// userId -> RawMember(전체) — 과제 담당자/댓글 작성자/채팅 발신자를 member id로 바꿔야 할 때 씀
// (talju 모델은 사람을 프로젝트별 membership id로 가리키지, 계정 userId로 가리키지 않음).
async function membersByUserId(projectId: string): Promise<Map<string, RawMember>> {
  const { data } = await apiClient.get<RawMember[]>(`/projects/${projectId}/members`);
  return new Map(data.map((m) => [m.userId, m]));
}

// 숫자 id <-> UUID 매핑의 범용 버전(폴더 전용 registry와 같은 방식). 과제/체크리스트/댓글/채팅
// 메시지/일정처럼 "목록 조회 시 UUID를 받아서 매번 같은 number로 되돌려줘야 하고, 나중에 그
// number로 다시 쓰기 요청이 들어올 수 있는" 모든 항목에 재사용한다.
function makeIdRegistry() {
  let next = 1;
  const uuidToId = new Map<string, number>();
  const idToUuid = new Map<number, string>();
  return {
    toNumber(uuid: string): number {
      let id = uuidToId.get(uuid);
      if (id === undefined) {
        id = next++;
        uuidToId.set(uuid, id);
        idToUuid.set(id, uuid);
      }
      return id;
    },
    toUuid(id: number): string | undefined {
      return idToUuid.get(id);
    },
  };
}
const taskIds = makeIdRegistry();
const checklistItemIds = makeIdRegistry();
const taskCommentIds = makeIdRegistry();
const messageIds = makeIdRegistry();
const scheduleEventIds = makeIdRegistry();
const boardPostIds = makeIdRegistry();
const boardCommentIds = makeIdRegistry();
const boardPollIds = makeIdRegistry();
const boardPollOptionIds = makeIdRegistry();
const boardAttachmentIds = makeIdRegistry();
const boardReportIds = makeIdRegistry();
// updateScheduleEvent/removeScheduleEvent가 PATCH/DELETE 경로에 필요한 projectId를 다시
// 안 물어봐도 되도록, listScheduleEvents/addScheduleEvent에서 매핑할 때 같이 기억해둔다.
const scheduleEventProjectById = new Map<number, string>();
// updateTaskDetails가 담당자를 바꿀 때 다시 project를 물어보지 않아도 되도록, 과제를 한 번이라도
// 목록/생성으로 봤으면 여기 기억해둔다.
const taskProjectById = new Map<number, string>();

const STATUS_TO_TALJU: Record<string, TaskStatus> = { todo: "todo", in_progress: "inprogress", review: "review", done: "done" };
const STATUS_FROM_TALJU: Record<TaskStatus, string> = { todo: "todo", inprogress: "in_progress", review: "review", done: "done" };

interface RawTask {
  id: string;
  projectId: string;
  title: string;
  assigneeId: string | null;
  assignee: { id: string; name: string; email: string } | null;
  priority: TaskPriority;
  dueDate: string | null;
  tags: string[];
  status: string;
  teamScheduleEventId: string | null;
  personalScheduleEventId: string | null;
  createdAt: string;
  updatedAt: string;
}
interface RawChecklistItem {
  id: string;
  taskId: string;
  text: string;
  done: boolean;
}
interface RawTaskComment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: string;
}
interface RawTaskCommentReaction {
  id: string;
  commentId: string;
  userId: string;
  emoji: string;
}

async function toTask(raw: RawTask, members: Map<string, RawMember>): Promise<Task> {
  const id = taskIds.toNumber(raw.id);
  taskProjectById.set(id, raw.projectId);
  const assigneeMember = raw.assigneeId ? [...members.values()].find((m) => m.userId === raw.assigneeId) : undefined;
  const assigneeIds = assigneeMember ? [assigneeMember.id] : [];
  const avatar = assigneeMember?.user.name.slice(0, 1) || "?";

  const [{ data: rawChecklist }, rawComments] = await Promise.all([
    apiClient.get<RawChecklistItem[]>(`/tasks/${raw.id}/checklist`),
    apiClient.get<(RawTaskComment & { reactions: RawTaskCommentReaction[] })[]>(`/tasks/${raw.id}/comments`),
  ]);

  const checklist: ChecklistItem[] = rawChecklist.map((c) => ({
    id: checklistItemIds.toNumber(c.id),
    text: c.text,
    done: c.done,
  }));

  const comments: TaskComment[] = rawComments.data.map((c) => {
    const author = [...members.values()].find((m) => m.userId === c.authorId);
    return {
      id: taskCommentIds.toNumber(c.id),
      author: author?.user.name ?? "알 수 없음",
      avatar: author?.user.name.slice(0, 1) || "?",
      date: formatDate(c.createdAt),
      text: c.content,
      memberId: author?.id ?? null,
      reactions: c.reactions.map((r): TaskCommentReaction => ({
        commentId: taskCommentIds.toNumber(r.commentId),
        memberId: [...members.values()].find((m) => m.userId === r.userId)?.id ?? r.userId,
        emoji: r.emoji,
      })),
    };
  });

  return {
    id,
    title: raw.title,
    assignee: assigneeIds[0] ?? "",
    avatar,
    priority: raw.priority,
    due: raw.dueDate ?? "",
    tags: raw.tags,
    status: STATUS_TO_TALJU[raw.status] ?? "todo",
    color: colorForName(raw.title),
    assigneeIds,
    checklist,
    comments,
    teamScheduleEventId: raw.teamScheduleEventId ? scheduleEventIds.toNumber(raw.teamScheduleEventId) : null,
    personalScheduleEventId: raw.personalScheduleEventId ? scheduleEventIds.toNumber(raw.personalScheduleEventId) : null,
  };
}

interface RawChatMessage {
  id: string;
  projectId: string;
  channelId: string;
  senderId: string;
  text: string | null;
  fileId: string | null;
  createdAt: string;
  readBy: string[];
  reactions: { userId: string; emoji: string }[];
}

// talju 쪽은 사람을 member id로 가리키므로 "dm:<memberA>:<memberB>" 형태지만, 백엔드
// chat.service.ts의 dmChannelId()는 계정 userId 기준 "dm:<userA>:<userB>"를 기대한다.
function toBackendChannelId(channelId: string, members: Map<string, RawMember>): string {
  if (!channelId.startsWith("dm:")) return channelId;
  const [a, b] = channelId.slice(3).split(":");
  const memberList = [...members.values()];
  const userA = memberList.find((m) => m.id === a)?.userId ?? a;
  const userB = memberList.find((m) => m.id === b)?.userId ?? b;
  return `dm:${[userA, userB].sort().join(":")}`;
}

function toMessage(raw: RawChatMessage, members: Map<string, RawMember>, channelId: string): ChatMessage {
  const memberList = [...members.values()];
  const memberIdFor = (userId: string) => memberList.find((m) => m.userId === userId)?.id ?? userId;
  const id = messageIds.toNumber(raw.id);
  return {
    id,
    channelId,
    senderId: memberIdFor(raw.senderId),
    text: raw.text ?? "",
    fileId: raw.fileId ? fileUuidToId.get(raw.fileId) ?? null : null,
    createdAt: raw.createdAt,
    readBy: raw.readBy.map(memberIdFor),
    reactions: raw.reactions.map((r): ChatReaction => ({ messageId: id, memberId: memberIdFor(r.userId), emoji: r.emoji })),
  };
}

// ============================================================================
// 게시판(board) — backend/src/board를 그대로 매핑. 글/댓글/투표 id는 전부 UUID라 다른 영역과
// 같은 방식(makeIdRegistry)으로 숫자 id를 붙여서 main의 BoardPost 인터페이스(숫자 id 기준)에 맞춘다.
// ============================================================================
interface RawBoardPost {
  id: string;
  authorId: string;
  author: { id: string; name: string } | null;
  title: string;
  content: string;
  projectId: string | null;
  project: { id: string; name: string } | null;
  recruiting: boolean;
  tags: string[];
  category: string;
  views: number;
  pinned: boolean;
  createdAt: string;
}
interface RawBoardStats {
  likes: number;
  likedByMe: boolean;
  comments: number;
}
interface RawBoardAttachment {
  id: string;
  postId: string | null;
  uploaderId: string;
  name: string;
  byteSize: number;
  kind: "image" | "file";
  mimeType: string | null;
  data: string;
  createdAt: string;
}
interface RawBoardPollOption {
  id: string;
  pollId: string;
  text: string;
  sortOrder: number;
  votesCount: number;
}
interface RawBoardPollDetail {
  id: string;
  postId: string;
  question: string;
  allowMultiple: boolean;
  isAnonymous: boolean;
  closed: boolean;
  closesAt: string | null;
  createdAt: string;
  options: RawBoardPollOption[];
  totalVotes: number;
  hasVoted: boolean;
  myOptionIds: string[];
}
interface RawBoardComment {
  id: string;
  postId: string;
  authorId: string;
  author: { id: string; name: string } | null;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
}
interface RawBoardPostReport {
  id: string;
  postId: string | null;
  postTitle: string;
  postExcerpt: string;
  postAuthorName: string;
  reporterId: string;
  reason: string;
  detail: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
}

function toBoardAttachment(raw: RawBoardAttachment): BoardAttachment {
  return {
    id: boardAttachmentIds.toNumber(raw.id).toString(),
    name: raw.name,
    size: formatSize(raw.data),
    kind: raw.kind,
    url: raw.data,
    mimeType: raw.mimeType ?? undefined,
  };
}

function toBoardPollDetail(raw: RawBoardPollDetail): BoardPoll {
  return {
    id: boardPollIds.toNumber(raw.id),
    postId: boardPostIds.toNumber(raw.postId),
    question: raw.question,
    allowMultiple: raw.allowMultiple,
    isAnonymous: raw.isAnonymous,
    closed: raw.closed,
    closesAt: raw.closesAt,
    createdAt: raw.createdAt,
    totalVotes: raw.totalVotes,
    hasVoted: raw.hasVoted,
    myOptionIds: raw.myOptionIds.map((id) => boardPollOptionIds.toNumber(id)),
    options: raw.options
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => ({
        id: boardPollOptionIds.toNumber(o.id),
        pollId: boardPollIds.toNumber(o.pollId),
        text: o.text,
        votesCount: o.votesCount,
        sortOrder: o.sortOrder,
      })),
  };
}

function toBoardPost(
  raw: RawBoardPost,
  stats: RawBoardStats,
  attachments: RawBoardAttachment[],
  comments: import("../types").BoardComment[],
  poll: BoardPoll | null,
): BoardPost {
  return {
    id: boardPostIds.toNumber(raw.id),
    category: (raw.category as BoardPost["category"]) ?? "free",
    title: raw.title,
    content: raw.content,
    authorUserId: raw.authorId,
    author: raw.author?.name ?? "알 수 없음",
    authorAvatarUrl: null,
    createdAt: raw.createdAt,
    views: raw.views,
    likes: stats.likes,
    likedByMe: stats.likedByMe,
    pinned: raw.pinned,
    tags: raw.tags,
    attachments: attachments.map(toBoardAttachment),
    commentsCount: stats.comments,
    comments,
    poll,
  };
}

// listBoardPosts/createBoardPost가 공통으로 쓰는, 글 하나의 나머지 정보(통계/첨부/댓글/투표)를
// 한 번에 모아오는 헬퍼.
async function loadBoardPostExtras(postId: string): Promise<{ stats: RawBoardStats; attachments: RawBoardAttachment[]; comments: import("../types").BoardComment[]; poll: BoardPoll | null }> {
  const [{ data: stats }, { data: attachments }, { data: rawComments }, { data: rawPoll }] = await Promise.all([
    apiClient.get<RawBoardStats>(`/board/posts/${postId}/stats`),
    apiClient.get<RawBoardAttachment[]>(`/board/posts/${postId}/attachments`),
    apiClient.get<RawBoardComment[]>(`/board/posts/${postId}/comments`),
    apiClient.get<RawBoardPollDetail | null>(`/board/posts/${postId}/poll`),
  ]);
  return {
    stats,
    attachments,
    comments: nestBoardComments(rawComments),
    poll: rawPoll ? toBoardPollDetail(rawPoll) : null,
  };
}

function toBoardComment(raw: RawBoardComment): { id: number; authorUserId: string; author: string; authorAvatarUrl: string | null; createdAt: string; content: string; parentCommentId: string | null } {
  return {
    id: boardCommentIds.toNumber(raw.id),
    authorUserId: raw.authorId,
    author: raw.author?.name ?? "알 수 없음",
    authorAvatarUrl: null,
    createdAt: raw.createdAt,
    content: raw.content,
    parentCommentId: raw.parentCommentId,
  };
}

// main의 BoardComment는 "최상위 댓글 + 그 밑에 달린 답글(replies)" 트리 모양이다 — 백엔드는
// parentCommentId만 있는 평평한 목록을 주므로 여기서 한 단계만 묶어 트리로 바꾼다(답글의 답글은
// 없는 걸로 가정 — main 쪽 BoardReply에도 더 깊은 중첩은 없음).
function nestBoardComments(raw: RawBoardComment[]): import("../types").BoardComment[] {
  const converted = raw.map(toBoardComment);
  const topLevel = converted.filter((c) => c.parentCommentId === null);
  const byParent = new Map<string, typeof converted>();
  for (const c of converted) {
    if (c.parentCommentId === null) continue;
    const list = byParent.get(c.parentCommentId) ?? [];
    list.push(c);
    byParent.set(c.parentCommentId, list);
  }
  return topLevel.map((c) => {
    const rawRow = raw.find((r) => toBoardComment(r).id === c.id)!;
    const replies = (byParent.get(rawRow.id) ?? []).map((r) => ({
      id: r.id,
      authorUserId: r.authorUserId,
      author: r.author,
      authorAvatarUrl: r.authorAvatarUrl,
      createdAt: r.createdAt,
      content: r.content,
    }));
    return { id: c.id, authorUserId: c.authorUserId, author: c.author, authorAvatarUrl: c.authorAvatarUrl, createdAt: c.createdAt, content: c.content, replies };
  });
}

interface RawPeerEvaluation {
  id: string;
  evaluatorId: string;
  recipientId: string;
  phase: EvaluationPhase;
  role: number;
  deadline: number;
  communication: number;
  collaboration: number;
  quality: number;
  comment: string;
  createdAt: string;
}
interface RawEvaluationsResponse {
  records: RawPeerEvaluation[];
  submitted: boolean;
  average: EvaluationData["average"];
}
function toEvaluationRecord(raw: RawPeerEvaluation): PeerEvaluationRecord {
  return {
    id: raw.id,
    evaluator_id: raw.evaluatorId,
    recipient_id: raw.recipientId,
    phase: raw.phase,
    role: raw.role,
    deadline: raw.deadline,
    communication: raw.communication,
    collaboration: raw.collaboration,
    quality: raw.quality,
    comment: raw.comment,
    created_at: raw.createdAt,
  };
}

async function buildFileVersions(
  projectId: string,
  file: RawProjectFile,
  numericFileId: number,
  names: Map<string, { name: string; avatar: string }>,
): Promise<FileVersion[]> {
  const [{ data: versions }, { data: pins }] = await Promise.all([
    apiClient.get<RawFileVersion[]>(`/projects/${projectId}/files/${file.id}/versions`),
    apiClient.get<{ versionId: string }[]>(`/projects/${projectId}/files/${file.id}/pins`),
  ]);
  const pinnedVersionIds = new Set(pins.map((p) => p.versionId));
  const byId = new Map(versions.map((v) => [v.id, v]));
  // 분기(형제 버전)까지는 이 앱의 선형 버전 목록 UI가 표현할 수 없어서, "현재" 버전에서
  // parentVersionId를 거슬러 올라간 메인 라인만 보여준다 (분기 자체는 조용히 생략됨).
  const chain: RawFileVersion[] = [];
  let cur: string | null = file.currentVersionId;
  while (cur) {
    const v = byId.get(cur);
    if (!v) break;
    chain.push(v);
    cur = v.parentVersionId;
  }
  chain.reverse(); // 오래된 것부터

  // currentVersionId가 null인 파일이 있을 수 있음(버전 관리 도입 이전에 만들어진 옛 파일 — 이관 시
  // content는 그대로 살아있지만 FileVersion은 하나도 없음, main_note 참고). 그 경우 chain이 빈
  // 배열이 되는데, Workspace.tsx가 `f.versions[0]`를 무조건 읽어서 화면 전체가 죽어버렸음 —
  // 그런 파일은 지금 content로 가짜 v1 하나를 만들어서 항상 최소 1개는 있도록 함.
  if (chain.length === 0) {
    return [
      {
        id: registerVersion(file.id, numericFileId),
        parentVersionId: null,
        storagePath: null,
        originalName: null,
        mimeType: "text/plain",
        byteSize: null,
        pinned: false,
        version: "v1",
        uploadedBy: names.get(file.lastEditorId ?? "")?.name ?? "알 수 없음",
        date: formatDate(file.updatedAt),
        size: formatSize(file.content),
        note: "",
        current: true,
      },
    ];
  }

  const withLabels = chain.map((v, i) => ({ v, label: `v${i + 1}` }));
  withLabels.reverse(); // 최신이 0번
  return withLabels.map(({ v, label }) => ({
    id: registerVersion(v.id, numericFileId),
    parentVersionId: v.parentVersionId ? registerVersion(v.parentVersionId, numericFileId) : null,
    storagePath: null,
    originalName: null,
    mimeType: "text/plain",
    byteSize: null,
    pinned: pinnedVersionIds.has(v.id),
    version: label,
    uploadedBy: names.get(v.authorId)?.name ?? "알 수 없음",
    date: formatDate(v.createdAt),
    size: formatSize(v.content),
    note: v.note ?? "",
    current: v.id === file.currentVersionId,
  }));
}

async function toWorkspaceFile(projectId: string, raw: RawProjectFile, names: Map<string, { name: string; avatar: string }>): Promise<WorkspaceFile> {
  const { folderName, fileName } = splitPath(raw.path);
  const numericFileId = registerFile(raw);
  const [versions, commentsRes] = await Promise.all([
    buildFileVersions(projectId, raw, numericFileId, names),
    apiClient.get<RawFileComment[]>(`/projects/${projectId}/files/${raw.id}/comments`),
  ]);
  const comments: FileComment[] = commentsRes.data.map((c) => ({
    id: hashId(c.id),
    memberId: null,
    versionId: null,
    reactions: [],
    author: names.get(c.authorId)?.name ?? "알 수 없음",
    avatar: names.get(c.authorId)?.avatar ?? "?",
    date: formatDate(c.createdAt),
    text: c.content,
  }));
  return {
    id: numericFileId,
    name: fileName,
    type: fileType(fileName),
    uploader: names.get(raw.lastEditorId ?? "")?.name ?? "알 수 없음",
    avatar: names.get(raw.lastEditorId ?? "")?.avatar ?? "?",
    date: formatDate(raw.updatedAt),
    size: formatSize(raw.content),
    tag: raw.tag ?? "",
    tags: raw.tag ? [raw.tag] : [],
    folderId: folderName ? numericFolderId(projectId, folderName) : null,
    versions,
    comments,
  };
}

export const nestDataRepository: DataRepository = {
  async listProjects() {
    const { data } = await apiClient.get<RawProject[]>("/projects");
    return data.map(toProject);
  },

  async listMyProjectIds() {
    const { data } = await apiClient.get<RawProject[]>("/projects");
    return data.map((p) => p.id);
  },

  async getProjectById(projectId) {
    try {
      const { data } = await apiClient.get<RawProject>(`/projects/${projectId}`);
      return toProject(data);
    } catch {
      return null;
    }
  },

  async createProject(input: NewProjectInput) {
    const description = encodeExtras({ org: input.org, period: input.period, startDate: input.startDate, endDate: input.endDate });
    const { data } = await apiClient.post<RawProject>("/projects", { name: input.name, description });
    return toProject(data);
  },

  // 백엔드에 프로젝트 삭제 API가 없음 — 조용히 무시 (에러로 UX를 막지 않되, 실제로 지워지진 않음)
  async deleteProject() {},

  // "참여 코드" = 초대 토큰. lookupProject(확인 버튼)에서 바로 수락까지 해버리는데, 우리 백엔드는
  // "가입 안 하고 미리보기"를 지원하지 않기 때문(멤버여야 프로젝트 조회 가능) — 코드가 유효하면
  // 이 시점에 실제로 참여가 완료된다. 자세한 이유는 이식기록 문서 참고.
  async joinProject(projectId, _code, input) {
    if (input.school?.trim() || input.major?.trim() || input.student?.trim()) {
      await apiClient.patch("/users/me", {
        school: input.school?.trim() || undefined,
        major: input.major?.trim() || undefined,
        student: input.student?.trim() || undefined,
      });
    }
    const [{ data: members }, { data: me }] = await Promise.all([
      apiClient.get<RawMember[]>(`/projects/${projectId}/members`),
      apiClient.get<{ id: string }>("/users/me"),
    ]);
    const mine = members.find((m) => m.userId === me.id);
    if (!mine) throw new Error("참여에 실패했습니다.");
    return toMember(mine);
  },

  async getTeam(projectId) {
    const [{ data }, { data: finalEvals }] = await Promise.all([
      apiClient.get<RawMember[]>(`/projects/${projectId}/members`),
      apiClient.get<RawEvaluationsResponse>(`/projects/${projectId}/evaluations/final`),
    ]);
    // 최종 평가는 전원 공개라, 여기서 받은 records를 recipientId별로 모아 평균 내면 서버가
    // "내 평균"에 쓰는 것과 같은 완전성 규칙(팀원 전원 제출)을 모든 멤버에 대해 재현할 수 있다.
    const byRecipient = new Map<string, RawPeerEvaluation[]>();
    for (const row of finalEvals.records) {
      const list = byRecipient.get(row.recipientId) ?? [];
      list.push(row);
      byRecipient.set(row.recipientId, list);
    }
    const expectedPerMember = data.length - 1;
    const averages = new Map<string, MemberFinalAverage>();
    if (expectedPerMember >= 2) {
      for (const [recipientId, rows] of byRecipient) {
        if (rows.length < expectedPerMember) continue;
        const avg = (key: "role" | "deadline" | "communication" | "collaboration" | "quality") => rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
        const criteria = { role: avg("role"), deadline: avg("deadline"), communication: avg("communication"), collaboration: avg("collaboration"), quality: avg("quality") };
        const score = (criteria.role + criteria.deadline + criteria.communication + criteria.collaboration + criteria.quality) / 5;
        averages.set(recipientId, { score, count: rows.length, criteria });
      }
    }
    const members = data.map((m) => toMember(m, averages.get(m.userId)));
    return { teamLabel: "팀", teamSub: `${members.length}명 참여 중`, members };
  },

  // 백엔드에 PATCH /users/me가 생겨서(school/major/student/name/avatarUrl) 실제로 반영됨.
  // 다만 이미지 업로드 API는 여전히 없어서 아바타는 명시적으로 실패 알림.
  async updateMyProfile(patch) {
    const body: Record<string, string> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.school !== undefined) body.school = patch.school;
    if (patch.major !== undefined) body.major = patch.major;
    if (patch.student !== undefined) body.student = patch.student;
    if (patch.avatarUrl) body.avatarUrl = patch.avatarUrl;
    if (Object.keys(body).length === 0) return;
    await apiClient.patch("/users/me", body);
  },
  async uploadAvatar() {
    throw new Error("이 서버 백엔드는 아직 프로필 이미지 업로드를 지원하지 않습니다.");
  },
  async transferLeadership(projectId, targetMemberId) {
    await apiClient.post(`/projects/${projectId}/transfer-leadership`, { memberId: targetMemberId });
  },

  async listFolders(projectId) {
    const { data: files } = await apiClient.get<RawProjectFile[]>(`/projects/${projectId}/files`);
    const names = await memberNameMap(projectId);
    const folders = new Map<string, { count: number; createdBy: string; earliestCreatedAt: string }>();
    for (const f of files) {
      const { folderName } = splitPath(f.path);
      if (!folderName) continue;
      const entry = folders.get(folderName);
      const isKeep = f.path.endsWith(`/${KEEP_FILE}`);
      if (!entry) {
        folders.set(folderName, {
          count: isKeep ? 0 : 1,
          createdBy: names.get(f.lastEditorId ?? "")?.name ?? "알 수 없음",
          earliestCreatedAt: f.createdAt,
        });
      } else if (!isKeep) {
        entry.count += 1;
      }
    }
    const result: Folder[] = [];
    for (const [name, info] of folders) {
      result.push({
        id: numericFolderId(projectId, name),
        name,
        color: colorForName(name),
        createdBy: info.createdBy,
        date: formatDate(info.earliestCreatedAt),
        parentId: null,
      });
    }
    return result;
  },

  // parentId(중첩 폴더)는 백엔드가 지원하지 않는다(폴더는 경로 접두사로만 존재) — 항상 최상위
  // 폴더로 만든다. actorName도 백엔드가 createdBy를 따로 안 받아서(최초 업로드한 사람 기준) 쓰지 않음.
  async createFolder(projectId, name, _actorName, _parentId) {
    const path = `${name}/${KEEP_FILE}`;
    await apiClient.post(`/projects/${projectId}/files/sync`, { files: [{ path, content: "" }] });
    return { id: numericFolderId(projectId, name), name, color: colorForName(name), createdBy: "", date: formatDate(new Date().toISOString()), parentId: null };
  },

  async listFiles(projectId) {
    const [{ data: files }, names] = await Promise.all([
      apiClient.get<RawProjectFile[]>(`/projects/${projectId}/files`),
      memberNameMap(projectId),
    ]);
    const real = files.filter((f) => !f.path.endsWith(`/${KEEP_FILE}`) && f.path !== KEEP_FILE);
    return Promise.all(real.map((f) => toWorkspaceFile(projectId, f, names)));
  },

  // main의 uploadFile은 File 객체 하나로 "새 파일 만들기"와 "기존 파일의 새 버전 올리기"를 함께
  // 처리한다(input.fileId가 있으면 후자). branched는 우리 백엔드가 분기 발생 여부를 안 알려줘서
  // 항상 false로 둔다(실제로 분기가 생겼어도 화면엔 "바로 반영됨"으로 보임 — 추후 개선 여지).
  async uploadFile(projectId, input) {
    const content = await readFileContentForUpload(input.file);
    let path: string;
    let baseVersionId: string | undefined;
    if (input.fileId !== undefined) {
      const info = fileMetaById.get(input.fileId);
      if (!info) throw new Error("알 수 없는 파일입니다.");
      path = info.path;
      baseVersionId = info.currentVersionId ?? undefined;
    } else {
      const folderName = input.folderId !== null ? folderNameForId(input.folderId) : null;
      path = folderName ? `${folderName}/${input.file.name}` : input.file.name;
    }
    await apiClient.post(`/projects/${projectId}/files/sync`, {
      files: [{ path, content, baseVersionId, note: input.note }],
    });
    const { data: files } = await apiClient.get<RawProjectFile[]>(`/projects/${projectId}/files`);
    const saved = files.find((f) => f.path === path);
    if (!saved) throw new Error("업로드에 실패했습니다.");
    const fileId = registerFile(saved);
    const versionId = saved.currentVersionId ? registerVersion(saved.currentVersionId, fileId) : fileId;
    return { fileId, versionId, branched: false };
  },

  async promoteFileVersion(fileId, versionId) {
    const fileInfo = fileMetaById.get(fileId);
    const versionInfo = versionMetaById.get(versionId);
    if (!fileInfo || !versionInfo) throw new Error("알 수 없는 파일/버전입니다.");
    await apiClient.post(`/projects/${fileInfo.projectId}/files/${fileInfo.uuid}/versions/${versionInfo.uuid}/promote`);
  },

  // 파일 전문 검색 인덱싱 기능 — 백엔드가 지원하지 않아 조용히 무시한다.
  async setFileVersionText() {},

  // 백엔드는 파일당 태그 하나만 지원한다(main은 여러 개) — 첫 번째 태그만 반영.
  async setFileTags(fileId, tags) {
    const info = fileMetaById.get(fileId);
    if (!info) throw new Error("알 수 없는 파일입니다.");
    await apiClient.patch(`/projects/${info.projectId}/files/${info.uuid}/tag`, { tag: tags[0] ?? "" });
  },

  async pinFileVersion(fileId, versionId, pinned) {
    const fileInfo = fileMetaById.get(fileId);
    const versionInfo = versionMetaById.get(versionId);
    if (!fileInfo || !versionInfo) throw new Error("알 수 없는 파일/버전입니다.");
    if (pinned) {
      await apiClient.post(`/projects/${fileInfo.projectId}/files/${fileInfo.uuid}/pins`, { versionId: versionInfo.uuid });
    } else {
      const { data: pins } = await apiClient.get<{ id: string; versionId: string }[]>(`/projects/${fileInfo.projectId}/files/${fileInfo.uuid}/pins`);
      const pin = pins.find((p) => p.versionId === versionInfo.uuid);
      if (pin) await apiClient.delete(`/projects/${fileInfo.projectId}/files/${fileInfo.uuid}/pins/${pin.id}`);
    }
  },

  async downloadFileVersion(versionId) {
    const versionInfo = versionMetaById.get(versionId);
    if (!versionInfo) throw new Error("알 수 없는 버전입니다.");
    const fileInfo = fileMetaById.get(versionInfo.fileId);
    if (!fileInfo) throw new Error("알 수 없는 파일입니다.");
    const { data: versions } = await apiClient.get<RawFileVersion[]>(`/projects/${fileInfo.projectId}/files/${fileInfo.uuid}/versions`);
    const version = versions.find((v) => v.id === versionInfo.uuid);
    if (!version) throw new Error("버전을 찾을 수 없습니다.");
    if (version.content.startsWith("data:")) {
      const res = await fetch(version.content);
      return res.blob();
    }
    return new Blob([version.content], { type: "text/plain;charset=utf-8" });
  },

  // 댓글 반응(이모지) — 백엔드가 지원하지 않아 조용히 무시한다.
  async setFileCommentReaction() {},

  async addFileComment(fileId, _actorName, _actorAvatar, text, versionId) {
    const info = fileMetaById.get(fileId);
    if (!info) throw new Error("알 수 없는 파일입니다.");
    const versionUuid = versionId != null ? versionMetaById.get(versionId)?.uuid : undefined;
    const { data } = await apiClient.post<RawFileComment>(`/projects/${info.projectId}/files/${info.uuid}/comments`, { content: text, versionId: versionUuid });
    const names = await memberNameMap(info.projectId);
    return {
      id: hashId(data.id),
      memberId: null,
      versionId: versionId ?? null,
      reactions: [],
      author: names.get(data.authorId)?.name ?? "알 수 없음",
      avatar: names.get(data.authorId)?.avatar ?? "?",
      date: formatDate(data.createdAt),
      text: data.content,
    };
  },

  async deleteWorkspaceFile(fileId) {
    // 백엔드에 파일 삭제 API가 없다 — 지금은 빈 내용으로 덮어써서 "사실상 비움" 처리만 한다
    // (완전 삭제가 필요하면 backend/files 모듈에 DELETE 엔드포인트 추가 필요).
    const info = fileMetaById.get(fileId);
    if (!info) return;
    await apiClient.post(`/projects/${info.projectId}/files/sync`, {
      files: [{ path: info.path, content: "", baseVersionId: info.currentVersionId ?? undefined }],
    });
  },

  async moveWorkspaceFile(fileId, folderId) {
    const info = fileMetaById.get(fileId);
    if (!info) throw new Error("알 수 없는 파일입니다.");
    const baseName = info.path.split("/").pop();
    const folderName = folderId !== null ? folderNameForId(folderId) : null;
    const newPath = folderName ? `${folderName}/${baseName}` : baseName ?? info.path;
    await apiClient.patch(`/projects/${info.projectId}/files/${info.uuid}/move`, { path: newPath });
  },

  // 폴더 자체를 옮기는 API가 없어서, 그 폴더 밑 파일을 하나씩 새 경로로 옮긴다.
  async moveWorkspaceFolder(folderId, parentId) {
    const folderName = folderNameForId(folderId);
    const projectId = folderProjectIdForId(folderId);
    if (!folderName || !projectId) return;
    const newParentName = parentId !== null ? folderNameForId(parentId) : null;
    const { data: files } = await apiClient.get<RawProjectFile[]>(`/projects/${projectId}/files`);
    const prefix = `${folderName}/`;
    for (const f of files) {
      if (!f.path.startsWith(prefix)) continue;
      const rest = f.path.slice(prefix.length);
      const newPath = newParentName ? `${newParentName}/${folderName}/${rest}` : `${folderName}/${rest}`;
      if (newPath === f.path) continue;
      await apiClient.patch(`/projects/${projectId}/files/${f.id}/move`, { path: newPath });
    }
  },

  // 직접 순서 지정 — 백엔드에 순서 컬럼이 없다. Workspace.tsx 자체 드래그 순서는 이 메서드를
  // 거치지 않고 브라우저 로컬 저장으로 따로 동작하므로(이 세션에서 만든 기능), 여기는 무시해도 된다.
  async reorderWorkspaceItems() {},

  async deleteWorkspaceFolder(folderId) {
    const folderName = folderNameForId(folderId);
    const projectId = folderProjectIdForId(folderId);
    if (!folderName || !projectId) return;
    const { data: files } = await apiClient.get<RawProjectFile[]>(`/projects/${projectId}/files`);
    const prefix = `${folderName}/`;
    for (const f of files) {
      if (!f.path.startsWith(prefix)) continue;
      await apiClient.post(`/projects/${projectId}/files/sync`, {
        files: [{ path: f.path, content: "", baseVersionId: f.currentVersionId ?? undefined }],
      });
    }
  },

  // 백엔드에 진짜 웹소켓 pub/sub은 없어서, 주기적으로 다시 불러오라는 신호만 보내는 폴링으로
  // 대신한다 — Workspace.tsx 자체에도 이미 폴링이 있지만, 이 구독을 쓰는 다른 화면(main 전용)을
  // 위해 여기도 채워둔다.
  subscribeToFiles(_projectId, onChange) {
    const timer = setInterval(() => onChange(), DATA_REFRESH_POLL_MS);
    return () => clearInterval(timer);
  },

  async getOfficeEditorStatus() {
    return { enabled: true };
  },

  async getOfficeEditorConfig(fileId) {
    const info = fileMetaById.get(fileId);
    if (!info) throw new Error("알 수 없는 파일입니다.");
    const { data } = await apiClient.get(`/projects/${info.projectId}/files/${info.uuid}/onlyoffice/config`);
    return data as Record<string, unknown>;
  },

  async listTasks(projectId) {
    const [{ data: rawTasks }, members] = await Promise.all([
      apiClient.get<RawTask[]>(`/projects/${projectId}/tasks`),
      membersByUserId(projectId),
    ]);
    return Promise.all(rawTasks.map((t) => toTask(t, members)));
  },

  async createTask(projectId, input: NewTaskInput) {
    const members = await membersByUserId(projectId);
    const assigneeUserId = input.assigneeIds[0]
      ? [...members.values()].find((m) => m.id === input.assigneeIds[0])?.userId
      : undefined;
    const { data } = await apiClient.post<RawTask>(`/projects/${projectId}/tasks`, {
      title: input.title,
      assigneeId: assigneeUserId,
    });
    return toTask(data, members);
  },

  async updateTaskStatus(taskId, status: TaskStatus) {
    const uuid = taskIds.toUuid(taskId);
    if (!uuid) return;
    await apiClient.patch(`/tasks/${uuid}/status`, { status: STATUS_FROM_TALJU[status] });
  },

  async updateTaskDetails(taskId, patch) {
    const uuid = taskIds.toUuid(taskId);
    if (!uuid) return;
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.priority !== undefined) body.priority = patch.priority;
    if (patch.due !== undefined) body.dueDate = patch.due || null;
    if (patch.tags !== undefined) body.tags = patch.tags;
    if (patch.assigneeIds !== undefined) {
      // 백엔드는 아직 담당자 1명만 지원 — 여러 명을 고르는 UI라도 첫 번째만 실제로 저장됨.
      const projectId = taskProjectById.get(taskId);
      if (projectId && patch.assigneeIds[0]) {
        const members = await membersByUserId(projectId);
        body.assigneeId = [...members.values()].find((m) => m.id === patch.assigneeIds![0])?.userId ?? null;
      } else {
        body.assigneeId = null;
      }
    }
    if (Object.keys(body).length === 0) return;
    await apiClient.patch(`/tasks/${uuid}`, body);
  },

  async deleteTask(taskId) {
    const uuid = taskIds.toUuid(taskId);
    if (!uuid) return;
    await apiClient.delete(`/tasks/${uuid}`);
  },

  async addTaskChecklistItem(taskId, text) {
    const uuid = taskIds.toUuid(taskId);
    if (!uuid) throw new Error("과제를 찾을 수 없습니다.");
    const { data } = await apiClient.post<RawChecklistItem>(`/tasks/${uuid}/checklist`, { text });
    return { id: checklistItemIds.toNumber(data.id), text: data.text, done: data.done };
  },

  async toggleTaskChecklistItem(itemId, done) {
    const uuid = checklistItemIds.toUuid(itemId);
    if (!uuid) return;
    await apiClient.patch(`/tasks/checklist/${uuid}`, { done });
  },

  async addTaskComment(taskId, _actorName, _actorAvatar, text) {
    const uuid = taskIds.toUuid(taskId);
    if (!uuid) throw new Error("과제를 찾을 수 없습니다.");
    const { data } = await apiClient.post<RawTaskComment>(`/tasks/${uuid}/comments`, { content: text });
    const me = await apiClient.get<{ id: string; name: string }>("/users/me");
    return {
      id: taskCommentIds.toNumber(data.id),
      author: me.data.name,
      avatar: me.data.name.slice(0, 1) || "?",
      date: formatDate(data.createdAt),
      text: data.content,
      memberId: null,
      reactions: [],
    };
  },

  // active는 백엔드가 토글만 지원해서 별도로 반영하지 않는다(눌렀다 떼면 다시 토글되는 정도).
  async setTaskCommentReaction(commentId, _memberId, emoji) {
    const uuid = taskCommentIds.toUuid(commentId);
    if (!uuid) return;
    await apiClient.post(`/tasks/comments/${uuid}/reactions`, { emoji });
  },

  async setTaskScheduleLink(taskId, field, eventId) {
    const taskUuid = taskIds.toUuid(taskId);
    if (!taskUuid) return;
    const eventUuid = eventId === null ? null : scheduleEventIds.toUuid(eventId);
    await apiClient.patch(`/tasks/${taskUuid}/schedule-link`, { field, eventId: eventUuid ?? null });
  },

  async listScheduleEvents(projectId) {
    const { data } = await apiClient.get<{ id: string; title: string; date: string; refType: string | null }[]>(
      `/projects/${projectId}/calendar`,
    );
    return data.map((e) => {
      scheduleEventProjectById.set(scheduleEventIds.toNumber(e.id), projectId);
      return {
        id: scheduleEventIds.toNumber(e.id),
        title: e.title,
        date: e.date.slice(0, 10),
        endDate: null,
        type: (e.refType ?? "other") as ScheduleEventType,
        scope: "team",
        ownerMemberId: null,
        visibility: null,
        hideTitle: false,
      };
    });
  },

  async addScheduleEvent(projectId, _actorMemberId, input: NewScheduleEventInput) {
    const { data } = await apiClient.post<{ id: string; title: string; date: string; refType: string | null }>(
      `/projects/${projectId}/calendar`,
      { title: input.title, date: input.date, type: input.type },
    );
    scheduleEventProjectById.set(scheduleEventIds.toNumber(data.id), projectId);
    return {
      id: scheduleEventIds.toNumber(data.id),
      title: data.title,
      date: data.date.slice(0, 10),
      endDate: input.endDate ?? null,
      type: input.type,
      scope: "team",
      ownerMemberId: null,
      visibility: null,
      hideTitle: false,
    };
  },

  async updateScheduleEvent(eventId, patch) {
    const uuid = scheduleEventIds.toUuid(eventId);
    if (!uuid) return;
    const body: Record<string, string> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.date !== undefined) body.date = patch.date;
    if (patch.type !== undefined) body.type = patch.type;
    if (Object.keys(body).length === 0) return;
    // 프로젝트 id를 모르면 PATCH 경로를 만들 수 없는데, 이 앱에선 항상 현재 프로젝트의 일정만
    // 다루므로 scheduleEventIds가 등록될 때 같이 기억해둔 프로젝트 id를 쓴다.
    const projectId = scheduleEventProjectById.get(eventId);
    if (!projectId) return;
    await apiClient.patch(`/projects/${projectId}/calendar/${uuid}`, body);
  },

  async removeScheduleEvent(eventId) {
    const uuid = scheduleEventIds.toUuid(eventId);
    const projectId = scheduleEventProjectById.get(eventId);
    if (!uuid || !projectId) return;
    await apiClient.delete(`/projects/${projectId}/calendar/${uuid}`);
  },

  async listMessages(projectId, channelId) {
    const members = await membersByUserId(projectId);
    const backendChannelId = toBackendChannelId(channelId, members);
    const { data } = await apiClient.get<RawChatMessage[]>(`/projects/${projectId}/chat/${backendChannelId}/messages`);
    return data.map((m) => toMessage(m, members, channelId));
  },

  async sendMessage(projectId, channelId, _senderMemberId, input) {
    const members = await membersByUserId(projectId);
    const backendChannelId = toBackendChannelId(channelId, members);
    const fileUuid = input.fileId ? fileMetaById.get(input.fileId)?.uuid : undefined;
    const { data } = await apiClient.post<RawChatMessage>(`/projects/${projectId}/chat/${backendChannelId}/messages`, {
      text: input.text,
      fileId: fileUuid,
    });
    return toMessage(data, members, channelId);
  },

  async markChannelRead(projectId, channelId) {
    const members = await membersByUserId(projectId);
    const backendChannelId = toBackendChannelId(channelId, members);
    await apiClient.post(`/projects/${projectId}/chat/${backendChannelId}/read`);
  },

  // active는 백엔드가 토글만 지원해서 별도로 반영하지 않는다.
  async setMessageReaction(projectId, messageId, _memberId, emoji) {
    const uuid = messageIds.toUuid(messageId);
    if (!uuid) return;
    await apiClient.post(`/projects/${projectId}/chat/messages/${uuid}/reactions`, { emoji });
  },

  // 실시간 서버(웹소켓 등)가 없어서 폴링으로 흉내낸다 — "팀 전체" + 다른 멤버 각각과의 DM 채널을
  // 4초마다 전부 다시 불러와서, 새 메시지든 리액션/읽음 변경이든 그 메시지의 최신 전체 상태를
  // onInsert로 넘긴다(ProjectContext가 upsert로 반영). 폴더 동기화가 이미 같은 방식(폴링)을 씀.
  subscribeToMessages(projectId, onInsert) {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled) return;
      try {
        const members = await membersByUserId(projectId);
        const myUserId = (await apiClient.get<{ id: string }>("/users/me")).data.id;
        const myMemberId = [...members.values()].find((m) => m.userId === myUserId)?.id;
        const channelIds = ["all", ...[...members.values()].filter((m) => m.id !== myMemberId).map((m) => `dm:${[myMemberId, m.id].sort().join(":")}`)];
        for (const channelId of channelIds) {
          if (cancelled) return;
          const backendChannelId = toBackendChannelId(channelId, members);
          const { data } = await apiClient.get<RawChatMessage[]>(`/projects/${projectId}/chat/${backendChannelId}/messages`);
          for (const m of data) onInsert(toMessage(m, members, channelId));
        }
      } catch {
        // 다음 폴링에서 다시 시도
      }
      if (!cancelled) timer = setTimeout(poll, 4000);
    }
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  },

  // 읽음 갱신은 이제 subscribeToMessages의 매 폴링에 딸려오는 메시지 전체 상태(readBy 포함)에
  // 흡수되어 있어서 별도 구독이 필요 없음.
  subscribeToReads() {
    return () => {};
  },

  // ==========================================================================
  // 아래는 main에서 가져왔지만 backend/(NestJS)가 아직 지원하지 않는 기능들 —
  // 관리자 승인 워크플로우, 동료 평가, 게시판, 채팅 그룹/AI 도구, 캠퍼스 공지 크롤링, 푸시 알림,
  // 범용 실시간 구독(작업/일정/프레즌스). 화면이 깨지지 않도록 "비어있음/지원 안 함"으로 채워두고,
  // 통합 계획의 다음 단계에서 하나씩 backend/에 포팅하며 실제 구현으로 바꿀 예정.
  // ==========================================================================

  async isCurrentUserAdmin() {
    const { data } = await apiClient.get<{ isAdmin: boolean }>("/me/is-admin");
    return data.isAdmin;
  },
  async listWorkspaceCleanupProjects() { return []; },
  async getMyEvaluationSummary() {
    const [{ data: me }, projectIds] = await Promise.all([
      apiClient.get<{ id: string }>("/users/me"),
      nestDataRepository.listMyProjectIds(),
    ]);
    const teams = await Promise.all(projectIds.map((id) => nestDataRepository.getTeam(id)));
    const myRows: Pick<Member, "score" | "evalCount" | "criteriaScores">[] = [];
    const collaboratorIds = new Set<string>();
    for (const team of teams) {
      const mine = team.members.find((m) => m.userId === me.id);
      if (mine && mine.evalCount > 0) myRows.push(mine);
      for (const m of team.members) {
        if (m.userId && m.userId !== me.id) collaboratorIds.add(m.userId);
      }
    }
    return summarizeEvaluations(myRows, projectIds.length, collaboratorIds.size);
  },
  async getEvaluationMode() {
    const { data } = await apiClient.get<boolean>("/evaluation-mode");
    return data;
  },
  async setEvaluationMode(enabled) {
    await apiClient.put("/evaluation-mode", { enabled });
  },
  async getEvaluationMethodPreview() {
    const { data } = await apiClient.get<boolean>("/evaluation-method-preview");
    return data;
  },
  async setEvaluationMethodPreview(enabled) {
    await apiClient.put("/evaluation-method-preview", { enabled });
  },
  async getEvaluationScoreCca() {
    const { data } = await apiClient.get<boolean>("/evaluation-score-cca");
    return data;
  },
  async setEvaluationScoreCca(enabled) {
    await apiClient.put("/evaluation-score-cca", { enabled });
  },
  async getEvaluations(projectId: string, phase: EvaluationPhase, method?: EvaluationScoreMethod): Promise<EvaluationData> {
    const { data } = await apiClient.get<RawEvaluationsResponse>(`/projects/${projectId}/evaluations/${phase}${method ? `?method=${method}` : ""}`);
    return { records: data.records.map(toEvaluationRecord), submitted: data.submitted, average: data.average };
  },
  async submitEvaluations(projectId: string, phase: EvaluationPhase, entries: EvaluationEntry[]) {
    await apiClient.post(`/projects/${projectId}/evaluations/${phase}`, {
      entries: entries.map((e) => ({
        recipientId: e.recipient_id,
        role: e.role,
        deadline: e.deadline,
        communication: e.communication,
        collaboration: e.collaboration,
        quality: e.quality,
        comment: e.comment,
      })),
    });
  },
  async completeProject(projectId) {
    const { data } = await apiClient.post<RawProject>(`/projects/${projectId}/complete`);
    return toProject(data);
  },

  // "참여 코드" = 우리 백엔드의 초대 토큰(createInviteToken). 만료 시각은 백엔드가 안 알려줘서
  // 넉넉하게 24시간 뒤로 표시만 해둔다(실제 만료 여부는 수락 시점에 서버가 판단).
  async getJoinCode(projectId) {
    const token = await createInviteToken(projectId);
    return { joinCode: token, joinCodeExpiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString() };
  },
  async rotateJoinCode(projectId) {
    const token = await createInviteToken(projectId);
    return { joinCode: token, joinCodeExpiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString() };
  },
  // "코드 확인만" 미리보기는 우리 백엔드가 지원하지 않는다(멤버여야 조회 가능 — joinProject 주석
  // 참고). null을 돌려주면 화면은 "참여하기"를 바로 누르도록 유도한다.
  async lookupProjectByJoinCode() { return null; },
  async approveProject(projectId) {
    await apiClient.post(`/projects/${projectId}/approve`);
  },
  async rejectProject(projectId) {
    await apiClient.post(`/projects/${projectId}/reject`);
  },
  async kickMember(memberId) {
    await apiClient.post(`/projects/members/${memberId}/kick`);
  },
  async setViceLeader(memberId, enabled) {
    await apiClient.post(`/projects/members/${memberId}/vice-leader`, { enabled });
  },
  async searchAdmins(query) {
    const { data } = await apiClient.get<{ id: string; displayName: string; org: string | null; email: string | null }[]>("/admins/search", { params: { q: query } });
    return data.map((a) => ({ id: a.id, displayName: a.displayName, org: a.org, email: a.email }));
  },
  async isCurrentUserOperator() {
    const { data } = await apiClient.get<{ isOperator: boolean }>("/me/is-operator");
    return data.isOperator;
  },
  async getMyAdminApplication() {
    const { data } = await apiClient.get<RawAdminApplication | null>("/me/admin-application");
    return data ? toMyAdminApplication(data) : null;
  },
  async submitAdminApplication(input) {
    const data = await readFileContentForUpload(input.file);
    await apiClient.post("/admin-applications", {
      org: input.org,
      jobTitle: input.jobTitle,
      contact: input.contact,
      docType: input.docType,
      docName: input.file.name,
      docSize: input.file.size,
      docData: data,
    });
  },
  async listAdminApplications() {
    const { data } = await apiClient.get<(RawAdminApplication & { displayName: string; email: string })[]>("/admin-applications");
    return data.map((a) => ({
      id: a.id,
      userId: a.userId,
      displayName: a.displayName,
      email: a.email,
      emailConfirmed: true,
      org: a.org,
      jobTitle: a.jobTitle,
      contact: a.contact,
      docType: a.docType as AdminDocType,
      docName: a.docName,
      docSize: a.docSize,
      docPath: a.docDeleted ? null : a.id,
      docDeleted: a.docDeleted,
      status: a.status,
      submittedAt: a.createdAt,
      reviewedAt: a.reviewedAt,
      reviewNote: a.reviewNote,
      reviewedByName: null,
    }));
  },
  async getAdminApplicationDocumentUrl(path) {
    const { data } = await apiClient.get<{ data: string }>(`/admin-applications/${path}/document`);
    return data.data;
  },
  async reviewAdminApplication(id, approve, note) {
    await apiClient.patch(`/admin-applications/${id}`, { approve, note });
  },
  async cleanupAdminDocument(id) {
    await apiClient.post(`/admin-applications/${id}/cleanup-document`);
  },
  async listAdminAccounts() {
    const { data } = await apiClient.get<{ userId: string; displayName: string; email: string; org: string | null; isOperator: boolean; pendingProjects: number }[]>("/admins");
    return data;
  },
  async revokeAdmin(userId) {
    await apiClient.post(`/admins/${userId}/revoke`);
  },

  async getMemberParticipationStats(userId) {
    const { data } = await apiClient.get<{ projectCount: number; collaboratorCount: number }>(`/users/${userId}/participation-stats`);
    return data;
  },
  async getEvaluationPercentiles(target?) {
    const query = target ? `?projectId=${encodeURIComponent(target.projectId)}&memberId=${encodeURIComponent(target.memberId)}` : "";
    const { data } = await apiClient.get<EvaluationPercentiles>(`/me/evaluation-percentiles${query}`);
    return data;
  },

  async savePushSubscription(subscription) {
    await apiClient.post("/me/push-subscriptions", subscription);
  },
  async deletePushSubscription(endpoint) {
    await apiClient.post("/me/push-subscriptions/delete", { endpoint });
  },

  async uploadBannerImage() { throw new Error("이 서버 백엔드는 아직 배너 이미지 업로드를 지원하지 않습니다."); },
  async uploadBackgroundImage() { throw new Error("이 서버 백엔드는 아직 배경 이미지 업로드를 지원하지 않습니다."); },

  // main 쪽은 파일 원본을 별도 스토리지 버킷에 두고 DB에는 경로만 남기는 구조라 삭제 시
  // 버킷 정리가 비동기 대기열(workspace_delete_queue)로 미뤄질 수 있다. 이 백엔드는 파일
  // 내용을 ProjectFile/FileVersion row에 직접 저장하므로 행을 지우면 그걸로 끝 — 별도
  // 정리 대기열 자체가 존재하지 않는다(= 항상 빈 배열/no-op이 올바른 구현).
  async pendingWorkspaceCleanup() { return []; },
  async cleanupWorkspaceFiles() {},

  subscribeToTaskCommentReactions(_projectId, onChange) {
    const timer = setInterval(() => onChange(), DATA_REFRESH_POLL_MS);
    return () => clearInterval(timer);
  },
  subscribeToTasks(_projectId, onChange) {
    const timer = setInterval(() => onChange(), DATA_REFRESH_POLL_MS);
    return () => clearInterval(timer);
  },
  subscribeToScheduleEvents(_projectId, onChange) {
    const timer = setInterval(() => onChange(), DATA_REFRESH_POLL_MS);
    return () => clearInterval(timer);
  },

  async listUpcomingEvents() {
    const projectIds = await nestDataRepository.listMyProjectIds();
    const today = new Date().toISOString().slice(0, 10);
    const perProject = await Promise.all(
      projectIds.map(async (projectId) => {
        const [project, events] = await Promise.all([
          nestDataRepository.getProjectById(projectId),
          nestDataRepository.listScheduleEvents(projectId),
        ]);
        const projectName = project?.name ?? "";
        return events
          .filter((e) => e.date >= today || (e.endDate && e.endDate >= today))
          .map((e) => ({ ...e, projectId, projectName }));
      }),
    );
    return perProject.flat().sort((a, b) => a.date.localeCompare(b.date));
  },

  async listChatGroups(projectId) {
    const [{ data: groups }, members] = await Promise.all([
      apiClient.get<{ id: string; name: string; memberIds: string[] }[]>(`/projects/${projectId}/chat/groups`),
      membersByUserId(projectId),
    ]);
    const memberList = [...members.values()];
    const memberIdFor = (userId: string) => memberList.find((m) => m.userId === userId)?.id ?? userId;
    return groups.map((g) => ({ id: g.id, name: g.name, memberIds: g.memberIds.map(memberIdFor) }));
  },
  // 다른(지금 열지 않은) 프로젝트에 새 소식이 있는지 뱃지로 보여주는 기능 — main 쪽은 각
  // 영역(채팅/작업/일정/워크스페이스)마다 "마지막으로 본 시각" 커서를 멤버 행에 기록해두고
  // 그 이후 변경이 있으면 알림으로 친다. 이 백엔드/DataRepository 인터페이스 어디에도 그
  // 커서를 쓰는 메서드가 없어서(Member.tasksViewedAt 등도 항상 null placeholder) 아직
  // 포팅하지 않음 — 항상 빈 배열(뱃지 없음)로 두되, 틀린 값을 보여주진 않는다.
  async getMyProjectAlerts() { return []; },
  async createChatGroup(projectId, name, memberIds) {
    const members = await membersByUserId(projectId);
    const memberList = [...members.values()];
    const userIdFor = (memberId: string) => memberList.find((m) => m.id === memberId)?.userId ?? memberId;
    const { data: channelId } = await apiClient.post<string>(`/projects/${projectId}/chat/groups`, {
      name,
      memberIds: memberIds.map(userIdFor),
    });
    return channelId;
  },
  async addChatGroupMembers(groupId, memberIds) {
    // groupId는 "grp:<uuid>" 채널id로 들어온다 — 접두사를 떼야 백엔드 경로와 맞는다.
    const uuid = groupId.startsWith("grp:") ? groupId.slice(4) : groupId;
    // 어느 프로젝트인지 몰라서 멤버id->userId 변환을 건너뛰고, 이미 userId로 들어온 걸로 가정
    // (main 쪽 화면이 ProjectContext의 멤버 목록에서 고른 값을 그대로 넘기는 경우가 대부분이라
    // 실제로는 memberId가 들어올 수 있음 — 다음 손볼 때 projectId도 같이 받도록 인터페이스를
    // 확장하는 게 더 정확함).
    await apiClient.post(`/chat/groups/${uuid}/members`, { memberIds });
  },
  subscribeToChatGroupMembers(projectId, onChange) {
    const timer = setInterval(() => onChange(), DATA_REFRESH_POLL_MS);
    return () => clearInterval(timer);
  },

  async markSectionViewed() {},

  async chatToolCreate() { throw new Error("채팅 AI 도구 기능은 아직 지원하지 않습니다."); },
  async chatToolAct() { throw new Error("채팅 AI 도구 기능은 아직 지원하지 않습니다."); },
  async listChatToolEvents() { return []; },
  subscribeToChatToolEvents() { return () => {}; },

  subscribeToPresence(projectId, _memberId, onChange) {
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await apiClient.get<{ onlineMemberIds: string[]; states: Record<string, { status: "active" | "idle"; lastActiveAt: string; onlineAt: string }> }>(`/projects/${projectId}/presence`);
        if (!cancelled) onChange(new Set(data.onlineMemberIds), data.states);
      } catch {
        // 폴링 중 일시적 오류는 다음 주기에 다시 시도
      }
    };
    void poll();
    const timer = setInterval(poll, DATA_REFRESH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  },
  async updatePresenceStatus(_projectId, memberId, status) {
    await apiClient.post(`/projects/members/${memberId}/presence`, { status });
  },
  async touchMemberPresence(memberId) {
    await apiClient.post(`/projects/members/${memberId}/presence/touch`);
  },

  async listBoardPosts() {
    const { data: posts } = await apiClient.get<RawBoardPost[]>("/board/posts");
    return Promise.all(
      posts.map(async (p) => {
        const { stats, attachments, comments, poll } = await loadBoardPostExtras(p.id);
        return toBoardPost(p, stats, attachments, comments, poll);
      }),
    );
  },

  async createBoardPost(input) {
    const attachmentIds = input.attachments.map((a) => boardAttachmentIds.toUuid(Number(a.id))).filter((v): v is string => !!v);
    const { data } = await apiClient.post<RawBoardPost>("/board/posts", {
      title: input.title,
      content: input.content,
      tags: input.tags,
      category: input.category,
      attachmentIds,
      poll: input.poll
        ? {
            question: input.poll.question,
            options: input.poll.options,
            allowMultiple: input.poll.allowMultiple,
            isAnonymous: input.poll.isAnonymous,
            closesAt: input.poll.closesAt ?? null,
          }
        : undefined,
    });
    const { stats, attachments, comments, poll } = await loadBoardPostExtras(data.id);
    return toBoardPost(data, stats, attachments, comments, poll);
  },

  async updateBoardPost(postId, patch) {
    const uuid = boardPostIds.toUuid(postId);
    if (!uuid) return;
    await apiClient.patch(`/board/posts/${uuid}`, { title: patch.title, content: patch.content, tags: patch.tags });
  },

  async deleteBoardPost(postId) {
    const uuid = boardPostIds.toUuid(postId);
    if (!uuid) return;
    await apiClient.delete(`/board/posts/${uuid}`);
  },

  async incrementBoardPostViews(postId) {
    const uuid = boardPostIds.toUuid(postId);
    if (!uuid) return;
    await apiClient.post(`/board/posts/${uuid}/view`);
  },

  async setBoardPostLike(postId, active) {
    const uuid = boardPostIds.toUuid(postId);
    if (!uuid) return;
    await apiClient.post(`/board/posts/${uuid}/like`, { active });
  },

  async getBoardPostComments(postId) {
    const uuid = boardPostIds.toUuid(postId);
    if (!uuid) return [];
    const { data } = await apiClient.get<RawBoardComment[]>(`/board/posts/${uuid}/comments`);
    return nestBoardComments(data);
  },

  async addBoardComment(postId, content, parentCommentId) {
    const uuid = boardPostIds.toUuid(postId);
    if (!uuid) return;
    const parentUuid = parentCommentId != null ? boardCommentIds.toUuid(parentCommentId) : undefined;
    await apiClient.post(`/board/posts/${uuid}/comments`, { content, parentCommentId: parentUuid });
  },

  async deleteBoardComment(commentId) {
    const uuid = boardCommentIds.toUuid(commentId);
    if (!uuid) return;
    await apiClient.delete(`/board/comments/${uuid}`);
  },

  async uploadBoardAttachment(file) {
    const data = await readFileContentForUpload(file);
    const kind: "image" | "file" = file.type.startsWith("image/") ? "image" : "file";
    const { data: raw } = await apiClient.post<RawBoardAttachment>("/board/attachments", {
      name: file.name,
      byteSize: file.size,
      kind,
      mimeType: file.type || undefined,
      data,
    });
    return toBoardAttachment(raw);
  },

  async castBoardPollVote(pollId, optionIds) {
    const uuid = boardPollIds.toUuid(pollId);
    if (!uuid) throw new Error("알 수 없는 투표입니다.");
    const optionUuids = optionIds.map((id) => boardPollOptionIds.toUuid(id)).filter((v): v is string => !!v);
    const { data } = await apiClient.post<RawBoardPollDetail>(`/board/polls/${uuid}/vote`, { optionIds: optionUuids });
    return toBoardPollDetail(data);
  },

  async closeBoardPoll(pollId) {
    const uuid = boardPollIds.toUuid(pollId);
    if (!uuid) return;
    await apiClient.post(`/board/polls/${uuid}/close`);
  },

  async reportBoardPost(postId, reason, detail) {
    const uuid = boardPostIds.toUuid(postId);
    if (!uuid) return;
    await apiClient.post(`/board/posts/${uuid}/report`, { reason, detail });
  },

  async listBoardPostReports(postId) {
    const uuid = boardPostIds.toUuid(postId);
    if (!uuid) return [];
    const { data } = await apiClient.get<RawBoardPostReport[]>(`/board/posts/${uuid}/reports`);
    return data.map((r): BoardPostReport => ({
      id: boardReportIds.toNumber(r.id),
      postId: r.postId ? boardPostIds.toNumber(r.postId) : null,
      postTitle: r.postTitle,
      postExcerpt: r.postExcerpt,
      postAuthorName: r.postAuthorName,
      reporterUserId: r.reporterId,
      reporterName: "",
      reason: r.reason as BoardPostReport["reason"],
      detail: r.detail,
      status: r.status,
      createdAt: r.createdAt,
    }));
  },

  async listAllBoardReports() {
    const { data } = await apiClient.get<RawBoardPostReport[]>("/board/reports");
    return data.map((r): BoardPostReport => ({
      id: boardReportIds.toNumber(r.id),
      postId: r.postId ? boardPostIds.toNumber(r.postId) : null,
      postTitle: r.postTitle,
      postExcerpt: r.postExcerpt,
      postAuthorName: r.postAuthorName,
      reporterUserId: r.reporterId,
      reporterName: "",
      reason: r.reason as BoardPostReport["reason"],
      detail: r.detail,
      status: r.status,
      createdAt: r.createdAt,
    }));
  },

  async getBoardPostContent(postId) {
    const uuid = boardPostIds.toUuid(postId);
    if (!uuid) return null;
    const { data } = await apiClient.get<string | null>(`/board/posts/${uuid}/content`);
    return data;
  },

  async reviewBoardReport(reportId, status) {
    const uuid = boardReportIds.toUuid(reportId);
    if (!uuid) return;
    await apiClient.patch(`/board/reports/${uuid}`, { status });
  },

  // 공지 수집기는 브라우저에서 대학 게시판을 직접 긁어오는 순수 프론트 로직(lib/crawler) —
  // 백엔드엔 캐싱용 /api/campus-notices 같은 엔드포인트가 없어서 항상 클라이언트 크롤러를 쓴다.
  async fetchCampusNotices({ school = "전국", category = "all" } = {}) {
    const { crawlNotices } = await import("../../lib/crawler/crawlerService");
    return (await crawlNotices(school, category as import("../../lib/crawler/types").NoticeCategory)).notices;
  },
  async listScrappedNotices() {
    const { data } = await apiClient.get<
      { id: string; noticeId: string; schoolCode: string; schoolName: string; category: string; title: string; author: string; postDate: string; link: string; createdAt: string }[]
    >("/me/scrapped-notices");
    const { data: me } = await apiClient.get<{ id: string }>("/users/me");
    return data.map((n) => ({
      id: n.id,
      userId: me.id,
      schoolCode: n.schoolCode,
      schoolName: n.schoolName,
      category: n.category as import("../../lib/crawler/types").NoticeCategory,
      title: n.title,
      author: n.author,
      postDate: n.postDate,
      link: n.link,
      createdAt: n.createdAt,
    }));
  },
  async toggleScrapNotice(notice) {
    const { data } = await apiClient.post<{ scrapped: boolean }>("/me/scrapped-notices/toggle", {
      id: notice.id,
      schoolCode: notice.schoolCode,
      schoolName: notice.schoolName,
      category: notice.category,
      title: notice.title,
      author: notice.author,
      postDate: notice.postDate,
      link: notice.link,
    });
    return data.scrapped;
  },
};

// Sidebar의 "참여 코드" 표시/복사에서 쓰는, DataRepository 인터페이스 밖의 talju 전용 헬퍼.
// (초대 토큰 발급은 Supabase 쪽엔 대응 개념이 없어서 공용 인터페이스에는 안 넣음)
export async function createInviteToken(projectId: string): Promise<string> {
  const { data } = await apiClient.post<{ token: string }>(`/projects/${projectId}/invitations`);
  return data.token;
}
