import { apiClient } from "./client";
import type { DataRepository } from "../dataRepository";
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
  createdAt: string;
}
function toProject(raw: RawProject): Project {
  const extras = decodeExtras(raw.description);
  return {
    id: raw.id,
    name: raw.name,
    org: extras.org,
    period: extras.period,
    status: "active",
    startDate: extras.startDate,
    endDate: extras.endDate,
    // backend/(NestJS)에는 승인 절차 자체가 없어 늘 승인된 것으로 취급한다.
    approvalStatus: "approved",
  };
}

interface RawMember {
  id: string;
  userId: string;
  role: "owner" | "member";
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
function toMember(raw: RawMember): Member {
  return {
    id: raw.id,
    userId: raw.userId,
    name: raw.user.name,
    role: raw.role === "owner" ? "팀장" : "팀원",
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
    score: raw.user.trustScore ?? 0,
    // 신뢰도 산정 기준 자체가 아직 확정되지 않아서(설계 결정 2번) 항상 0 — "평가 대기" 표시로 이어짐
    evalCount: 0,
    online: false,
    responsibilities: [],
    color: colorForName(raw.user.name),
    criteriaScores: { role: 0, deadline: 0, communication: 0, collaboration: 0, quality: 0 },
    isLeader: raw.role === "owner",
    // 아래 필드들은 backend/(NestJS)가 아직 지원하지 않는, main 쪽에서 나중에 늘어난 항목들 —
    // 타입만 맞춰두고 기본값으로 둔다(5단계: dataRepository 통합 때 실제 값 연결 예정).
    org: null,
    backgroundColor: null,
    backgroundGradient: null,
    backgroundImageUrl: null,
    glassOpacity: null,
    glassBlur: null,
    isViceLeader: false,
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

async function buildFileVersions(projectId: string, file: RawProjectFile, names: Map<string, { name: string; avatar: string }>): Promise<FileVersion[]> {
  const { data: versions } = await apiClient.get<RawFileVersion[]>(`/projects/${projectId}/files/${file.id}/versions`);
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
        id: hashId(file.id),
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
    id: hashId(v.id),
    parentVersionId: v.parentVersionId ? hashId(v.parentVersionId) : null,
    storagePath: null,
    originalName: null,
    mimeType: "text/plain",
    byteSize: null,
    pinned: false,
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
  const [versions, commentsRes] = await Promise.all([
    buildFileVersions(projectId, raw, names),
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
    id: registerFile(raw),
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
  async joinProject(projectId, _actorName, _actorAvatar, input) {
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
    const { data } = await apiClient.get<RawMember[]>(`/projects/${projectId}/members`);
    const members = data.map(toMember);
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
  async transferLeadership() {},

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
      });
    }
    return result;
  },

  async createFolder(projectId, name) {
    const path = `${name}/${KEEP_FILE}`;
    await apiClient.post(`/projects/${projectId}/files/sync`, { files: [{ path, content: "" }] });
    return { id: numericFolderId(projectId, name), name, color: colorForName(name), createdBy: "", date: formatDate(new Date().toISOString()) };
  },

  async listFiles(projectId) {
    const [{ data: files }, names] = await Promise.all([
      apiClient.get<RawProjectFile[]>(`/projects/${projectId}/files`),
      memberNameMap(projectId),
    ]);
    const real = files.filter((f) => !f.path.endsWith(`/${KEEP_FILE}`) && f.path !== KEEP_FILE);
    return Promise.all(real.map((f) => toWorkspaceFile(projectId, f, names)));
  },

  // Workspace.tsx가 실제 File 내용을 읽어 `input.content`로 넘겨준다 (원래 인터페이스는 name+size만
  // 받았는데, 진짜 버전 관리를 하려면 내용이 꼭 필요해서 시그니처를 확장함 — dataRepository.ts 참고).
  async createFile(projectId, input, actorName) {
    const folderName = input.folderId !== null ? folderNameForId(input.folderId) : null;
    const path = folderName ? `${folderName}/${input.name}` : input.name;
    await apiClient.post(`/projects/${projectId}/files/sync`, {
      files: [{ path, content: input.content, note: input.note }],
    });
    const [{ data: files }, names] = await Promise.all([
      apiClient.get<RawProjectFile[]>(`/projects/${projectId}/files`),
      memberNameMap(projectId),
    ]);
    const created = files.find((f) => f.path === path);
    if (!created) throw new Error("파일 생성에 실패했습니다.");
    void actorName;
    return toWorkspaceFile(projectId, created, names);
  },

  // 마찬가지로 실제 새 내용(`content`)이 필요해서 시그니처 확장됨
  async addFileVersion(fileId, _actorName, note, content) {
    const info = fileMetaById.get(fileId);
    if (!info || content === undefined) throw new Error("알 수 없는 파일이거나 내용이 없습니다.");
    await apiClient.post(`/projects/${info.projectId}/files/sync`, {
      files: [{ path: info.path, content, baseVersionId: info.currentVersionId ?? undefined, note }],
    });
  },

  async addFileComment(fileId, _actorName, _actorAvatar, text) {
    const info = fileMetaById.get(fileId);
    if (!info) throw new Error("알 수 없는 파일입니다.");
    const { data } = await apiClient.post<RawFileComment>(`/projects/${info.projectId}/files/${info.uuid}/comments`, { content: text });
    const names = await memberNameMap(info.projectId);
    return {
      id: hashId(data.id),
      author: names.get(data.authorId)?.name ?? "알 수 없음",
      avatar: names.get(data.authorId)?.avatar ?? "?",
      date: formatDate(data.createdAt),
      text: data.content,
    };
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

  async toggleTaskCommentReaction(commentId, emoji) {
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

  async toggleMessageReaction(projectId, messageId, emoji) {
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
};

// Sidebar의 "참여 코드" 표시/복사에서 쓰는, DataRepository 인터페이스 밖의 talju 전용 헬퍼.
// (초대 토큰 발급은 Supabase 쪽엔 대응 개념이 없어서 공용 인터페이스에는 안 넣음)
export async function createInviteToken(projectId: string): Promise<string> {
  const { data } = await apiClient.post<{ token: string }>(`/projects/${projectId}/invitations`);
  return data.token;
}
