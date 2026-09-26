import type { EvaluationData, EvaluationEntry, EvaluationPhase } from "../types";
import type { DataRepository } from "../dataRepository";
import type { AdminAccount, AdminApplicationInput, AdminApplicationRecord, AdminProfileSummary, BoardAttachment, BoardCategory, BoardComment, BoardPoll, BoardPost, BoardPostReport, BoardReportReason, ChatGroup, ChatMessage, ChatToolEvent, ChecklistItem, FileComment, FileUploadInput, Folder, Member, MyAdminApplication, NewBoardPostInput, NewProjectInput, NewScheduleEventInput, NewTaskInput, ProfileLink, Project, ScheduleEvent, ScheduleEventType, ScheduleEventVisibility, Task, TaskComment, TaskPriority, TaskStatus, TeamData, WorkspaceFile } from "../types";
import { ApiClient, type AccessToken } from "./apiClient";
import { RealtimeClient } from "./realtimeClient";

export class RestDataRepository implements DataRepository {
  private readonly api: ApiClient;
  private readonly realtime: RealtimeClient;
  private readonly presenceTracks = new Map<string, (status: "active" | "idle") => void>();

  constructor(baseUrl: string, accessToken: AccessToken) {
    this.api = new ApiClient(baseUrl.replace(/\/$/, ""), accessToken);
    this.realtime = new RealtimeClient(baseUrl.replace(/\/$/, ""), accessToken);
  }

