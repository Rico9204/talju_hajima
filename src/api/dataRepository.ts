import type { EvaluationPhase, EvaluationEntry, EvaluationData } from "./types";
import type {
  Project,
  JoinCode,
  NewProjectInput,
  TeamData,
  Folder,
  WorkspaceFile,
  FileComment,
  Task,
  NewTaskInput,
  TaskStatus,
  TaskPriority,
  ChecklistItem,
  TaskComment,
  ScheduleEvent,
  NewScheduleEventInput,
  ScheduleEventType,
  ScheduleEventVisibility,
  Member,
  MemberPresenceState,
  ProfileLink,
  ChatMessage,
  ChatGroup,
  ChatReaction,
  ChatToolEvent,
  AdminProfileSummary,
  BoardPost,
  NewBoardPostInput,
  BoardCategory,
  BoardAttachment,
  BoardComment,
  BoardPoll,
  BoardPostReport,
  BoardReportReason,
  MyAdminApplication,
  AdminApplicationInput,
  AdminApplicationRecord,
  AdminAccount,
} from "./types";

/**
 * Every persistence-touching operation the app needs, independent of which
 * backend actually stores the data. `./rest/restDataRepository.ts` is the
 * implementation used by the application.
 */
export interface DataRepository {
  isCurrentUserAdmin(): Promise<boolean>;
  listWorkspaceCleanupProjects(): Promise<string[]>;
  getMyEvaluationSummary(): Promise<import("../lib/evaluationSummary").MyEvaluationSummary>;
  getEvaluationMode(): Promise<boolean>;
  setEvaluationMode(enabled: boolean): Promise<void>;
  getEvaluationMethodPreview(): Promise<boolean>;
  setEvaluationMethodPreview(enabled: boolean): Promise<void>;
  getEvaluationScoreCca(): Promise<boolean>;
  setEvaluationScoreCca(enabled: boolean): Promise<void>;
  getEvaluations(projectId: string, phase: EvaluationPhase, method?: import("./types").EvaluationScoreMethod): Promise<EvaluationData>;
  submitEvaluations(projectId: string, phase: EvaluationPhase, entries: EvaluationEntry[]): Promise<void>;
  completeProject(projectId: string): Promise<Project>;
  listProjects(): Promise<Project[]>;
  listMyProjectIds(): Promise<string[]>;
  getProjectById(projectId: string): Promise<Project | null>;
  createProject(input: NewProjectInput, actorName: string, actorAvatar: string): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
  // 참여 코드(6시간 유효)로 참여. projectId는 코드로 찾은 프로젝트(다르면 거절).
  joinProject(projectId: string, code: string, input: { school: string; major: string; student: string }): Promise<Member>;
  lookupProjectByJoinCode(code: string): Promise<Project | null>;
  // 팀원이 보는 지금의 참여 코드(만료됐으면 새로 발급) / 팀장·부팀장이 즉시 재발급
  getJoinCode(projectId: string): Promise<JoinCode>;
  rotateJoinCode(projectId: string): Promise<JoinCode>;
  approveProject(projectId: string): Promise<void>;
  rejectProject(projectId: string): Promise<void>;
  kickMember(memberId: string): Promise<void>;
  setViceLeader(memberId: string, enabled: boolean): Promise<void>;
  searchAdmins(query: string): Promise<AdminProfileSummary[]>;
  isCurrentUserOperator(): Promise<boolean>;
  getMyAdminApplication(): Promise<MyAdminApplication | null>;
  submitAdminApplication(input: AdminApplicationInput): Promise<void>;
  listAdminApplications(): Promise<AdminApplicationRecord[]>;
  getAdminApplicationDocumentUrl(path: string): Promise<string>;
  reviewAdminApplication(id: string, approve: boolean, note: string): Promise<void>;
  cleanupAdminDocument(id: string, path: string): Promise<void>;
  listAdminAccounts(): Promise<AdminAccount[]>;
  revokeAdmin(userId: string): Promise<void>;

