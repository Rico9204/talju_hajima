export type ProjectApprovalStatus = "pending" | "approved" | "rejected";

export interface Project {
  id: string;
  name: string;
  org: string;
  period: string;
  status: "active" | "done";
  startDate?: string;
  endDate?: string;
  approvalStatus: ProjectApprovalStatus;
  completedAt?: string;
  requestedAdminId?: string;
}

export interface NewProjectInput {
  name: string;
  org: string;
  period: string;
  startDate?: string;
  endDate?: string;
  requestedAdminId?: string;
}

export interface AdminProfileSummary {
  id: string;
  displayName: string;
  org: string | null;
  email: string | null;
}

export type ProfileLinkType = "github" | "instagram" | "notion" | "x" | "linkedin" | "behance" | "other";

export interface ProfileLink {
  id: string;
  type: ProfileLinkType;
  url: string;
  label: string;
}

export interface Member {
  id: string;
  userId: string | null;
  name: string;
  role: string;
  major: string;
  student: string;
  school: string | null;
  avatar: string;
  avatarUrl: string | null;
  contact: string | null;
  // Admin-only (see gwanhan.md) — the org/section a leader searches by when
  // routing a new project's approval to this admin. Null for non-admins.
  org: string | null;
  bannerColor: string | null;
  bannerImageUrl: string | null;
  backgroundColor: string | null;
  backgroundGradient: string | null;
  backgroundImageUrl: string | null;
  glassOpacity: number | null;
  glassBlur: number | null;
  links: ProfileLink[];
  tasks: { done: number; total: number };
  activities: number;
  score: number;
  evalCount: number;
  online: boolean;
  responsibilities: string[];
  color: string;
  criteriaScores: { role: number; deadline: number; communication: number; collaboration: number; quality: number };
  isLeader: boolean;
  // 부팀장: 팀장과 같은 일상 운영 권한을 갖지만 팀원 제외·프로젝트 종료·팀장 위임은 할 수 없다.
  isViceLeader: boolean;
  // Only populated for the signed-in member's own row (see
  // visible_evaluation_members in schema.sql) — used to compute the
  // sidebar's "new content" badges for tasks/schedule/workspace.
  tasksViewedAt: string | null;
  scheduleViewedAt: string | null;
  workspaceViewedAt: string | null;
}

export interface TeamData {
  teamLabel: string;
  teamSub: string;
  members: Member[];
}

export interface FileVersion {
  searchText?: string;
  searchStatus?: import("../lib/workspaceSearch").SearchStatus;
  id: number;
  parentVersionId: number | null;
  storagePath: string | null;
  originalName: string | null;
  mimeType: string;
  byteSize: number | null;
  pinned: boolean;
  version: string;
  uploadedBy: string;
  uploadedAt?: string | null;
  date: string;
  size: string;
  note: string;
  current: boolean;
}

export interface FileUploadInput {
  extractedText?: import("../lib/workspaceSearch").ExtractedText;
  tags?: string[];
  file: File;
  folderId: number | null;
  fileId?: number;
  baseVersionId?: number | null;
  note?: string;
}

export interface FileComment {
  memberId: string | null;
  versionId: number | null; // null = 파일 전체 댓글
  reactions: { commentId: number; memberId: string; emoji: string }[];
  id: number;
  author: string;
  avatar: string;
  date: string;
  text: string;
}

export interface WorkspaceFile {
  ownerUserId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  id: number;
  name: string;
  content?: string;
  previewData?: string;
  type: "pdf" | "doc" | "img" | "ppt" | "xls" | "zip";
  uploader: string;
  avatar: string;
  date: string;
  size: string;
  tag: string;
  tags: string[];
  folderId: number | null;
  versions: FileVersion[];
  comments: FileComment[];
}

export interface Folder {
  ownerUserId?: string | null;
  id: number;
  name: string;
  color: string;
  createdBy: string;
  date: string;
}

export type TaskStatus = "todo" | "inprogress" | "review" | "done";
export type TaskPriority = "high" | "mid" | "low";

export interface ChecklistItem {
  id: number;
  text: string;
  done: boolean;
}

export interface TaskComment {
  id: number;
  memberId: string | null;
  author: string;
  avatar: string;
  date: string;
  text: string;
  reactions: TaskCommentReaction[];
}

export interface TaskCommentReaction {
  commentId: number;
  memberId: string;
  emoji: string;
}

export interface Task {
  createdAt?: string | null;
  id: number;
  title: string;
  assignee: string; // primary assignee (first of assigneeIds) — kept for older display code
  avatar: string;
  priority: TaskPriority;
  due: string;
  tags: string[];
  status: TaskStatus;
  color: string;
  assigneeIds: string[]; // member ids; names/avatars resolve via team.members
  checklist: ChecklistItem[];
  comments: TaskComment[];
  teamScheduleEventId: number | null;
  personalScheduleEventId: number | null;
}