  isCurrentUserAdmin() { return this.api.request<boolean>("/me/is-admin"); }
  listWorkspaceCleanupProjects() { return this.api.request<string[]>("/me/workspace-cleanup-projects"); }
  getMyEvaluationSummary() { return this.api.request<import("../../lib/evaluationSummary").MyEvaluationSummary>("/me/evaluation-summary"); }
  getEvaluationMode() { return this.api.request<boolean>("/evaluation-mode"); }
  setEvaluationMode(enabled: boolean) { return this.api.request<void>("/evaluation-mode", { method: "PUT", body: JSON.stringify({ enabled }) }); }
  getEvaluations(projectId: string, phase: EvaluationPhase) { return this.api.request<EvaluationData>(`/projects/${encodeURIComponent(projectId)}/evaluations/${phase}`); }
  submitEvaluations(projectId: string, phase: EvaluationPhase, entries: EvaluationEntry[]) { return this.api.request<void>(`/projects/${encodeURIComponent(projectId)}/evaluations/${phase}`, { method: "POST", body: JSON.stringify({ entries }) }); }
  completeProject(projectId: string) { return this.api.request<Project>(`/projects/${encodeURIComponent(projectId)}/complete`, { method: "POST" }); }
  listProjects() { return this.api.request<Project[]>("/projects"); }
  listMyProjectIds() { return this.api.request<string[]>("/me/project-ids"); }
  getProjectById(projectId: string) { return this.api.request<Project | null>(`/projects/${encodeURIComponent(projectId)}`); }
  createProject(input: NewProjectInput, _actorName: string, _actorAvatar: string) { return this.api.request<Project>("/projects", { method: "POST", body: JSON.stringify(input) }); }
  deleteProject(projectId: string) { return this.api.request<void>(`/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" }); }
  approveProject(projectId: string) { return this.api.request<void>(`/projects/${encodeURIComponent(projectId)}/approve`, { method: "POST" }); }
  rejectProject(projectId: string) { return this.api.request<void>(`/projects/${encodeURIComponent(projectId)}/reject`, { method: "POST" }); }
  joinProject(projectId: string, _actorName: string, _actorAvatar: string, input: { school: string; major: string; student: string }) { return this.api.request<Member>(`/projects/${encodeURIComponent(projectId)}/join`, { method: "POST", body: JSON.stringify(input) }); }
  getTeam(projectId: string, adminView = false) { return this.api.request<TeamData>(`/projects/${encodeURIComponent(projectId)}/team${adminView ? "?admin=true" : ""}`); }
  getMemberParticipationStats(userId: string) { return this.api.request<{ projectCount: number; collaboratorCount: number }>(`/users/${encodeURIComponent(userId)}/participation-stats`); }
  transferLeadership(projectId: string, targetName: string) { return this.api.request<void>(`/projects/${encodeURIComponent(projectId)}/transfer-leadership`, { method: "POST", body: JSON.stringify({ targetName }) }); }
  setViceLeader(memberId: string, enabled: boolean) { return this.api.request<void>(`/members/${encodeURIComponent(memberId)}/vice-leader`, { method: "PUT", body: JSON.stringify({ enabled }) }); }
  kickMember(memberId: string) { return this.api.request<void>(`/members/${encodeURIComponent(memberId)}`, { method: "DELETE" }); }
  updateMyProfile(patch: Partial<{ name: string; major: string; student: string; school: string; avatarUrl: string | null; contact: string | null; org: string | null; bannerColor: string | null; bannerImageUrl: string | null; backgroundColor: string | null; backgroundGradient: string | null; backgroundImageUrl: string | null; glassOpacity: number | null; glassBlur: number | null; links: ProfileLink[] }>) { return this.api.request<void>("/me/profile", { method: "PATCH", body: JSON.stringify(patch) }); }

  private upload(path: string, file: File, fields: Record<string, string> = {}) {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));
    form.append("file", file);
    return this.api.request<{ url: string }>(path, { method: "POST", body: form });
  }

  async uploadAvatar(file: File) { return (await this.upload("/me/images/avatar", file)).url; }
  async uploadBannerImage(file: File) { return (await this.upload("/me/images/banner", file)).url; }
  async uploadBackgroundImage(file: File) { return (await this.upload("/me/images/background", file)).url; }
  isCurrentUserOperator() { return this.api.request<boolean>("/me/is-operator"); }
  getMyAdminApplication() { return this.api.request<MyAdminApplication | null>("/me/admin-application"); }
  submitAdminApplication(input: AdminApplicationInput) { return this.upload("/me/admin-application", input.file, { org: input.org, jobTitle: input.jobTitle, contact: input.contact, docType: input.docType, consent: String(input.consent) }).then(() => undefined); }
  listAdminApplications() { return this.api.request<AdminApplicationRecord[]>("/admin/applications"); }
  getAdminApplicationDocumentUrl(path: string) { return this.api.request<{ url: string }>(`/admin/applications/document-url?path=${encodeURIComponent(path)}`).then((result) => result.url); }
  reviewAdminApplication(id: string, approve: boolean, note: string) { return this.api.request<void>(`/admin/applications/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ approve, note }) }); }
  cleanupAdminDocument(id: string, path: string) { return this.api.request<void>(`/admin/applications/${encodeURIComponent(id)}/document-cleanup`, { method: "POST", body: JSON.stringify({ path }) }); }
  listAdminAccounts() { return this.api.request<AdminAccount[]>("/admin/accounts"); }
  revokeAdmin(userId: string) { return this.api.request<void>(`/admin/accounts/${encodeURIComponent(userId)}`, { method: "DELETE" }); }
  searchAdmins(query: string) { return this.api.request<AdminProfileSummary[]>(`/admins/search?q=${encodeURIComponent(query)}`); }

  listFolders(projectId: string) { return this.api.request<Folder[]>(`/projects/${encodeURIComponent(projectId)}/folders`); }
  createFolder(projectId: string, name: string, _actorName: string, parentId: number | null) { return this.api.request<Folder>(`/projects/${encodeURIComponent(projectId)}/folders`, { method: "POST", body: JSON.stringify({ name, parentId }) }); }
  deleteWorkspaceFile(fileId: number) { return this.api.request<void>(`/workspace/files/${fileId}`, { method: "DELETE" }); }
  moveWorkspaceFile(fileId: number, folderId: number | null) { return this.api.request<void>(`/workspace/files/${fileId}/move`, { method: "POST", body: JSON.stringify({ folderId }) }); }
  deleteWorkspaceFolder(folderId: number) { return this.api.request<void>(`/workspace/folders/${folderId}`, { method: "DELETE" }); }
  pendingWorkspaceCleanup(projectId: string) { return this.api.request<string[]>(`/projects/${encodeURIComponent(projectId)}/workspace-cleanup`); }
  cleanupWorkspaceFiles(projectId: string) { return this.api.request<void>(`/projects/${encodeURIComponent(projectId)}/workspace-cleanup`, { method: "POST" }); }
  listFiles(projectId: string) { return this.api.request<WorkspaceFile[]>(`/projects/${encodeURIComponent(projectId)}/files`); }
  async uploadFile(projectId: string, input: FileUploadInput) {
    const form = new FormData();
    form.append("file", input.file);
    form.append("folderId", input.folderId === null ? "" : String(input.folderId));
    if (input.fileId !== undefined) form.append("fileId", String(input.fileId));
    if (input.baseVersionId !== undefined && input.baseVersionId !== null) form.append("baseVersionId", String(input.baseVersionId));
    if (input.note) form.append("note", input.note);
    form.append("tags", JSON.stringify(input.tags ?? []));
    if (input.extractedText) { form.append("searchText", input.extractedText.text); form.append("searchStatus", input.extractedText.status); }
    return this.api.request<{ fileId: number; versionId: number; branched: boolean }>(`/projects/${encodeURIComponent(projectId)}/files`, { method: "POST", body: form });
  }
  promoteFileVersion(fileId: number, versionId: number) { return this.api.request<void>(`/workspace/files/${fileId}/versions/${versionId}/promote`, { method: "POST" }); }
  setFileVersionText(versionId: number, extracted: import("../../lib/workspaceSearch").ExtractedText) { return this.api.request<void>(`/workspace/versions/${versionId}/text`, { method: "PUT", body: JSON.stringify({ text: extracted.text, status: extracted.status }) }); }
  setFileTags(fileId: number, tags: string[]) { return this.api.request<void>(`/workspace/files/${fileId}/tags`, { method: "PUT", body: JSON.stringify({ tags }) }); }
  pinFileVersion(fileId: number, versionId: number, pinned: boolean) { return this.api.request<void>(`/workspace/files/${fileId}/versions/${versionId}/pinned`, { method: "PUT", body: JSON.stringify({ pinned }) }); }
  downloadFileVersion(versionId: number) { return this.api.download(`/workspace/versions/${versionId}/download`); }
  setFileCommentReaction(commentId: number, _memberId: string, emoji: string, active: boolean) { return this.api.request<void>(`/workspace/comments/${commentId}/reaction`, { method: "PUT", body: JSON.stringify({ emoji, active }) }); }
  addFileComment(fileId: number, _actorName: string, _actorAvatar: string, text: string, versionId?: number | null) { return this.api.request<FileComment>(`/workspace/files/${fileId}/comments`, { method: "POST", body: JSON.stringify({ text, versionId }) }); }

  listTasks(projectId: string) { return this.api.request<Task[]>(`/projects/${encodeURIComponent(projectId)}/tasks`); }
  createTask(projectId: string, input: NewTaskInput) { return this.api.request<Task>(`/projects/${encodeURIComponent(projectId)}/tasks`, { method: "POST", body: JSON.stringify(input) }); }
  updateTaskStatus(taskId: number, status: TaskStatus) { return this.api.request<void>(`/tasks/${taskId}/status`, { method: "PUT", body: JSON.stringify({ status }) }); }
  updateTaskDetails(taskId: number, patch: Partial<{ title: string; assigneeIds: string[]; priority: TaskPriority; due: string; tags: string[] }>) { return this.api.request<void>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(patch) }); }
  deleteTask(taskId: number) { return this.api.request<void>(`/tasks/${taskId}`, { method: "DELETE" }); }
  addTaskChecklistItem(taskId: number, text: string) { return this.api.request<ChecklistItem>(`/tasks/${taskId}/checklist`, { method: "POST", body: JSON.stringify({ text }) }); }
  toggleTaskChecklistItem(itemId: number, done: boolean) { return this.api.request<void>(`/checklist/${itemId}`, { method: "PUT", body: JSON.stringify({ done }) }); }
  addTaskComment(taskId: number, _actorMemberId: string, _actorName: string, _actorAvatar: string, text: string) { return this.api.request<TaskComment>(`/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ text }) }); }
  setTaskCommentReaction(commentId: number, _memberId: string, emoji: string, active: boolean) { return this.api.request<void>(`/task-comments/${commentId}/reaction`, { method: "PUT", body: JSON.stringify({ emoji, active }) }); }
  setTaskScheduleLink(taskId: number, field: "team" | "personal", eventId: number | null) { return this.api.request<void>(`/tasks/${taskId}/schedule-link`, { method: "PUT", body: JSON.stringify({ field, eventId }) }); }
  listScheduleEvents(projectId: string) { return this.api.request<ScheduleEvent[]>(`/projects/${encodeURIComponent(projectId)}/schedule`); }
  addScheduleEvent(projectId: string, _actorMemberId: string, input: NewScheduleEventInput) { return this.api.request<ScheduleEvent>(`/projects/${encodeURIComponent(projectId)}/schedule`, { method: "POST", body: JSON.stringify(input) }); }
  updateScheduleEvent(eventId: number, patch: Partial<{ title: string; date: string; endDate: string | null; type: ScheduleEventType; visibility: ScheduleEventVisibility; hideTitle: boolean }>) { return this.api.request<void>(`/schedule/${eventId}`, { method: "PATCH", body: JSON.stringify(patch) }); }
  removeScheduleEvent(eventId: number) { return this.api.request<void>(`/schedule/${eventId}`, { method: "DELETE" }); }
  listBoardPosts() { return this.api.request<BoardPost[]>("/board/posts"); }
  createBoardPost(input: NewBoardPostInput) { return this.api.request<BoardPost>("/board/posts", { method: "POST", body: JSON.stringify(input) }); }
  updateBoardPost(postId: number, patch: Partial<{ category: BoardCategory; title: string; content: string; attachments: BoardAttachment[]; tags: string[]; hideImagePreview: boolean }>) { return this.api.request<void>(`/board/posts/${postId}`, { method: "PATCH", body: JSON.stringify(patch) }); }
  deleteBoardPost(postId: number) { return this.api.request<void>(`/board/posts/${postId}`, { method: "DELETE" }); }
  incrementBoardPostViews(postId: number) { return this.api.request<void>(`/board/posts/${postId}/views`, { method: "POST" }); }
  setBoardPostLike(postId: number, active: boolean) { return this.api.request<void>(`/board/posts/${postId}/like`, { method: "PUT", body: JSON.stringify({ active }) }); }
  getBoardPostComments(postId: number) { return this.api.request<BoardComment[]>(`/board/posts/${postId}/comments`); }
  addBoardComment(postId: number, content: string, parentCommentId?: number) { return this.api.request<void>(`/board/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ content, parentCommentId }) }); }
  deleteBoardComment(commentId: number) { return this.api.request<void>(`/board/comments/${commentId}`, { method: "DELETE" }); }
  async uploadBoardAttachment(file: File) { return this.upload("/board/attachments", file) as Promise<BoardAttachment>; }
  castBoardPollVote(pollId: number, optionIds: number[]) { return this.api.request<BoardPoll>(`/board/polls/${pollId}/votes`, { method: "POST", body: JSON.stringify({ optionIds }) }); }
  closeBoardPoll(pollId: number) { return this.api.request<void>(`/board/polls/${pollId}/close`, { method: "POST" }); }
  reportBoardPost(postId: number, reason: BoardReportReason, detail: string) { return this.api.request<void>(`/board/posts/${postId}/reports`, { method: "POST", body: JSON.stringify({ reason, detail }) }); }
  listBoardPostReports(postId: number) { return this.api.request<BoardPostReport[]>(`/board/posts/${postId}/reports`); }
  listAllBoardReports() { return this.api.request<BoardPostReport[]>("/board/reports"); }
  getBoardPostContent(postId: number) { return this.api.request<{ content: string | null }>(`/board/posts/${postId}/content`).then((result) => result.content); }
  reviewBoardReport(reportId: number, status: "resolved" | "dismissed") { return this.api.request<void>(`/board/reports/${reportId}/review`, { method: "POST", body: JSON.stringify({ status }) }); }
  listMessages(projectId: string, channelId: string) { return this.api.request<ChatMessage[]>(`/projects/${encodeURIComponent(projectId)}/chat/${encodeURIComponent(channelId)}/messages`); }
  listChatGroups(projectId: string) { return this.api.request<ChatGroup[]>(`/projects/${encodeURIComponent(projectId)}/chat-groups`); }
  getMyProjectAlerts() { return this.api.request<string[]>("/me/project-alerts"); }
  createChatGroup(projectId: string, name: string, memberIds: string[]) { return this.api.request<{ id: string }>(`/projects/${encodeURIComponent(projectId)}/chat-groups`, { method: "POST", body: JSON.stringify({ name, memberIds }) }).then((result) => result.id); }
  addChatGroupMembers(groupId: string, memberIds: string[]) { return this.api.request<void>(`/chat-groups/${encodeURIComponent(groupId)}/members`, { method: "POST", body: JSON.stringify({ memberIds }) }); }
  sendMessage(projectId: string, channelId: string, _senderMemberId: string, input: { text: string; fileId?: number }) { return this.api.request<ChatMessage>(`/projects/${encodeURIComponent(projectId)}/chat/${encodeURIComponent(channelId)}/messages`, { method: "POST", body: JSON.stringify(input) }); }
  markChannelRead(projectId: string, _channelId: string, _readerMemberId: string, messageIds: number[]) { return this.api.request<void>(`/projects/${encodeURIComponent(projectId)}/chat/read`, { method: "POST", body: JSON.stringify({ messageIds }) }); }
  markSectionViewed(projectId: string, section: "tasks" | "schedule" | "workspace") { return this.api.request<void>(`/projects/${encodeURIComponent(projectId)}/sections/${section}/viewed`, { method: "POST" }); }
  setMessageReaction(projectId: string, messageId: number, _memberId: string, emoji: string, active: boolean) { return this.api.request<void>(`/projects/${encodeURIComponent(projectId)}/chat/messages/${messageId}/reaction`, { method: "PUT", body: JSON.stringify({ emoji, active }) }); }
  chatToolCreate(projectId: string, channelId: string, text: string, config: Record<string, unknown>) { return this.api.request<{ message: ChatMessage; event: ChatToolEvent }>(`/projects/${encodeURIComponent(projectId)}/chat/${encodeURIComponent(channelId)}/tools`, { method: "POST", body: JSON.stringify({ text, config }) }); }
  chatToolAct(messageId: number, action: string, args?: Record<string, unknown>) { return this.api.request<ChatToolEvent>(`/chat/messages/${messageId}/tool-actions`, { method: "POST", body: JSON.stringify({ action, args }) }); }
  listChatToolEvents(projectId: string) { return this.api.request<ChatToolEvent[]>(`/projects/${encodeURIComponent(projectId)}/chat-tool-events`); }
  touchMemberPresence(memberId: string) { return this.api.request<void>(`/members/${encodeURIComponent(memberId)}/presence`, { method: "POST" }); }
  subscribeToTaskCommentReactions(projectId: string, onChange: () => void) { return this.realtime.subscribe(`task_comment_reactions:${projectId}`, (message) => { if (message.type === "change") onChange(); }); }
  subscribeToTasks(projectId: string, onChange: () => void) { return this.realtime.subscribe(`tasks:${projectId}`, (message) => { if (message.type === "change") onChange(); }); }
  subscribeToScheduleEvents(projectId: string, onChange: () => void) { return this.realtime.subscribe(`schedule_events:${projectId}`, (message) => { if (message.type === "change") onChange(); }); }
  subscribeToFiles(projectId: string, onChange: () => void) { return this.realtime.subscribe(`files:${projectId}`, (message) => { if (message.type === "change") onChange(); }); }
  subscribeToChatGroupMembers(projectId: string, onChange: () => void) { return this.realtime.subscribe(`chat_group_members:${projectId}`, (message) => { if (message.type === "change") onChange(); }); }
  subscribeToMessages(projectId: string, onInsert: (message: ChatMessage) => void, onReaction: (change: { active: boolean; reaction: import("../types").ChatReaction }) => void) { return this.realtime.subscribe(`chat_messages:${projectId}`, (message) => { if (message.type !== "change") return; if (message.event === "message") onInsert(message.data as ChatMessage); if (message.event === "reaction") onReaction(message.data as { active: boolean; reaction: import("../types").ChatReaction }); }); }
  subscribeToChatToolEvents(projectId: string, onEvent: (event: ChatToolEvent) => void) { return this.realtime.subscribe(`chat_tool_events:${projectId}`, (message) => { if (message.type === "change" && message.event === "tool_event") onEvent(message.data as ChatToolEvent); }); }
  subscribeToReads(projectId: string, onRead: (read: { messageId: number; memberId: string }) => void) { return this.realtime.subscribe(`message_reads:${projectId}`, (message) => { if (message.type === "change" && message.event === "read") onRead(message.data as { messageId: number; memberId: string }); }); }
  subscribeToPresence(projectId: string, memberId: string, onChange: (ids: Set<string>, states: Record<string, import("../types").MemberPresenceState>) => void) {
    const track = (send: (message: Record<string, unknown>) => void, status: "active" | "idle") => send({ type: "track", topic: `presence:${projectId}`, key: memberId, meta: { status, lastActiveAt: new Date().toISOString(), onlineAt: new Date().toISOString() } });
    const unsubscribe = this.realtime.subscribe(`presence:${projectId}`, (message, send) => {
      if (message.type === "joined") { this.presenceTracks.set(projectId, (status) => track(send, status)); track(send, "active"); }
      if (message.type !== "presence") return;
      const state = message.state ?? {}; const states: Record<string, import("../types").MemberPresenceState> = {};
      Object.entries(state).forEach(([id, values]) => { const value = values[0]; if (value) states[id] = { status: value.status === "idle" ? "idle" : "active", lastActiveAt: String(value.lastActiveAt ?? ""), onlineAt: String(value.onlineAt ?? "") }; });
      onChange(new Set(Object.keys(states)), states);
    });
    return () => { this.presenceTracks.delete(projectId); unsubscribe(); };
  }
  updatePresenceStatus(projectId: string, _memberId: string, status: "active" | "idle") { this.presenceTracks.get(projectId)?.(status); return Promise.resolve(); }
}