  getTeam(projectId: string, adminView?: boolean): Promise<TeamData>;
  // Cross-project participation counts for a teammate's profile card (프로젝트
  // 참여 횟수/함께한 동료 수) — only callable for a user who shares a project
  // with the caller; see member_participation_stats in schema.sql.
  getMemberParticipationStats(userId: string): Promise<import("./types").ParticipationStats>;
  listAdminProjectEvaluations(projectId: string): Promise<import("./types").AdminEvaluationRow[]>; // 승인 담당 교수만
  // 대상 없이: 내 전체 평균의 위치. 대상 지정: 그 프로젝트에서 공개된 그 팀원 점수의 위치.
  getEvaluationPercentiles(target?: { projectId: string; memberId: string }): Promise<import("./types").EvaluationPercentiles>;
  // 웹 푸시(브라우저를 닫아도 알림) 구독: 이 브라우저의 구독을 내 계정에 저장·삭제
  savePushSubscription(subscription: { endpoint: string; p256dh: string; auth: string }): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  updateMyProfile(patch: Partial<{
    name: string; major: string; student: string; school: string; avatarUrl: string | null;
    contact: string | null; org: string | null; bannerColor: string | null; bannerImageUrl: string | null;
    backgroundColor: string | null; backgroundGradient: string | null; backgroundImageUrl: string | null;
    glassOpacity: number | null; glassBlur: number | null; links: ProfileLink[];
  }>): Promise<void>;
  uploadAvatar(file: File): Promise<string>;
  uploadBannerImage(file: File): Promise<string>;
  uploadBackgroundImage(file: File): Promise<string>;
  transferLeadership(projectId: string, targetMemberId: string): Promise<void>;

  listFolders(projectId: string): Promise<Folder[]>;
  createFolder(projectId: string, name: string, actorName: string, parentId: number | null): Promise<Folder>;

  deleteWorkspaceFile(fileId: number): Promise<void>;
  moveWorkspaceFile(fileId: number, folderId: number | null): Promise<void>; // null = 워크스페이스 루트
  moveWorkspaceFolder(folderId: number, parentId: number | null): Promise<void>; // null = 워크스페이스 루트
  reorderWorkspaceItems(kind: "folder" | "file", ids: number[]): Promise<void>; // 같은 폴더 안 항목들을 이 순서로
  deleteWorkspaceFolder(folderId: number): Promise<void>;
  pendingWorkspaceCleanup(projectId: string): Promise<string[]>;
  cleanupWorkspaceFiles(projectId: string): Promise<void>;
  listFiles(projectId: string): Promise<WorkspaceFile[]>;
  uploadFile(projectId: string, input: import("./types").FileUploadInput): Promise<{ fileId: number; versionId: number; branched: boolean }>;
  promoteFileVersion(fileId: number, versionId: number): Promise<void>;
  setFileVersionText(versionId: number, extracted: import("../lib/workspaceSearch").ExtractedText): Promise<void>;
  setFileTags(fileId: number, tags: string[]): Promise<void>;
  pinFileVersion(fileId: number, versionId: number, pinned: boolean): Promise<void>;
  downloadFileVersion(versionId: number): Promise<Blob>;
  setFileCommentReaction(commentId: number, memberId: string, emoji: string, active: boolean): Promise<void>;
  addFileComment(fileId: number, actorName: string, actorAvatar: string, text: string, versionId?: number | null): Promise<FileComment>;

  listTasks(projectId: string): Promise<Task[]>;
  createTask(projectId: string, input: NewTaskInput): Promise<Task>;
  updateTaskStatus(taskId: number, status: TaskStatus): Promise<void>;
  updateTaskDetails(
    taskId: number,
    patch: Partial<{ title: string; assigneeIds: string[]; priority: TaskPriority; due: string; tags: string[] }>
  ): Promise<void>;
  deleteTask(taskId: number): Promise<void>;
  // 세부 업무(체크리스트 항목). 담당자는 그 과제의 담당자 중 한 명 또는 null
  addTaskChecklistItem(taskId: number, text: string, assigneeMemberId: string | null): Promise<ChecklistItem>;
  toggleTaskChecklistItem(itemId: number, done: boolean): Promise<void>;
  setTaskChecklistAssignee(itemId: number, memberId: string | null): Promise<void>;
  deleteTaskChecklistItem(itemId: number): Promise<void>;
  addTaskComment(taskId: number, actorMemberId: string, actorName: string, actorAvatar: string, text: string): Promise<TaskComment>;
  // 검토 중 → 진행 중으로 돌리고 사유를 반려 피드백 댓글로 남긴다(팀장·부팀장)
  rejectTaskReview(taskId: number, reason: string): Promise<TaskComment>;
  setTaskCommentReaction(commentId: number, memberId: string, emoji: string, active: boolean): Promise<void>;
  subscribeToTaskCommentReactions(projectId: string, onChange: () => void): () => void;
  subscribeToTasks(projectId: string, onChange: () => void): () => void;
  subscribeToScheduleEvents(projectId: string, onChange: () => void): () => void;
  subscribeToFiles(projectId: string, onChange: () => void): () => void;
  setTaskScheduleLink(taskId: number, field: "team" | "personal", eventId: number | null): Promise<void>;

