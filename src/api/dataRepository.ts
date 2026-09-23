import type { EvaluationPhase, EvaluationEntry, EvaluationData } from "./types";
import type {
  Project,
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
  ProfileLink,
  ChatMessage,
  ChatReaction,
  AdminProfileSummary,
  BoardPost,
  NewBoardPostInput,
  BoardCategory,
  BoardAttachment,
  BoardComment,
  BoardPoll,
  MyAdminApplication,
  AdminApplicationInput,
  AdminApplicationRecord,
  AdminAccount,
} from "./types";

/**
 * Every persistence-touching operation the app needs, independent of which
 * backend actually stores the data. Today `./supabase/supabaseDataRepository.ts`
 * is the only implementation. Moving to a self-hosted DB server later means
 * writing a new implementation of this same interface (e.g.
 * `./rest/restDataRepository.ts` calling your own API) and pointing
 * `./index.ts` at it — nothing outside this folder needs to change.
 */
export interface DataRepository {
  isCurrentUserAdmin(): Promise<boolean>;
  listWorkspaceCleanupProjects(): Promise<string[]>;
  getMyEvaluationSummary(): Promise<import("../lib/evaluationSummary").MyEvaluationSummary>;
  getEvaluationMode(): Promise<boolean>;
  setEvaluationMode(enabled: boolean): Promise<void>;
  getEvaluations(projectId: string, phase: EvaluationPhase): Promise<EvaluationData>;
  submitEvaluations(projectId: string, phase: EvaluationPhase, entries: EvaluationEntry[]): Promise<void>;
  completeProject(projectId: string): Promise<Project>;
  listProjects(): Promise<Project[]>;
  listMyProjectIds(): Promise<string[]>;
  getProjectById(projectId: string): Promise<Project | null>;
  createProject(input: NewProjectInput, actorName: string, actorAvatar: string): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
  joinProject(
    projectId: string,
    actorName: string,
    actorAvatar: string,
    input: { school: string; major: string; student: string }
  ): Promise<Member>;
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
  getMemberParticipationStats(userId: string): Promise<{ projectCount: number; collaboratorCount: number }>;
  updateMyProfile(patch: Partial<{
    name: string; major: string; student: string; school: string; avatarUrl: string | null;
    contact: string | null; org: string | null; bannerColor: string | null; bannerImageUrl: string | null;
    backgroundColor: string | null; backgroundGradient: string | null; backgroundImageUrl: string | null;
    glassOpacity: number | null; glassBlur: number | null; links: ProfileLink[];
  }>): Promise<void>;
  uploadAvatar(file: File): Promise<string>;
  uploadBannerImage(file: File): Promise<string>;
  uploadBackgroundImage(file: File): Promise<string>;
  transferLeadership(projectId: string, targetName: string): Promise<void>;

  listFolders(projectId: string): Promise<Folder[]>;
  createFolder(projectId: string, name: string, actorName: string): Promise<Folder>;

  deleteWorkspaceFile(fileId: number): Promise<void>;
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
  addFileComment(fileId: number, actorName: string, actorAvatar: string, text: string): Promise<FileComment>;

  listTasks(projectId: string): Promise<Task[]>;
  createTask(projectId: string, input: NewTaskInput): Promise<Task>;
  updateTaskStatus(taskId: number, status: TaskStatus): Promise<void>;
  updateTaskDetails(
    taskId: number,
    patch: Partial<{ title: string; assigneeIds: string[]; priority: TaskPriority; due: string; tags: string[] }>
  ): Promise<void>;
  deleteTask(taskId: number): Promise<void>;
  addTaskChecklistItem(taskId: number, text: string): Promise<ChecklistItem>;
  toggleTaskChecklistItem(itemId: number, done: boolean): Promise<void>;
  addTaskComment(taskId: number, actorMemberId: string, actorName: string, actorAvatar: string, text: string): Promise<TaskComment>;
  setTaskCommentReaction(commentId: number, memberId: string, emoji: string, active: boolean): Promise<void>;
  subscribeToTaskCommentReactions(projectId: string, onChange: () => void): () => void;
  subscribeToTasks(projectId: string, onChange: () => void): () => void;
  subscribeToScheduleEvents(projectId: string, onChange: () => void): () => void;
  subscribeToFiles(projectId: string, onChange: () => void): () => void;
  setTaskScheduleLink(taskId: number, field: "team" | "personal", eventId: number | null): Promise<void>;

  listScheduleEvents(projectId: string): Promise<ScheduleEvent[]>;
  addScheduleEvent(projectId: string, actorMemberId: string, input: NewScheduleEventInput): Promise<ScheduleEvent>;
  updateScheduleEvent(
    eventId: number,
    patch: Partial<{ title: string; date: string; endDate: string | null; type: ScheduleEventType; visibility: ScheduleEventVisibility; hideTitle: boolean }>
  ): Promise<void>;
  removeScheduleEvent(eventId: number): Promise<void>;

  listMessages(projectId: string, channelId: string): Promise<ChatMessage[]>;
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
  subscribeToReads(projectId: string, onRead: (r: { messageId: number; memberId: string }) => void): () => void;
  subscribeToPresence(projectId: string, memberId: string, onChange: (onlineMemberIds: Set<string>) => void): () => void;

  // Main-screen community board — global, not scoped to any project.
  listBoardPosts(): Promise<BoardPost[]>;
  createBoardPost(input: NewBoardPostInput): Promise<BoardPost>;
  updateBoardPost(
    postId: number,
    patch: Partial<{ category: BoardCategory; title: string; content: string; attachments: BoardAttachment[] }>
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
}