export interface NewTaskInput {
  title: string;
  assigneeIds: string[];
  status: TaskStatus;
}

export type ScheduleEventType = "deadline" | "meeting" | "presentation" | "other";
export type ScheduleEventScope = "personal" | "team";
export type ScheduleEventVisibility = "private" | "shared";

export interface ScheduleEvent {
  createdAt?: string | null;
  updatedAt?: string | null;
  id: number;
  title: string;
  date: string; // YYYY-MM-DD — 기간 일정이면 시작일
  endDate: string | null; // YYYY-MM-DD — null이면 하루짜리 일정
  type: ScheduleEventType;
  scope: ScheduleEventScope;
  ownerMemberId: string | null; // scope === "personal"일 때만 존재
  visibility: ScheduleEventVisibility | null; // scope === "personal"일 때만 존재
  hideTitle: boolean;
}

export interface NewScheduleEventInput {
  title: string;
  date: string;
  endDate?: string | null; // 기간 일정일 때만 date보다 뒤 날짜로 지정
  type: ScheduleEventType;
  scope: ScheduleEventScope;
  visibility?: ScheduleEventVisibility; // scope === "personal"일 때 필수
  hideTitle?: boolean;
}

export type BoardCategory = "notice" | "free" | "recruit";

export interface BoardAttachment {
  id: string;
  name: string;
  size: string;
  kind: "image" | "file";
  url: string;
  mimeType?: string;
}

export interface BoardReply {
  id: number;
  authorUserId: string;
  author: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  content: string;
}

export interface BoardComment {
  id: number;
  authorUserId: string;
  author: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  content: string;
  replies: BoardReply[];
}

export interface BoardPost {
  id: number;
  category: BoardCategory;
  title: string;
  content: string;
  authorUserId: string;
  author: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  views: number;
  likes: number;
  likedByMe: boolean;
  pinned: boolean;
  tags: string[];
  attachments: BoardAttachment[];
  commentsCount: number;
  comments: BoardComment[];
}

export interface NewBoardPostInput {
  category: BoardCategory;
  title: string;
  content: string;
  attachments: BoardAttachment[];
}

export interface ChatMessage {
  id: number;
  channelId: string;
  senderId: string;
  text: string;
  fileId: number | null;
  createdAt: string;
  readBy: string[];
  reactions: ChatReaction[];
}

// 서버가 결과를 정하는 채팅 도구(제비뽑기·사다리·룰렛)의 결과 이벤트.
export interface ChatToolEvent {
  id: number;
  messageId: number;
  kind: "draw" | "ladder" | "roulette";
  event: "init" | "draw_pick" | "draw_reveal_all" | "ladder_reveal" | "roulette_spin";
  actorMemberId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  createdAt: string;
}

export interface ChatReaction {
  messageId: number;
  memberId: string;
  emoji: string;
}

export type EvaluationPhase = "midterm" | "final";
export interface EvaluationEntry {
  recipient_id: string;
  role: number;
  deadline: number;
  communication: number;
  collaboration: number;
  quality: number;
  comment: string;
}
export interface PeerEvaluationRecord extends EvaluationEntry {
  id: string;
  evaluator_id: string;
  phase: EvaluationPhase;
  created_at: string;
}
export interface EvaluationData {
  average?: { available: boolean; count: number; score: number | null; criteria: Record<"role" | "deadline" | "communication" | "collaboration" | "quality", number> | null; comments?: string[] };
  records: PeerEvaluationRecord[];
  submitted: boolean;
}

// ── 관리자 가입 신청(교수·교원 증명서 PDF + 운영자 승인) ──
export type AdminDocType = "employment" | "faculty_id" | "appointment" | "other";
export type AdminApplicationStatus = "pending" | "approved" | "rejected";
export interface AdminApplicationInput {
  org: string;
  jobTitle: string;
  contact: string;
  docType: AdminDocType;
  file: File;
  consent: boolean;
}
// 신청자 본인이 보는 신청 상태.
export interface MyAdminApplication {
  id: string;
  status: AdminApplicationStatus;
  org: string;
  jobTitle: string;
  docType: AdminDocType;
  docName: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}
// 운영자가 보는 신청 기록.
export interface AdminApplicationRecord {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  emailConfirmed: boolean;
  org: string;
  jobTitle: string;
  contact: string;
  docType: AdminDocType;
  docName: string;
  docSize: number;
  // 처리 후 원본 PDF를 지우면 null.
  docPath: string | null;
  docDeleted: boolean;
  status: AdminApplicationStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  reviewedByName: string | null;
}
export interface AdminAccount {
  userId: string;
  displayName: string;
  email: string;
  org: string | null;
  isOperator: boolean;
  pendingProjects: number;
}