  listScheduleEvents(projectId: string): Promise<ScheduleEvent[]>;
  // 메인 화면: 내 모든 프로젝트의 오늘 이후 일정
  listUpcomingEvents(): Promise<import("./types").UpcomingEvent[]>;
  // 메인 화면 "전체 일정": 내 모든 프로젝트의 일정 중 from~to(YYYY-MM-DD, 양끝 포함)와 겹치는 것(지난 일정 포함, 최대 100일)
  listMyScheduleEvents(from: string, to: string): Promise<import("./types").UpcomingEvent[]>;
  // 관리자 공지: 지금 내가 볼 공지(기간 안·내 대상·"다시 보지 않기" 제외), 관리 목록(관리자), 만들기·지우기(관리자), 다시 보지 않기
  listActiveAnnouncements(): Promise<import("./types").Announcement[]>;
  listAnnouncements(): Promise<import("./types").Announcement[]>;
  createAnnouncement(input: import("./types").NewAnnouncementInput): Promise<void>;
  deleteAnnouncement(id: number): Promise<void>;
  dismissAnnouncement(id: number): Promise<void>;
  markAnnouncementRead(id: number): Promise<void>; // "확인했어요"
  subscribeToAnnouncements(onChange: () => void): () => void;
  // 전체 알림 목록(관리자 공지 + 게시판 공지사항)과 읽음 표시. 바뀌면 subscribeToAnnouncements로 알려 준다.
  listNotifications(): Promise<import("./types").AppNotification[]>;
  markNotificationsRead(items: { kind: "announcement" | "board_notice"; refId: number }[]): Promise<void>;
  // 운영자: 탈퇴 신청·복구 신청 목록과 처리(탈퇴 승인 = 14일이 지난 계정의 정보 삭제)
  listAccountWithdrawals(): Promise<import("./types").AccountWithdrawalLists>;
  // 운영자: 접속 감사(사용자 목록, 사용자별 IP 요약, IP별 업로드·삭제 내역). 기록은 1년 보관.
  listAuditUsers(query: string, offset: number): Promise<{ items: import("./types").AuditUser[]; hasMore: boolean }>;
  listAuditIps(userId: string): Promise<import("./types").AuditIp[]>;
  listAuditActivities(userId: string, ip: string, before?: number): Promise<{ items: import("./types").AuditActivity[]; nextBefore: number | null }>;
  approveAccountWithdrawal(userId: string): Promise<void>;
  approveAccountRecovery(userId: string): Promise<void>;
  rejectAccountRecovery(userId: string): Promise<void>;
  // 참여한 프로젝트가 있으면 탈퇴할 수 없으므로 계정 정보 화면이 미리 확인한다 // 공지가 만들어지거나 지워질 때(받으면 listActiveAnnouncements를 다시 읽는다)
  // 오피스 편집(OnlyOffice): 서버에 켜져 있는지, 그 파일의 편집기 설정(서버가 서명)
  getOfficeEditorStatus(): Promise<{ enabled: boolean }>;
  getOfficeEditorConfig(fileId: number): Promise<Record<string, unknown>>;
  addScheduleEvent(projectId: string, actorMemberId: string, input: NewScheduleEventInput): Promise<ScheduleEvent>;
  updateScheduleEvent(
    eventId: number,
    patch: Partial<{ title: string; date: string; endDate: string | null; type: ScheduleEventType; visibility: ScheduleEventVisibility; hideTitle: boolean }>
  ): Promise<void>;
  removeScheduleEvent(eventId: number): Promise<void>;

