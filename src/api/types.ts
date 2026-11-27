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

// 프로젝트 참여 코드. 발급 후 6시간 유효하고, 팀원만 볼 수 있다.
export interface JoinCode {
  joinCode: string;
  joinCodeExpiresAt: string;
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

// 평가 점수의 "상위 N%" — 서비스 전체 사용자(최종 평가 공개된 사람) 기준. 비교 인원이 10명 미만이면 available=false.
export type EvaluationPercentiles =
  | { available: false; population: number }
  | { available: true; population: number; overall: number; criteria: Record<"role" | "deadline" | "communication" | "collaboration" | "quality", number> };

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
  lastSeenAt: string | null;
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

export interface MemberPresenceState {
  status: "active" | "idle";
  lastActiveAt: string;
  onlineAt: string;
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
  uploadedByUserId?: string | null; // 올린 사람의 계정 ID(예전 버전은 null — 그때는 uploadedBy 이름으로 비교)
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
  sortOrder?: number | null; // "직접 정렬" 순서(같은 폴더 안). null = 아직 순서 없음(맨 위에 최신순)
  versions: FileVersion[];
  comments: FileComment[];
}

export interface Folder {
  ownerUserId?: string | null;
  id: number;
  parentId: number | null; // null = 워크스페이스 루트의 폴더. 최대 10단계(DB가 검사)
  name: string;
  color: string;
  createdBy: string;
  date: string;
  sortOrder?: number | null; // 같은 상위 폴더 안의 순서. null = 순서 없음(순서 있는 폴더 뒤에 만든 순서대로)
}

export type TaskStatus = "todo" | "inprogress" | "review" | "done";
export type TaskPriority = "high" | "mid" | "low";

export interface ChecklistItem {
  id: number;
  text: string;
  done: boolean;
  assigneeMemberId?: string | null; // 세부 업무 담당자(그 과제의 담당자 중 한 명), null = 담당자 없음
}

export interface TaskComment {
  id: number;
  memberId: string | null;
  author: string;
  avatar: string;
  date: string;
  text: string;
  kind?: "comment" | "rejection"; // rejection = 팀장·부팀장의 검토 반려 피드백
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
  // 과제 만들기 창에서 고른 경우만(없으면 보통·마감일 없음·태그 없음·세부 업무 없음)
  priority?: TaskPriority;
  due?: string; // YYYY-MM-DD 또는 ""
  tags?: string[];
  checklist?: { text: string; assigneeMemberId: string | null }[];
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
  createdByMemberId?: string | null; // 만든 팀원(서버가 정함). 작성자 기록 전의 팀 일정은 null
  visibility: ScheduleEventVisibility | null; // scope === "personal"일 때만 존재
  hideTitle: boolean;
}

// 메인 화면 프로젝트 카드용: 내 모든 프로젝트의 오늘 이후 일정(남의 제목 숨김 일정은 "바쁨").
export interface UpcomingEvent extends ScheduleEvent {
  projectId: string;
  projectName: string;
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

export type BoardReportReason = "spam" | "abuse" | "sexual" | "privacy" | "other";

export interface BoardPostReport {
  id: number;
  postId: number | null; // 게시글이 삭제되면 null
  postTitle: string;
  postExcerpt: string;
  postAuthorName: string;
  reporterUserId: string;
  reporterName: string;
  reason: BoardReportReason;
  detail: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
}

export interface BoardPollVoter {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface BoardPollOption {
  id: number;
  pollId: number;
  text: string;
  votesCount: number;
  sortOrder: number;
  voters?: BoardPollVoter[];
}

export interface BoardPoll {
  id: number;
  postId: number;
  question: string;
  allowMultiple: boolean;
  isAnonymous: boolean;
  closed: boolean;
  closesAt: string | null;
  createdAt: string;
  options: BoardPollOption[];
  totalVotes: number;
  hasVoted: boolean;
  myOptionIds: number[];
}

export interface NewBoardPollInput {
  question: string;
  options: string[];
  allowMultiple: boolean;
  isAnonymous: boolean;
  closesAt?: string | null;
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
  poll?: BoardPoll | null;
  hideImagePreview?: boolean;
  reportedByMe?: boolean;
}

export interface NewBoardPostInput {
  category: BoardCategory;
  title: string;
  content: string;
  attachments: BoardAttachment[];
  poll?: NewBoardPollInput | null;
  tags?: string[];
  hideImagePreview?: boolean;
}

// 팀장·부팀장이 만든 단체 채팅방. 채널 id는 `grp:${id}`, 참여자에게만 보인다.
export interface ChatGroup {
  id: string;
  name: string;
  memberIds: string[];
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
// 동료 평가 점수 방식: raw = 받은 점수 평균(현재), cca = 성향 보정 합의 평균(미리보기)
export type EvaluationScoreMethod = "raw" | "cca";
export interface EvaluationData {
  average?: { method?: EvaluationScoreMethod; available: boolean; count: number; score: number | null; criteria: Record<"role" | "deadline" | "communication" | "collaboration" | "quality", number> | null; comments?: string[] };
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

// 공지: 기간(startDate~endDate, 한국 시간 날짜)과 대상을 정해 보낸다.
// 시스템 공지(targetAll)는 운영자가 보내 메인 화면에, 프로젝트 공지는 승인 담당 관리자(교수 등)가 보내 그 프로젝트 안에 뜬다.
// 남의 프로필에 보이는 참여 통계 + 동료 평가 점수 공개 기준의 진행 상황.
// 결과가 공개된 종료 평가 프로젝트 requiredProjects개 이상, 나를 평가한 서로 다른 동료 requiredEvaluators명 이상이면 scorePublic.
export interface ParticipationStats {
  projectCount: number;
  collaboratorCount: number;
  evaluationProjects: number;
  evaluationEvaluators: number;
  requiredProjects: number;
  requiredEvaluators: number;
  scorePublic: boolean;
}

// 승인 담당 교수가 보는 개별 평가(성적 반영용). 팀장·팀원에게는 공개하지 않는다.
export interface AdminEvaluationRow {
  phase: "midterm" | "final";
  evaluatorId: string;
  evaluatorName: string;
  recipientId: string;
  recipientName: string;
  criteria: { role: number; deadline: number; communication: number; collaboration: number; quality: number };
  comment: string;
  createdAt: string;
}

export type AnnouncementPriority = "normal" | "important" | "urgent";
export interface Announcement {
  id: number;
  title: string;
  body: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD, 이 날까지 보인다
  targetAll: boolean;
  projectIds: string[]; // targetAll이 false일 때의 대상 프로젝트
  createdAt: string;
  priority: AnnouncementPriority; // 중요·긴급은 확인 전까지 팝업으로도 뜬다
  authorName: string;
  read?: boolean; // 받는 공지 목록에서만: 내가 "확인했어요"를 눌렀는지
  readCount?: number | null; // 관리 목록의 프로젝트 공지에서만(보낸 관리자·운영자): 확인한 팀원 수
  recipientCount?: number | null; // 위와 같음: 대상 프로젝트 팀원 수
}

export interface NewAnnouncementInput {
  title: string;
  body: string;
  startDate: string;
  endDate: string;
  targetAll: boolean;
  projectIds: string[];
  priority: AnnouncementPriority;
}

// 계정 탈퇴: 탈퇴를 신청해도 14일 동안은 계정 정보를 보관하고, 그 안에 복구를 신청할 수 있다.
export interface AccountWithdrawalState {
  requestedAt: string;
  recoveryDeadline: string; // 이 시각까지 복구를 신청할 수 있다
  canRecover: boolean;
  recoveryRequested: boolean; // 복구 신청이 접수돼 운영자 확인을 기다리는 중
  recoveryRejected: boolean; // 복구 신청이 거절됨(다시 신청할 수 없다)
}

// 운영자 화면의 탈퇴 신청·복구 신청 목록 한 줄
export interface AccountWithdrawalRecord {
  userId: string;
  email: string;
  displayName: string;
  reason: string;
  requestedAt: string;
  recoveryRequestedAt: string | null;
  recoveryRejected: boolean;
  purgeAt: string; // 탈퇴 신청 14일 뒤: 이때 자동으로 삭제된다(그 전에 운영자가 승인하면 바로 삭제)
}

export interface AccountWithdrawalLists {
  withdrawals: AccountWithdrawalRecord[]; // 복구를 신청하지 않은 계정
  recoveries: AccountWithdrawalRecord[]; // 복구를 신청한 계정(탈퇴 신청 목록에서는 빠진다)
}

// 전체 알림: 관리자 공지(공지 기간 동안 계속)와 게시판 공지사항(운영자가 쓰면 사용자 전체에게, 최근 30일).
export interface AppNotification {
  kind: "announcement" | "board_notice";
  refId: number; // 관리자 공지 id 또는 게시글 id
  title: string;
  body: string | null; // 관리자 공지만 내용이 있다(게시판 공지는 제목만 알린다)
  startDate: string | null; // 관리자 공지의 기간(YYYY-MM-DD)
  endDate: string | null;
  createdAt: string;
  read: boolean;
}

// 접속 감사(운영자 전용): 사용자 목록 → 사용자가 접속한 IP → 그 IP에서 한 활동(업로드·삭제)
export interface AuditUser {
  userId: string;
  email: string;
  name: string;
  firstAt: string; // 처음 기록된 접속
  lastAt: string; // 마지막 접속
  ipCount: number;
  logins: number;
  uploads: number;
  deletes: number;
  active: boolean; // false = 탈퇴 등으로 삭제된 계정(기록은 보관 기간 동안 남는다)
}

export interface AuditIp {
  ip: string;
  firstAt: string;
  lastAt: string;
  logins: number;
  uploads: number;
  deletes: number;
}

export interface AuditActivity {
  id: number;
  at: string;
  kind: "upload" | "delete";
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  projectId: string | null;
  projectName: string | null;
  detail: Record<string, unknown>;
}