  listMessages(projectId: string, channelId: string): Promise<ChatMessage[]>;
  listChatGroups(projectId: string): Promise<ChatGroup[]>;
  // 메인 화면 프로젝트 목록의 알림 점: 확인하지 않은 채팅·과제·일정·파일이 있는 내 프로젝트 id들.
  getMyProjectAlerts(): Promise<string[]>;
  // 팀장·부팀장만(서버가 검사). 새 방의 id를 돌려준다.
  createChatGroup(projectId: string, name: string, memberIds: string[]): Promise<string>;
  // 그 방에 참여 중인 팀장·부팀장만(서버가 검사). 이미 참여 중인 사람은 건너뛴다.
  addChatGroupMembers(groupId: string, memberIds: string[]): Promise<void>;
  // 내가 참여한 방에 누가 들어왔을 때(나 자신 포함). 서버 함수만 참여자를 추가할 수 있으므로 위조할 수 없는 신호다.
  subscribeToChatGroupMembers(projectId: string, onChange: () => void): () => void;
  sendMessage(
    projectId: string,
    channelId: string,
    senderMemberId: string,
    input: { text: string; fileId?: number }
  ): Promise<ChatMessage>;
  markChannelRead(projectId: string, channelId: string, readerMemberId: string, messageIds: number[]): Promise<void>;
  markSectionViewed(projectId: string, section: "tasks" | "schedule" | "workspace"): Promise<void>;
  setMessageReaction(projectId: string, messageId: number, memberId: string, emoji: string, active: boolean): Promise<void>;
  subscribeToMessages(
    projectId: string,
    onInsert: (m: ChatMessage) => void,
    onReaction: (change: { active: boolean; reaction: ChatReaction }) => void
  ): () => void;
  // 도구 메시지 등록 + 준비를 한 트랜잭션으로(준비가 실패하면 메시지도 남지 않는다).
  chatToolCreate(projectId: string, channelId: string, text: string, config: Record<string, unknown>): Promise<{ message: ChatMessage; event: ChatToolEvent }>;
  chatToolAct(messageId: number, action: string, args?: Record<string, unknown>): Promise<ChatToolEvent>;
  listChatToolEvents(projectId: string): Promise<ChatToolEvent[]>;
  subscribeToChatToolEvents(projectId: string, onEvent: (e: ChatToolEvent) => void): () => void;
  subscribeToReads(projectId: string, onRead: (r: { messageId: number; memberId: string }) => void): () => void;
  subscribeToPresence(
    projectId: string,
    memberId: string,
    onChange: (onlineMemberIds: Set<string>, states: Record<string, MemberPresenceState>) => void
  ): () => void;
  updatePresenceStatus(projectId: string, memberId: string, status: "active" | "idle"): Promise<void>;
  touchMemberPresence(memberId: string): Promise<void>;

  // Main-screen community board — global, not scoped to any project.
  listBoardPosts(): Promise<BoardPost[]>;
  createBoardPost(input: NewBoardPostInput): Promise<BoardPost>;
  updateBoardPost(
    postId: number,
    patch: Partial<{ category: BoardCategory; title: string; content: string; attachments: BoardAttachment[]; tags: string[]; hideImagePreview: boolean }>
  ): Promise<void>;
  deleteBoardPost(postId: number): Promise<void>;
  incrementBoardPostViews(postId: number): Promise<void>;
  setBoardPostLike(postId: number, active: boolean): Promise<void>;
  getBoardPostComments(postId: number): Promise<BoardComment[]>;
  addBoardComment(postId: number, content: string, parentCommentId?: number): Promise<void>;
  deleteBoardComment(commentId: number): Promise<void>;
  uploadBoardAttachment(file: File): Promise<BoardAttachment>;
  castBoardPollVote(pollId: number, optionIds: number[]): Promise<BoardPoll>;
  closeBoardPoll(pollId: number): Promise<void>;
  setBoardPostPinned(postId: number, pinned: boolean): Promise<void>;
  reportBoardPost(postId: number, reason: BoardReportReason, detail: string): Promise<void>;
  listBoardPostReports(postId: number): Promise<BoardPostReport[]>; // 관리자만
  listAllBoardReports(): Promise<BoardPostReport[]>; // 관리자만, 최신순
  getBoardPostContent(postId: number): Promise<string | null>; // 삭제된 글이면 null
  reviewBoardReport(reportId: number, status: "resolved" | "dismissed"): Promise<void>;

  // Campus notices & contests crawler
  fetchCampusNotices(params: { school?: string; category?: string }): Promise<import("../lib/crawler/types").NoticeItem[]>;
  listScrappedNotices(): Promise<import("../lib/crawler/types").ScrappedNotice[]>;
  toggleScrapNotice(notice: import("../lib/crawler/types").NoticeItem): Promise<boolean>;
}
