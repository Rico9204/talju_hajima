import { MAX_WORKSPACE_FILE_SIZE, WORKSPACE_BUCKET, workspaceFileType, workspaceStoragePath, validateFileTags } from "../../lib/workspaceFiles";
import { formatFileSize as formatAttachmentSize } from "../../lib/boardData";
import { supabase } from "../../lib/supabase";
import { prepareProfileImage } from "../../lib/profileImages";
import type { DataRepository } from "../dataRepository";
import type {
  Project,
  TeamData,
  Member,
  MemberPresenceState,
  Folder,
  WorkspaceFile,
  FileComment,
  Task,
  TaskStatus,
  ChecklistItem,
  TaskComment,
  ScheduleEvent,
  ChatMessage,
  ChatReaction,
  ChatToolEvent,
  AdminProfileSummary,
  BoardPost,
  BoardComment,
  BoardAttachment,
  BoardPoll,
  BoardPollOption,
  BoardPollVoter,
  BoardPostReport,
  BoardReportReason,
} from "../types";
import type { NoticeItem, ScrappedNotice } from "../../lib/crawler/types";

const FOLDER_COLOR_PALETTE = ["#2563eb", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444", "#06b6d4"];

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "");
  return (base || "project") + "-" + Date.now().toString(36);
}

// 사용자 기기 시간대 기준 오늘(YYYY-MM-DD). toISOString()은 UTC라 한국 시간 새벽 0~9시에 전날이 된다.
function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function mapProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    org: row.org,
    period: row.period,
    status: row.status,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    approvalStatus: row.approval_status ?? "approved",
    completedAt: row.completed_at ?? undefined,
    requestedAdminId: row.requested_admin_id ?? undefined,
  };
}

// `profile` is the matching profiles row for row.user_id, when one exists —
// for a real account it's the authoritative source for name/major/student/
// avatar (unified across every project that account is in); members without
// a linked account (no profiles row) fall back to their own denormalized
// columns, same as before.
function mapMember(row: any, profile?: any): Member {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    name: profile?.display_name || row.name,
    role: row.role,
    major: profile?.major || row.major,
    student: profile?.student || row.student,
    school: profile?.school ?? null,
    avatar: profile?.avatar_initial || row.avatar,
    avatarUrl: profile?.avatar_url ?? row.avatar_url ?? null,
    contact: profile?.contact ?? null,
    org: profile?.org ?? null,
    bannerColor: profile?.banner_color ?? null,
    bannerImageUrl: profile?.banner_image_url ?? null,
    backgroundColor: profile?.background_color ?? null,
    backgroundGradient: profile?.background_gradient ?? null,
    backgroundImageUrl: profile?.background_image_url ?? null,
    glassOpacity: profile?.glass_opacity ?? null,
    glassBlur: profile?.glass_blur ?? null,
    links: Array.isArray(profile?.links) ? profile.links : [],
    tasks: { done: row.tasks_done, total: row.tasks_total },
    activities: row.activities,
    score: Number(row.score),
    evalCount: row.eval_count,
    online: row.online,
    lastSeenAt: row.last_seen_at ?? null,
    responsibilities: row.responsibilities ?? [],
    color: row.color,
    criteriaScores: {
      role: Number(row.criteria_role),
      deadline: Number(row.criteria_deadline),
      communication: Number(row.criteria_communication),
      collaboration: Number(row.criteria_collaboration),
      quality: Number(row.criteria_quality),
    },
    isLeader: row.is_leader,
    isViceLeader: row.is_vice_leader === true,
    tasksViewedAt: row.tasks_viewed_at ?? null,
    scheduleViewedAt: row.schedule_viewed_at ?? null,
    workspaceViewedAt: row.workspace_viewed_at ?? null,
  };
}

function mapFolder(row: any): Folder {
  return { id: row.id, name: row.name, color: row.color, createdBy: row.created_by, ownerUserId: row.owner_user_id ?? null, date: row.date };
}

function mapFile(row: any): WorkspaceFile {
  const versions = (row.file_versions ?? [])
    .slice()
    .sort((a: any, b: any) => b.id - a.id)
    .map((v: any) => ({ id: v.id, parentVersionId: v.parent_version_id ?? null, storagePath: v.storage_path ?? null, originalName: v.original_name ?? null, mimeType: v.mime_type ?? "application/octet-stream", byteSize: v.byte_size ?? null, pinned: v.pinned ?? false, version: v.version, searchText: v.search_text ?? "", searchStatus: v.search_status ?? "pending", uploadedBy: v.uploaded_by, uploadedAt: v.uploaded_at ?? null, date: v.date, size: v.size, note: v.note, current: v.current }));
  const comments = (row.file_comments ?? [])
    .slice()
    .sort((a: any, b: any) => a.id - b.id)
    .map((c: any) => mapComment(c));
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    uploader: row.uploader,
    avatar: row.avatar,
    date: row.date,
    size: row.size,
    tag: row.tag,
    ownerUserId: row.owner_user_id ?? null,
    tags: row.tags ?? (row.tag && row.tag !== "기타" ? [row.tag] : []),
    folderId: row.folder_id,
    versions,
    comments,
  };
}

function mapComment(row: any): FileComment {
  return { id: row.id, memberId: row.member_id ?? null, versionId: row.version_id ?? null, reactions: (row.file_comment_reactions ?? []).map((r: any) => ({ commentId: row.id, memberId: r.member_id, emoji: r.emoji })), author: row.author, avatar: row.avatar, date: row.date, text: row.text };
}

function mapChecklistItem(row: any): ChecklistItem {
  return { id: row.id, text: row.text, done: row.done };
}

function mapTaskComment(row: any): TaskComment {
  return {
    id: row.id,
    memberId: row.member_id ?? null,
    author: row.author,
    avatar: row.avatar,
    date: row.date,
    text: row.text,
    reactions: (row.task_comment_reactions ?? []).map((reaction: any) => ({ commentId: row.id, memberId: reaction.member_id, emoji: reaction.emoji })),
  };
}

function mapTask(row: any): Task {
  return {
    createdAt: row.created_at ?? null,
    id: row.id,
    title: row.title,
    assignee: row.assignee,
    avatar: row.avatar,
    priority: row.priority,
    due: row.due,
    tags: row.tags ?? [],
    status: row.status,
    color: row.color,
    assigneeIds: (row.task_assignees ?? []).map((a: any) => a.member_id),
    checklist: (row.task_checklist_items ?? []).map(mapChecklistItem),
    comments: (row.task_comments ?? []).map(mapTaskComment),
    teamScheduleEventId: row.team_schedule_event_id,
    personalScheduleEventId: row.personal_schedule_event_id,
  };
}

function mapScheduleEvent(row: any): ScheduleEvent {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    endDate: row.end_date ?? null,
    type: row.type,
    scope: row.scope,
    ownerMemberId: row.owner_member_id,
    visibility: row.visibility,
    hideTitle: row.hide_title,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// chat_tool_events 행(snake_case) 또는 RPC가 돌려주는 JSON(camelCase) 모두 받는다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToolEvent(row: any): ChatToolEvent {
  return {
    id: row.id,
    messageId: row.messageId ?? row.message_id,
    kind: row.kind,
    event: row.event,
    actorMemberId: row.actorMemberId ?? row.actor_member_id ?? null,
    data: row.data ?? {},
    createdAt: row.createdAt ?? row.created_at,
  };
}

function mapMessage(row: any): ChatMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    senderId: row.sender_id,
    text: row.text,
    fileId: row.file_id,
    createdAt: row.created_at,
    readBy: (row.message_reads ?? []).map((r: any) => r.member_id),
    reactions: (row.message_reactions ?? []).map((r: any) => ({ messageId: row.id, memberId: r.member_id, emoji: r.emoji })),
  };
}

async function fetchProfilesById(userIds: string[]): Promise<Record<string, any>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase.from("profiles").select("*").in("id", userIds);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((p: any) => [p.id, p]));
}

function mapBoardPost(row: any, profile: any, likedByMe: boolean, poll?: BoardPoll | null): BoardPost {
  const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
  const hideImagePreview = Boolean(row.hide_image_preview || tags.includes("hide_image_preview") || tags.includes("no_preview"));
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    authorUserId: row.author_user_id,
    author: profile?.display_name || "탈퇴한 사용자",
    authorAvatarUrl: profile?.avatar_url ?? null,
    createdAt: row.created_at,
    views: row.views,
    likes: row.likes_count,
    likedByMe,
    pinned: row.pinned,
    tags,
    attachments: row.attachments ?? [],
    commentsCount: row.comments_count,
    comments: [],
    poll: poll ?? null,
    hideImagePreview,
  };
}

// 투표 행 + 항목 + 투표 기록(board_poll_votes_view RPC)으로 BoardPoll을 만든다(게시글 id 기준 Map).
// 익명 투표는 서버가 다른 사람의 user_id를 내려주지 않는다.
async function mapReports(rows: any[]): Promise<BoardPostReport[]> {
  const userIds = [...new Set(rows.flatMap((r: any) => [r.reporter_user_id, r.post_author_user_id]).filter(Boolean))] as string[];
  const profiles = await fetchProfilesById(userIds);
  return rows.map((r: any): BoardPostReport => ({
    id: r.id,
    postId: r.post_id,
    postTitle: r.post_title,
    postExcerpt: r.post_excerpt,
    postAuthorName: profiles[r.post_author_user_id]?.display_name || "알 수 없음",
    reporterUserId: r.reporter_user_id,
    reporterName: profiles[r.reporter_user_id]?.display_name || "알 수 없음",
    reason: r.reason as BoardReportReason,
    detail: r.detail,
    status: r.status,
    createdAt: r.created_at,
  }));
}

async function buildPolls(pollRows: any[], currentUserId: string | null): Promise<Map<number, BoardPoll>> {
  const result = new Map<number, BoardPoll>();
  if (pollRows.length === 0) return result;
  const pollIds = pollRows.map((p: any) => p.id);
  const [optionsRes, votesRes] = await Promise.all([
    supabase.from("board_poll_options").select("*").in("poll_id", pollIds).order("sort_order", { ascending: true }),
    supabase.rpc("board_poll_votes_view", { p_poll_ids: pollIds }),
  ]);
  if (optionsRes.error) throw optionsRes.error;
  if (votesRes.error) throw votesRes.error;

  const votesByPoll = new Map<number, any[]>();
  for (const v of (votesRes.data ?? []) as any[]) {
    const list = votesByPoll.get(v.poll_id) ?? [];
    list.push(v);
    votesByPoll.set(v.poll_id, list);
  }
  const voterUserIds = new Set<string>();
  for (const pollRow of pollRows) {
    if (pollRow.is_anonymous) continue;
    for (const v of votesByPoll.get(pollRow.id) ?? []) if (v.user_id) voterUserIds.add(v.user_id);
  }
  const voterProfiles = voterUserIds.size > 0 ? await fetchProfilesById([...voterUserIds]) : {};

  for (const pollRow of pollRows) {
    const pollVotes = votesByPoll.get(pollRow.id) ?? [];
    const myOptionIds = currentUserId ? pollVotes.filter((v: any) => v.user_id === currentUserId).map((v: any) => v.option_id) : [];
    const options: BoardPollOption[] = (optionsRes.data ?? [])
      .filter((opt: any) => opt.poll_id === pollRow.id)
      .map((opt: any) => {
        const optionVotes = pollVotes.filter((v: any) => v.option_id === opt.id);
        const voters: BoardPollVoter[] = pollRow.is_anonymous
          ? []
          : optionVotes
              .filter((v: any) => v.user_id)
              .map((v: any) => ({
                userId: v.user_id,
                name: voterProfiles[v.user_id]?.display_name || "참여자",
                avatarUrl: voterProfiles[v.user_id]?.avatar_url ?? null,
              }));
        return { id: opt.id, pollId: opt.poll_id, text: opt.text, votesCount: optionVotes.length, sortOrder: opt.sort_order, voters };
      });
    const isExpired = pollRow.closes_at ? new Date(pollRow.closes_at).getTime() <= Date.now() : false;
    result.set(pollRow.post_id, {
      id: pollRow.id,
      postId: pollRow.post_id,
      question: pollRow.question,
      allowMultiple: pollRow.allow_multiple,
      isAnonymous: pollRow.is_anonymous,
      closed: pollRow.closed || isExpired,
      closesAt: pollRow.closes_at,
      createdAt: pollRow.created_at,
      options,
      totalVotes: new Set(pollVotes.map((v: any) => v.voter_ref)).size,
      hasVoted: myOptionIds.length > 0,
      myOptionIds,
    });
  }
  return result;
}

// 투표 마이그레이션 전이거나 조회에 실패해도 게시판 자체는 열리도록 투표만 빼고 보여준다.
async function fetchPollsForPosts(postIds: number[], currentUserId: string | null): Promise<Map<number, BoardPoll>> {
  if (postIds.length === 0) return new Map();
  try {
    const { data, error } = await supabase.from("board_polls").select("*").in("post_id", postIds);
    if (error) throw error;
    return await buildPolls(data ?? [], currentUserId);
  } catch (err) {
    console.warn("투표 데이터를 불러오지 못했습니다:", err);
    return new Map();
  }
}

async function fetchSinglePoll(pollId: number, currentUserId: string | null): Promise<BoardPoll> {
  const { data, error } = await supabase.from("board_polls").select("*").eq("id", pollId).single();
  if (error || !data) throw error || new Error("투표를 찾을 수 없습니다.");
  const poll = (await buildPolls([data], currentUserId)).get(data.post_id);
  if (!poll) throw new Error("투표를 찾을 수 없습니다.");
  return poll;
}

import { summarizeEvaluations } from "../../lib/evaluationSummary";
import { ADMIN_VERIFICATION_BUCKET, hasPdfSignature, validateAdminDocument } from "../../lib/adminApplication";
import type { AdminAccount, AdminApplicationRecord, MyAdminApplication } from "../types";

function mapMyAdminApplication(row: any): MyAdminApplication {
  return {
    id: row.id,
    status: row.status,
    org: row.org,
    jobTitle: row.job_title,
    docType: row.doc_type,
    docName: row.doc_name,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewNote: row.review_note ?? null,
  };
}

function mapAdminApplicationRecord(row: any): AdminApplicationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name ?? "이름 없음",
    email: row.email ?? "",
    emailConfirmed: row.email_confirmed === true,
    org: row.org,
    jobTitle: row.job_title,
    contact: row.contact,
    docType: row.doc_type,
    docName: row.doc_name,
    docSize: Number(row.doc_size),
    docPath: row.doc_path ?? null,
    docDeleted: !!row.doc_deleted_at,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewNote: row.review_note ?? null,
    reviewedByName: row.reviewed_by_name ?? null,
  };
}

function mapAdminAccount(row: any): AdminAccount {
  return {
    userId: row.user_id,
    displayName: row.display_name ?? "이름 없음",
    email: row.email ?? "",
    org: row.org ?? null,
    isOperator: row.is_operator === true,
    pendingProjects: Number(row.pending_projects ?? 0),
  };
}

export const supabaseDataRepository: DataRepository = {
  async isCurrentUserAdmin() {
    const { data, error } = await supabase.rpc("is_admin");
    if (error) throw error;
    return data === true;
  },
  async getMyEvaluationSummary() {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!auth.user) throw new Error("로그인이 필요합니다.");
    const { data, error } = await supabase.rpc("visible_evaluation_members");
    if (error) throw error;
    const rows = data ?? [];
    // 참여 횟수/동료 수는 종료(done)된 프로젝트만 결산한다.
    const allProjectIds = [...new Set(rows.map((row: any) => row.project_id))];
    let projectIds: string[] = [];
    if (allProjectIds.length) {
      const { data: doneProjects, error: doneError } = await supabase
        .from("projects").select("id").eq("status", "done").in("id", allProjectIds);
      if (doneError) throw doneError;
      projectIds = (doneProjects ?? []).map((p: any) => p.id);
    }
    // Collaborator count: everyone else across every project I'm in, deduped
    // by user_id for real accounts — a member row with no linked account
    // (seeded/demo teammate) has no identity to dedupe across projects by,
    // so each such row counts as its own person instead of being dropped.
    let collaboratorCount = 0;
    if (projectIds.length) {
      const { data: teammates, error: teammatesError } = await supabase
        .from("members").select("id, user_id").in("project_id", projectIds);
      if (teammatesError) throw teammatesError;
      collaboratorCount = new Set(
        (teammates ?? []).filter((m: any) => m.user_id !== auth.user!.id).map((m: any) => m.user_id ?? `row:${m.id}`)
      ).size;
    }
    return summarizeEvaluations(rows.map((row: any) => mapMember(row)), projectIds.length, collaboratorCount);
  },
  async getEvaluationMode() {
    const { data, error } = await supabase.rpc("evaluation_prototype_enabled");
    if (error) throw error;
    return data === true;
  },
  async setEvaluationMode(enabled) {
    const { error } = await supabase.rpc("set_evaluation_prototype_enabled", { p_enabled: enabled });
    if (error) throw error;
  },
  async getEvaluations(projectId, phase) {
    const [records, submissions, average] = await Promise.all([
      supabase.from("peer_evaluations").select("*").eq("project_id", projectId).eq("phase", phase).order("created_at"),
      supabase.from("peer_evaluation_submissions").select("id").eq("project_id", projectId).eq("phase", phase),
      supabase.rpc("my_evaluation_average", { p_project_id: projectId, p_phase: phase }),
    ]);
    if (records.error) throw records.error;
    if (submissions.error) throw submissions.error;
    if (average.error) throw average.error;
    return { records: records.data ?? [], submitted: !!submissions.data?.length, average: average.data };
  },
  async submitEvaluations(projectId, phase, entries) {
    const { error } = await supabase.rpc("submit_peer_evaluations", { p_project_id: projectId, p_phase: phase, p_entries: entries });
    if (error) throw error;
  },
  async completeProject(projectId) {
    const { error } = await supabase.rpc("complete_evaluation_project", { p_project_id: projectId });
    if (error) throw error;
    const { data, error: readError } = await supabase.from("projects").select("*").eq("id", projectId).single();
    if (readError) throw readError;
    if (data.status !== "done") throw new Error("프로젝트 종료가 저장되지 않았습니다. DB의 프로젝트 종료 함수와 트리거를 확인해 주세요.");
    return mapProject(data);
  },
  async listProjects() {
    const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapProject);
  },

  async listMyProjectIds() {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];
    const { data, error } = await supabase.from("members").select("project_id").eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((r) => r.project_id);
  },

  async getProjectById(projectId) {
    const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
    if (error) throw error;
    return data ? mapProject(data) : null;
  },

  async createProject(input, actorName, actorAvatar) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");

    const id = slugify(input.name);
    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .insert({
        id,
        name: input.name.trim() || "새 프로젝트",
        org: input.org.trim() || "소속 미지정",
        period: input.period.trim() || "진행 중",
        status: "active",
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
        requested_admin_id: input.requestedAdminId ?? null,
      })
      .select()
      .single();
    if (projectError) throw projectError;

    const { error: teamError } = await supabase
      .from("teams")
      .insert({ project_id: id, team_label: `${projectRow.name} 팀`, team_sub: `${projectRow.org} · 팀원을 초대해보세요` });
    if (teamError) throw teamError;

    const { error: memberError } = await supabase.from("members").insert({
      project_id: id,
      // user_id is force-set by the set_member_user_id trigger — never sent
      // from the client (see the comment on the members.user_id column).
      name: actorName,
      role: "팀장",
      major: "역사문화학과 3학년",
      student: "2021123456",
      avatar: actorAvatar,
      tasks_done: 0,
      tasks_total: 0,
      activities: 0,
      score: 0,
      eval_count: 0,
      online: true,
      responsibilities: [],
      color: "#2563eb",
      criteria_role: 0,
      criteria_deadline: 0,
      criteria_communication: 0,
      criteria_collaboration: 0,
      criteria_quality: 0,
      is_leader: true,
    });
    if (memberError) throw memberError;

    return mapProject(projectRow);
  },

  async deleteProject(projectId) {
    // teams/members/folders/files/tasks all cascade-delete via their FK to
    // projects, so removing the project row is enough.
    const { error } = await supabase.rpc("delete_managed_project", { p_project_id: projectId });
    if (error) throw error;
  },

  async approveProject(projectId) {
    const { error } = await supabase.rpc("review_project", { p_project_id: projectId, p_status: "approved" });
    if (error) throw error;
  },

  async rejectProject(projectId) {
    const { error } = await supabase.rpc("review_project", { p_project_id: projectId, p_status: "rejected" });
    if (error) throw error;
  },

  async joinProject(projectId, actorName, actorAvatar, input) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");

    const { count, error: countError } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (countError) throw new Error(countError.message);

    // No .select() chained on the insert itself: RETURNING a row from an
    // INSERT also has to satisfy the table's SELECT policy (is_project_member),
    // which for THIS exact row means "does a member row for me in this project
    // exist" — true only once this very row exists, which isn't reliably
    // visible to that self-referential check within the same statement. A
    // separate follow-up select (its own statement, row already committed)
    // sidesteps that instead of fighting it.
    const { error } = await supabase.from("members").insert({
      project_id: projectId,
      // user_id is force-set by the set_member_user_id trigger — never sent
      // from the client (see the comment on the members.user_id column).
      name: actorName,
      role: "팀원",
      major: input.major.trim() || "전공 미지정",
      student: input.student.trim() || "-",
      avatar: actorAvatar,
      tasks_done: 0,
      tasks_total: 0,
      activities: 0,
      score: 0,
      eval_count: 0,
      online: true,
      responsibilities: [],
      color: FOLDER_COLOR_PALETTE[(count ?? 0) % FOLDER_COLOR_PALETTE.length],
      criteria_role: 0,
      criteria_deadline: 0,
      criteria_communication: 0,
      criteria_collaboration: 0,
      criteria_quality: 0,
      is_leader: false,
    });
    if (error) {
      if (error.code === "23505") throw new Error("이미 참여한 프로젝트입니다.");
      throw new Error(`[${error.code ?? "?"}] ${error.message}`);
    }

    // School/major/student are now account-wide (see profiles table) — the
    // join form is real user input, unlike createProject's placeholder
    // defaults, so it's the right moment to sync it there too.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        school: input.school.trim() || null,
        major: input.major.trim() || null,
        student: input.student.trim() || null,
      })
      .eq("id", userId);
    if (profileError) throw profileError;

    const { data, error: fetchError } = await supabase
      .rpc("visible_evaluation_members", { p_project_id: projectId })
      .eq("user_id", userId)
      .single();
    if (fetchError) throw fetchError;

    const { data: profile, error: profileFetchError } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (profileFetchError) throw profileFetchError;
    return mapMember(data, profile);
  },

  async getTeam(projectId, adminView = false): Promise<TeamData> {
    const [teamResult, memberResult] = await Promise.all([
      supabase.from("teams").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.rpc(adminView ? "admin_project_members" : "visible_evaluation_members", { p_project_id: projectId }).order("is_leader", { ascending: false }),
    ]);
    if (teamResult.error) throw teamResult.error;
    if (memberResult.error) throw memberResult.error;

    const members = memberResult.data ?? [];
    // Two separate queries instead of an embedded select: members.user_id and
    // profiles.id both reference auth.users independently, with no FK between
    // members and profiles themselves for PostgREST to embed through.
    const userIds = [...new Set(members.map((m: any) => m.user_id).filter((id: unknown): id is string => !!id))];
    let profileById: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase.from("profiles").select("*").in("id", userIds);
      if (profilesError) throw profilesError;
      profileById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
    }

    return {
      teamLabel: teamResult.data?.team_label ?? "팀",
      teamSub: teamResult.data?.team_sub ?? "",
      // 부팀장 정렬은 서버가 아니라 여기서 한다: DB에 부팀장 컬럼이 아직 없어도 팀 목록이 깨지지 않게.
      members: members
        .map((m: any) => mapMember(m, m.user_id ? profileById[m.user_id] : undefined))
        .sort((a: Member, b: Member) => Number(b.isLeader) - Number(a.isLeader) || Number(b.isViceLeader) - Number(a.isViceLeader)),
    };
  },

  async getMemberParticipationStats(userId) {
    const { data, error } = await supabase.rpc("member_participation_stats", { p_user_id: userId });
    if (error) throw error;
    return { projectCount: data?.projectCount ?? 0, collaboratorCount: data?.collaboratorCount ?? 0 };
  },

  async updateMyProfile(patch) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");

    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.display_name = patch.name.trim();
    if (patch.major !== undefined) updates.major = patch.major.trim();
    if (patch.student !== undefined) updates.student = patch.student.trim();
    if (patch.school !== undefined) updates.school = patch.school.trim();
    if (patch.avatarUrl !== undefined) updates.avatar_url = patch.avatarUrl;
    if (patch.contact !== undefined) updates.contact = patch.contact?.trim() || null;
    if (patch.org !== undefined) updates.org = patch.org?.trim() || null;
    if (patch.bannerColor !== undefined) updates.banner_color = patch.bannerColor;
    if (patch.bannerImageUrl !== undefined) updates.banner_image_url = patch.bannerImageUrl;
    if (patch.backgroundColor !== undefined) updates.background_color = patch.backgroundColor;
    if (patch.backgroundGradient !== undefined) updates.background_gradient = patch.backgroundGradient;
    if (patch.backgroundImageUrl !== undefined) updates.background_image_url = patch.backgroundImageUrl;
    if (patch.glassOpacity !== undefined) updates.glass_opacity = patch.glassOpacity;
    if (patch.glassBlur !== undefined) updates.glass_blur = patch.glassBlur;
    if (patch.links !== undefined) updates.links = patch.links;
    if (Object.keys(updates).length === 0) return;
    const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
    if (error) throw error;
  },

  async uploadAvatar(file) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");

    const { type, extension } = await prepareProfileImage(file);
    // Path prefix must be the uploader's own auth.uid() — the avatars_own_write
    // storage policy checks exactly this (see schema.sql).
    const path = `${userId}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: type, upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  },

  async uploadBannerImage(file) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");

    const { type, extension } = await prepareProfileImage(file);
    const path = `${userId}/banner-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: type, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  },

  async uploadBackgroundImage(file) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");

    const { type, extension } = await prepareProfileImage(file);
    const path = `${userId}/background-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: type, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  },

  // SECURITY: leadership transfer is delegated entirely to the
  // `transfer_leadership` Postgres RPC function (SECURITY DEFINER).
  // That function re-checks server-side that the caller (auth.uid())
  // is actually the current project leader before making any change,
  // and performs the "demote old leader / promote new leader" pair as
  // a single atomic transaction. Do NOT replace this with direct
  // `.from("members").update(...)` calls — that path relies solely on
  // client-supplied project_id/name values and, even with RLS in place,
  // reintroduces a route where the authorization check and the write
  // are two separate steps instead of one enforced unit.
  async transferLeadership(projectId, targetName) {
    const { error } = await supabase.rpc("transfer_leadership", {
      p_project_id: projectId,
      p_target_name: targetName,
    });
    if (error) throw error;
  },

  // 부팀장 임명·해임도 DB의 set_vice_leader RPC가 호출자(팀장 또는 관리자)를 다시 검증한다.
  async setViceLeader(memberId, enabled) {
    const { error } = await supabase.rpc("set_vice_leader", { p_member_id: memberId, p_enabled: enabled });
    if (error) throw error;
  },

  async kickMember(memberId) {
    const { error } = await supabase.rpc("kick_project_member", { p_member_id: memberId });
    if (error) throw error;
  },

  // ── 관리자 가입 신청 ──
  // DB 마이그레이션 전에도 앱이 멈추지 않도록, 확인에 실패하면 운영자가 아닌 것으로 본다.
  async isCurrentUserOperator() {
    const { data, error } = await supabase.rpc("is_operator");
    return !error && data === true;
  },

  async getMyAdminApplication() {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!auth.user) throw new Error("로그인이 필요합니다.");
    const { data, error } = await supabase
      .from("admin_applications")
      .select("id,status,org,job_title,doc_type,doc_name,submitted_at,reviewed_at,review_note")
      .eq("user_id", auth.user.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapMyAdminApplication(data) : null;
  },

  // 증명서 PDF를 먼저 올리고, 서버 함수가 파일 존재·PDF 여부·크기를 다시 확인한 뒤 신청서를 만든다.
  async submitAdminApplication(input) {
    const invalid = validateAdminDocument(input.file);
    if (invalid) throw new Error(invalid);
    if (!(await hasPdfSignature(input.file))) throw new Error("PDF 파일만 제출할 수 있습니다.");
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!auth.user) throw new Error("로그인이 필요합니다.");
    const path = `${auth.user.id}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(ADMIN_VERIFICATION_BUCKET)
      .upload(path, input.file, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await supabase.rpc("submit_admin_application", {
      p_org: input.org,
      p_job_title: input.jobTitle,
      p_contact: input.contact,
      p_doc_type: input.docType,
      p_doc_path: path,
      p_doc_name: input.file.name,
      p_consent: input.consent,
    });
    if (error) {
      // 신청서에 연결되지 않은 파일은 남기지 않는다(본인 미연결 파일은 본인이 지울 수 있다).
      await supabase.storage.from(ADMIN_VERIFICATION_BUCKET).remove([path]);
      throw error;
    }
  },

  async listAdminApplications() {
    const { data, error } = await supabase.rpc("list_admin_applications");
    if (error) throw error;
    return (data ?? []).map(mapAdminApplicationRecord);
  },

  // 운영자만 열 수 있고, 링크는 60초 뒤 만료된다.
  async getAdminApplicationDocumentUrl(path) {
    const { data, error } = await supabase.storage.from(ADMIN_VERIFICATION_BUCKET).createSignedUrl(path, 60);
    if (error || !data) throw error ?? new Error("증명서 링크를 만들지 못했습니다.");
    return data.signedUrl;
  },

  async reviewAdminApplication(id, approve, note) {
    const { error } = await supabase.rpc("review_admin_application", { p_id: id, p_approve: approve, p_note: note.trim() || null });
    if (error) throw error;
  },

  // 처리가 끝난 증명서 원본을 Storage API로 지우고, 실제로 지워진 뒤에 DB에 기록한다.
  async cleanupAdminDocument(id, path) {
    const { error } = await supabase.storage.from(ADMIN_VERIFICATION_BUCKET).remove([path]);
    if (error) throw error;
    const { error: markError } = await supabase.rpc("mark_admin_document_deleted", { p_id: id });
    if (markError) throw markError;
  },

  async listAdminAccounts() {
    const { data, error } = await supabase.rpc("list_admins");
    if (error) throw error;
    return (data ?? []).map(mapAdminAccount);
  },

  async revokeAdmin(userId) {
    const { error } = await supabase.rpc("revoke_admin", { p_user_id: userId });
    if (error) throw error;
  },

  async searchAdmins(query): Promise<AdminProfileSummary[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const { data, error } = await supabase.rpc("search_admin_profiles", { q: trimmed });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ id: row.id, displayName: row.display_name, org: row.org, email: row.email }));
  },

  async listFolders(projectId) {
    const { data, error } = await supabase.from("folders").select("*").eq("project_id", projectId).order("id", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapFolder);
  },

  async createFolder(projectId, name, actorName) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("폴더 이름이 비어 있습니다.");
    const { count, error: countError } = await supabase
      .from("folders")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (countError) throw countError;

    const { data, error } = await supabase
      .from("folders")
      .insert({
        project_id: projectId,
        name: trimmed,
        color: FOLDER_COLOR_PALETTE[(count ?? 0) % FOLDER_COLOR_PALETTE.length],
        created_by: actorName,
        date: todayISO(),
      })
      .select()
      .single();
    if (error) throw error;
    return mapFolder(data);
  },

  async deleteWorkspaceFile(fileId) {
    const { error } = await supabase.rpc("delete_workspace_file", { p_file_id: fileId });
    if (error) throw error;
  },
  async moveWorkspaceFile(fileId, folderId) {
    const { error } = await supabase.rpc("move_workspace_file", { p_file_id: fileId, p_folder_id: folderId });
    if (error) throw error;
  },
  async deleteWorkspaceFolder(folderId) {
    const { error } = await supabase.rpc("delete_workspace_folder", { p_folder_id: folderId });
    if (error) throw error;
  },
  async pendingWorkspaceCleanup(projectId) {
    const { data, error } = await supabase.from("workspace_delete_queue").select("storage_path").eq("project_id", projectId).order("storage_path").limit(100);
    if (error) throw error;
    return (data ?? []).map((row) => row.storage_path as string);
  },
  async listWorkspaceCleanupProjects() {
    const { data, error } = await supabase.from("workspace_delete_queue").select("project_id").limit(1000);
    if (error) throw error;
    return [...new Set((data ?? []).map((row) => row.project_id as string))];
  },
  async cleanupWorkspaceFiles(projectId) {
    // Drain in bounded API batches. Failed requests leave the durable retry list.
    for (;;) {
      const paths = await supabaseDataRepository.pendingWorkspaceCleanup(projectId);
      if (!paths.length) return;
      const { error } = await supabase.storage.from(WORKSPACE_BUCKET).remove(paths);
      if (error) throw error;
      const { error: finishError } = await supabase.rpc("finish_workspace_cleanup", { p_project_id: projectId });
      if (finishError) throw finishError;
      const pending = await supabaseDataRepository.pendingWorkspaceCleanup(projectId);
      if (pending.some((path) => paths.includes(path))) throw new Error("일부 원본을 삭제하지 못했습니다. 다시 시도해 주세요.");
    }
  },

  async listFiles(projectId) {
    const { data, error } = await supabase
      .from("files")
      .select("*, file_versions(*), file_comments(*, file_comment_reactions(member_id, emoji))")
      .eq("project_id", projectId)
      .order("id", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapFile);
  },

  async uploadFile(projectId, input) {
    const file = input.file;
    if (file.size > MAX_WORKSPACE_FILE_SIZE) throw new Error("파일은 50MB까지 업로드할 수 있습니다.");
    if (input.tags !== undefined || !input.fileId) validateFileTags(input.tags ?? [], workspaceFileType(file.name) === "img" || file.type.startsWith("image/"));
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!auth.user) throw new Error("로그인이 필요합니다.");
    // Immutable random keys preserve every binary exactly, including duplicate filenames.
    const path = workspaceStoragePath(projectId, auth.user.id, crypto.randomUUID());
    const { error: uploadError } = await supabase.storage.from(WORKSPACE_BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream", upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data, error } = await supabase.rpc("register_workspace_search_version", {
      p_project_id: projectId, p_file_id: input.fileId ?? null,
      p_base_version_id: input.baseVersionId ?? null, p_folder_id: input.folderId,
      p_name: file.name, p_type: workspaceFileType(file.name), p_path: path,
      p_note: input.note ?? "",
      p_tags: input.tags ?? null,
      p_search_text: input.extractedText?.text ?? "", p_search_status: input.extractedText?.status ?? "unsupported",
    });
    if (error) {
      // The delete policy refuses to delete a committed version, even if its
      // successful response was lost. Only unregistered uploads can be cleaned.
      await supabase.storage.from(WORKSPACE_BUCKET).remove([path]);
      throw error;
    }
    return { fileId: data.file_id, versionId: data.version_id, branched: data.branched };
  },

  async promoteFileVersion(fileId, versionId) {
    const { error } = await supabase.rpc("promote_workspace_version", { p_file_id: fileId, p_version_id: versionId });
    if (error) throw error;
  },

  async setFileVersionText(versionId, extracted) {
    const { error } = await supabase.rpc("set_workspace_version_text", { p_version_id: versionId, p_text: extracted.text, p_status: extracted.status });
    if (error) throw error;
  },
  async setFileTags(fileId, tags) {
    validateFileTags(tags, false);
    const { error } = await supabase.rpc("set_workspace_file_tags", { p_file_id: fileId, p_tags: tags });
    if (error) throw error;
  },

  async pinFileVersion(fileId, versionId, pinned) {
    const { error } = await supabase.rpc("pin_workspace_version", { p_file_id: fileId, p_version_id: versionId, p_pinned: pinned });
    if (error) throw error;
  },

  async downloadFileVersion(versionId) {
    const { data, error } = await supabase.from("file_versions").select("storage_path").eq("id", versionId).single();
    if (error) throw error;
    if (!data.storage_path) throw new Error("이전 기록에는 원본 파일이 없습니다. 새 버전을 업로드해 주세요.");
    const { data: blob, error: downloadError } = await supabase.storage.from(WORKSPACE_BUCKET).download(data.storage_path);
    if (downloadError) throw downloadError;
    return blob;
  },

  async setFileCommentReaction(commentId, memberId, emoji, active) {
    if (active) {
      const { error } = await supabase
        .from("file_comment_reactions")
        .upsert({ comment_id: commentId, member_id: memberId, emoji }, { onConflict: "comment_id,member_id,emoji", ignoreDuplicates: true });
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from("file_comment_reactions")
      .delete()
      .eq("comment_id", commentId)
      .eq("member_id", memberId)
      .eq("emoji", emoji);
    if (error) throw error;
  },

  async addFileComment(fileId, actorName, actorAvatar, text, versionId) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("댓글 내용이 비어 있습니다.");
    const { data, error } = await supabase
      .from("file_comments")
      .insert({ file_id: fileId, author: actorName, avatar: actorAvatar, date: todayISO(), text: trimmed, version_id: versionId ?? null })
      .select()
      .single();
    if (error) throw error;
    return mapComment(data);
  },

  async listTasks(projectId) {
    const { data, error } = await supabase
      .from("tasks")
      .select("*, task_assignees(member_id), task_checklist_items(*), task_comments(*, task_comment_reactions(member_id, emoji))")
      .eq("project_id", projectId)
      .order("id", { ascending: true });
    if (!error) return (data ?? []).map(mapTask);

    // Keep the task board usable while a deployment reaches a browser before
    // the optional task-comment reactions migration is applied (or while the
    // PostgREST relationship cache refreshes).
    console.warn("댓글 반응을 불러오지 못해 반응 없이 과제를 표시합니다:", error.message);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("tasks")
      .select("*, task_assignees(member_id), task_checklist_items(*), task_comments(*)")
      .eq("project_id", projectId)
      .order("id", { ascending: true });
    if (fallbackError) throw fallbackError;
    return (fallbackData ?? []).map(mapTask);
  },

  async createTask(projectId, input) {
    if (input.assigneeIds.length === 0) throw new Error("담당자를 한 명 이상 선택해주세요.");
    const { data: firstAssignee, error: memberError } = await supabase
      .from("members")
      .select("name, avatar, color")
      .eq("id", input.assigneeIds[0])
      .single();
    if (memberError) throw memberError;

    const { data: taskRow, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        title: input.title.trim(),
        assignee: firstAssignee.name,
        avatar: firstAssignee.avatar,
        priority: "mid",
        due: "",
        tags: [],
        status: input.status,
        color: firstAssignee.color,
      })
      .select()
      .single();
    if (error) throw error;

    const { error: assigneeError } = await supabase
      .from("task_assignees")
      .insert(input.assigneeIds.map((memberId) => ({ task_id: taskRow.id, member_id: memberId })));
    if (assigneeError) throw assigneeError;

    return mapTask({ ...taskRow, task_assignees: input.assigneeIds.map((id) => ({ member_id: id })), task_checklist_items: [], task_comments: [] });
  },

  async updateTaskStatus(taskId, status: TaskStatus) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) throw error;
  },

  async updateTaskDetails(taskId, patch) {
    const updates: Record<string, unknown> = {};
    if (patch.title !== undefined) updates.title = patch.title.trim();
    if (patch.priority !== undefined) updates.priority = patch.priority;
    if (patch.due !== undefined) updates.due = patch.due;
    if (patch.tags !== undefined) updates.tags = patch.tags;

    if (patch.assigneeIds !== undefined) {
      if (patch.assigneeIds.length === 0) throw new Error("담당자는 한 명 이상이어야 합니다.");
      const { data: firstAssignee, error: memberError } = await supabase
        .from("members")
        .select("name, avatar")
        .eq("id", patch.assigneeIds[0])
        .single();
      if (memberError) throw memberError;
      updates.assignee = firstAssignee.name;
      updates.avatar = firstAssignee.avatar;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);
      if (error) throw error;
    }

    if (patch.assigneeIds !== undefined) {
      const { error: deleteError } = await supabase.from("task_assignees").delete().eq("task_id", taskId);
      if (deleteError) throw deleteError;
      const { error: insertError } = await supabase
        .from("task_assignees")
        .insert(patch.assigneeIds.map((memberId) => ({ task_id: taskId, member_id: memberId })));
      if (insertError) throw insertError;
    }
  },

  async deleteTask(taskId) {
    // Explicitly remove any linked schedule_events rows first — the FK from
    // tasks is ON DELETE SET NULL, so deleting the task alone would leave
    // those calendar entries orphaned instead of removed.
    const { data: taskRow, error: fetchError } = await supabase
      .from("tasks")
      .select("team_schedule_event_id, personal_schedule_event_id")
      .eq("id", taskId)
      .single();
    if (fetchError) throw fetchError;
    const eventIds = [taskRow.team_schedule_event_id, taskRow.personal_schedule_event_id].filter(
      (id): id is number => id !== null
    );

    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) throw error;

    if (eventIds.length > 0) {
      const { error: eventError } = await supabase.from("schedule_events").delete().in("id", eventIds);
      if (eventError) throw eventError;
    }
  },

  async addTaskChecklistItem(taskId, text) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("체크리스트 내용을 입력해주세요.");
    const { data, error } = await supabase
      .from("task_checklist_items")
      .insert({ task_id: taskId, text: trimmed })
      .select()
      .single();
    if (error) throw error;
    return mapChecklistItem(data);
  },

  async toggleTaskChecklistItem(itemId, done) {
    const { error } = await supabase.from("task_checklist_items").update({ done }).eq("id", itemId);
    if (error) throw error;
  },

  async addTaskComment(taskId, actorMemberId, actorName, actorAvatar, text) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("댓글 내용을 입력해주세요.");
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: taskId, member_id: actorMemberId, author: actorName, avatar: actorAvatar, date: todayISO(), text: trimmed })
      .select()
      .single();
    if (error) throw error;
    return mapTaskComment(data);
  },

  async setTaskCommentReaction(commentId, memberId, emoji, active) {
    if (active) {
      const { error } = await supabase
        .from("task_comment_reactions")
        .upsert({ comment_id: commentId, member_id: memberId, emoji }, { onConflict: "comment_id,member_id,emoji", ignoreDuplicates: true });
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from("task_comment_reactions")
      .delete()
      .eq("comment_id", commentId)
      .eq("member_id", memberId)
      .eq("emoji", emoji);
    if (error) throw error;
  },

  subscribeToTaskCommentReactions(projectId, onChange) {
    const channel = supabase
      .channel(`task_comment_reactions:${projectId}`, { config: { private: true } })
      // Reactions do not carry project_id, so the table cannot use a server
      // filter here. Its RLS policy controls delivery; the context reloads
      // only the currently open project's tasks when an allowed event arrives.
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comment_reactions" }, onChange)
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("과제 댓글 반응 채널 연결에 실패했습니다:", error?.message ?? status);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  // Live updates for the task board/schedule/workspace so a teammate's
  // change shows up without waiting for the next visit or a manual refresh.
  // No payload mapping — a change of any kind just triggers a full reload of
  // that project's list, same approach as subscribeToTaskCommentReactions.
  subscribeToTasks(projectId, onChange) {
    const channel = supabase
      .channel(`tasks:${projectId}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` }, onChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` }, onChange)
      // DELETE doesn't support a server-side filter; RLS still limits delivery.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, onChange)
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("과제 실시간 채널 연결에 실패했습니다:", error?.message ?? status);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  subscribeToScheduleEvents(projectId, onChange) {
    const channel = supabase
      .channel(`schedule_events:${projectId}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "schedule_events", filter: `project_id=eq.${projectId}` }, onChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "schedule_events", filter: `project_id=eq.${projectId}` }, onChange)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "schedule_events" }, onChange)
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("일정 실시간 채널 연결에 실패했습니다:", error?.message ?? status);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  subscribeToFiles(projectId, onChange) {
    const channel = supabase
      .channel(`files:${projectId}`, { config: { private: true } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "files", filter: `project_id=eq.${projectId}` }, onChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "files", filter: `project_id=eq.${projectId}` }, onChange)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "files" }, onChange)
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("워크스페이스 실시간 채널 연결에 실패했습니다:", error?.message ?? status);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  async setTaskScheduleLink(taskId, field, eventId) {
    const column = field === "team" ? "team_schedule_event_id" : "personal_schedule_event_id";
    const { error } = await supabase.from("tasks").update({ [column]: eventId }).eq("id", taskId);
    if (error) throw error;
  },

  async listScheduleEvents(projectId) {
    const { data, error } = await supabase
      .from("schedule_events")
      .select("*")
      .eq("project_id", projectId)
      .order("date", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapScheduleEvent);
  },

  async addScheduleEvent(projectId, actorMemberId, input) {
    const { data, error } = await supabase
      .from("schedule_events")
      .insert({
        project_id: projectId,
        title: input.title.trim(),
        date: input.date,
        end_date: input.endDate || null,
        type: input.type,
        scope: input.scope,
        owner_member_id: input.scope === "personal" ? actorMemberId : null,
        visibility: input.scope === "personal" ? (input.visibility ?? "private") : null,
        hide_title: input.scope === "personal" && input.visibility === "shared" ? !!input.hideTitle : false,
      })
      .select()
      .single();
    if (error) throw error;
    return mapScheduleEvent(data);
  },

  async updateScheduleEvent(eventId, patch) {
    const updates: Record<string, unknown> = {};
    if (patch.title !== undefined) updates.title = patch.title.trim();
    if (patch.date !== undefined) updates.date = patch.date;
    if (patch.endDate !== undefined) updates.end_date = patch.endDate || null;
    if (patch.type !== undefined) updates.type = patch.type;
    if (patch.visibility !== undefined) updates.visibility = patch.visibility;
    if (patch.hideTitle !== undefined) updates.hide_title = patch.hideTitle;
    if (Object.keys(updates).length === 0) return;
    const { error } = await supabase.from("schedule_events").update(updates).eq("id", eventId);
    if (error) throw error;
  },

  async removeScheduleEvent(eventId) {
    const { error } = await supabase.from("schedule_events").delete().eq("id", eventId);
    if (error) throw error;
  },

  async listMessages(projectId, channelId) {
    const { data, error } = await supabase
      .from("chat_messages")
      // Both child tables have a legacy single-column FK and the hardened
      // (message_id, project_id) FK. Name the latter explicitly so PostgREST
      // does not reject this embed as an ambiguous relationship.
      .select("*, message_reads!message_reads_message_project_fk(member_id), message_reactions!message_reactions_message_project_fk(member_id, emoji)")
      .eq("project_id", projectId)
      .eq("channel_id", channelId)
      .order("id", { ascending: true });
    if (!error) return (data ?? []).map(mapMessage);

    // A deployment can reach the browser before the optional reactions
    // migration is applied (or before PostgREST refreshes its relationship
    // cache). Existing chat history must remain available in that state.
    console.warn("메시지 반응을 불러오지 못해 반응 없이 채팅 내역을 표시합니다:", error.message);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("chat_messages")
      .select("*, message_reads!message_reads_message_project_fk(member_id)")
      .eq("project_id", projectId)
      .eq("channel_id", channelId)
      .order("id", { ascending: true });
    if (fallbackError) throw fallbackError;
    return (fallbackData ?? []).map((row) => mapMessage({ ...row, message_reactions: [] }));
  },

  async sendMessage(projectId, channelId, senderMemberId, input) {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ project_id: projectId, channel_id: channelId, sender_id: senderMemberId, text: input.text, file_id: input.fileId ?? null })
      .select()
      .single();
    if (error) throw error;
    return mapMessage({ ...data, message_reads: [], message_reactions: [] });
  },

  async markChannelRead(projectId, channelId, readerMemberId, messageIds) {
    if (messageIds.length === 0) return;
    const rows = messageIds.map((id) => ({ message_id: id, member_id: readerMemberId, project_id: projectId }));
    const { error } = await supabase.from("message_reads").upsert(rows, { onConflict: "message_id,member_id", ignoreDuplicates: true });
    if (error) throw error;
  },

  async markSectionViewed(projectId, section) {
    const { error } = await supabase.rpc("mark_section_viewed", { p_project_id: projectId, p_section: section });
    if (error) throw error;
  },

  async setMessageReaction(projectId, messageId, memberId, emoji, active) {
    if (active) {
      const { error } = await supabase
        .from("message_reactions")
        .upsert({ message_id: messageId, member_id: memberId, project_id: projectId, emoji }, { onConflict: "message_id,member_id,emoji", ignoreDuplicates: true });
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("member_id", memberId)
      .eq("emoji", emoji);
    if (error) throw error;
  },

  subscribeToMessages(projectId, onInsert, onReaction) {
    const channel = supabase
      .channel(`chat_messages:${projectId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `project_id=eq.${projectId}` },
        (payload) => onInsert(mapMessage({ ...payload.new, message_reads: [], message_reactions: [] }))
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions", filter: `project_id=eq.${projectId}` },
        (payload) => onReaction({ active: true, reaction: { messageId: payload.new.message_id, memberId: payload.new.member_id, emoji: payload.new.emoji } })
      )
      .on(
        "postgres_changes",
        // Supabase does not support server-side filters for DELETE events.
        // RLS still limits delivery, and the context only updates message ids
        // already loaded for this project.
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => onReaction({ active: false, reaction: { messageId: payload.old.message_id, memberId: payload.old.member_id, emoji: payload.old.emoji } })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  async chatToolCreate(projectId, channelId, text, config) {
    const { data, error } = await supabase.rpc("chat_tool_create", { p_project_id: projectId, p_channel_id: channelId, p_text: text, p_config: config });
    if (error) throw error;
    return { message: mapMessage({ ...data.message, message_reads: [], message_reactions: [] }), event: mapToolEvent(data.event) };
  },

  async chatToolAct(messageId, action, args = {}) {
    const { data, error } = await supabase.rpc("chat_tool_act", { p_message_id: messageId, p_action: action, p_args: args });
    if (error) throw error;
    return mapToolEvent(data);
  },

  async listChatToolEvents(projectId) {
    const { data, error } = await supabase.from("chat_tool_events").select("*").eq("project_id", projectId).order("id", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapToolEvent);
  },

  subscribeToChatToolEvents(projectId, onEvent) {
    const channel = supabase
      .channel(`chat_tool_events:${projectId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_tool_events", filter: `project_id=eq.${projectId}` },
        (payload) => onEvent(mapToolEvent(payload.new))
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  subscribeToReads(projectId, onRead) {
    const channel = supabase
      .channel(`message_reads:${projectId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reads", filter: `project_id=eq.${projectId}` },
        (payload) => onRead({ messageId: payload.new.message_id, memberId: payload.new.member_id })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  // Presence tracks every open browser tab under its member id. Unlike a
  // database heartbeat, Realtime immediately broadcasts joins/leaves to all
  // subscribed teammates and cleans up a disconnected socket automatically.
  subscribeToPresence(projectId, memberId, onChange) {
    const channelKey = `presence:${projectId}`;
    const channel = supabase.channel(channelKey, {
      config: { private: true, presence: { key: memberId } },
    });

    // 한 사람이 탭을 여러 개 열면 탭마다 상태가 따로 온다. 하나라도 활동 중이면 온라인,
    // 마지막 활동은 가장 늦은 시각, 접속 시각은 가장 이른 시각으로 합친다.
    const parsePresenceStates = (presenceState: Record<string, any[]>): Record<string, MemberPresenceState> => {
      const result: Record<string, MemberPresenceState> = {};
      const now = new Date().toISOString();
      for (const [key, presences] of Object.entries(presenceState)) {
        if (!presences?.length) continue;
        const lastActive = presences.map((p) => p.last_active_at || p.online_at || now).sort();
        const onlineAt = presences.map((p) => p.online_at || now).sort();
        result[key] = {
          status: presences.some((p) => p.status !== "idle") ? "active" : "idle",
          lastActiveAt: lastActive[lastActive.length - 1],
          onlineAt: onlineAt[0],
        };
      }
      return result;
    };

    const emit = () => {
      const state = channel.presenceState();
      const onlineIds = new Set(Object.keys(state));
      const states = parsePresenceStates(state);
      onChange(onlineIds, states);
    };

    channel
      .on("presence", { event: "sync" }, () => {
        emit();
      })
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          const now = new Date().toISOString();
          void channel
            .track({ status: "active", last_active_at: now, online_at: now })
            .then((result) => {
              if (result !== "ok") {
                console.error("온라인 상태 발행에 실패했습니다:", result);
                return;
              }
              const state = channel.presenceState();
              const onlineIds = new Set([...Object.keys(state), memberId]);
              const states = parsePresenceStates(state);
              if (!states[memberId]) {
                states[memberId] = { status: "active", lastActiveAt: now, onlineAt: now };
              }
              onChange(onlineIds, states);
            })
            .catch((trackError) => console.error("온라인 상태 발행에 실패했습니다:", trackError));
        } else if (status !== "CLOSED") {
          // A missing or mismatched realtime.messages policy otherwise looks
          // identical to every teammate being offline in the UI.
          console.error("온라인 상태 채널 연결에 실패했습니다:", status, error);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  async updatePresenceStatus(projectId, memberId, status) {
    const channel = supabase.getChannels().find((c) => c.topic === `realtime:presence:${projectId}` || c.topic === `presence:${projectId}`);
    if (!channel) return;
    const now = new Date().toISOString();
    const existing = (channel.presenceState()?.[memberId] as any[])?.[0];
    const onlineAt = existing?.online_at || now;
    await channel.track({ status, last_active_at: now, online_at: onlineAt });
  },

  async touchMemberPresence(memberId) {
    const { error } = await supabase.rpc("touch_member_presence", { p_member_id: memberId });
    if (error) {
      console.warn("touch_member_presence warning:", error.message);
    }
  },

  async listBoardPosts() {
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth.user?.id;
    // 내가 신고한 게시글(신고 마이그레이션 전이면 빈 목록)
    const reportedPromise = myId
      ? Promise.resolve(supabase.from("board_post_reports").select("post_id").eq("reporter_user_id", myId)).then((r) => new Set<number>((r.error ? [] : r.data ?? []).map((x: any) => x.post_id)))
      : Promise.resolve(new Set<number>());
    const [postsResult, likesResult] = await Promise.all([
      supabase.from("board_posts").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }),
      myId
        ? supabase.from("board_likes").select("post_id").eq("user_id", myId)
        : Promise.resolve({ data: [] as { post_id: number }[], error: null }),
    ]);
    if (postsResult.error) throw postsResult.error;
    if (likesResult.error) throw likesResult.error;
    const likedPostIds = new Set((likesResult.data ?? []).map((r: any) => r.post_id));
    const rows = postsResult.data ?? [];
    const [profileById, pollsByPostId] = await Promise.all([
      fetchProfilesById([...new Set(rows.map((r: any) => r.author_user_id))]),
      fetchPollsForPosts(rows.map((r: any) => r.id), myId ?? null),
    ]);
    const reportedPostIds = await reportedPromise;
    return rows.map((row: any) => ({
      ...mapBoardPost(row, profileById[row.author_user_id], likedPostIds.has(row.id), pollsByPostId.get(row.id)),
      reportedByMe: reportedPostIds.has(row.id),
    }));
  },

  async createBoardPost(input) {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");
    const tags = Array.isArray(input.tags) ? [...input.tags] : [];
    if (input.hideImagePreview && !tags.includes("hide_image_preview")) {
      tags.push("hide_image_preview");
    }
    const { data, error } = await supabase
      .from("board_posts")
      .insert({
        category: input.category,
        title: input.title.trim(),
        content: input.content,
        author_user_id: userId,
        attachments: input.attachments,
        tags,
      })
      .select()
      .single();
    if (error) throw error;

    // 투표는 서버 함수로 한 번에 만든다. 실패하면 게시글은 남지만 투표가 없다는 것을 알린다.
    let createdPoll: BoardPoll | null = null;
    if (input.poll && input.poll.question.trim() && input.poll.options.length >= 2) {
      const { data: pollId, error: pollErr } = await supabase.rpc("create_board_poll", {
        p_post_id: data.id,
        p_question: input.poll.question,
        p_options: input.poll.options,
        p_allow_multiple: input.poll.allowMultiple,
        p_is_anonymous: input.poll.isAnonymous,
        p_closes_at: input.poll.closesAt || null,
      });
      if (pollErr) throw new Error(`게시글은 등록되었지만 투표를 만들지 못했습니다: ${pollErr.message}`);
      createdPoll = await fetchSinglePoll(pollId as number, userId);
    }

    const profileById = await fetchProfilesById([userId]);
    return mapBoardPost(data, profileById[userId], false, createdPoll);
  },

  async updateBoardPost(postId, patch) {
    const updates: Record<string, unknown> = {};
    if (patch.category !== undefined) updates.category = patch.category;
    if (patch.title !== undefined) updates.title = patch.title.trim();
    if (patch.content !== undefined) updates.content = patch.content;
    if (patch.attachments !== undefined) updates.attachments = patch.attachments;
    if (patch.hideImagePreview !== undefined || patch.tags !== undefined) {
      let baseTags: string[] = patch.tags ? [...patch.tags] : [];
      if (!patch.tags && patch.hideImagePreview !== undefined) {
        try {
          const { data: currentPost } = await supabase.from("board_posts").select("tags").eq("id", postId).single();
          baseTags = Array.isArray(currentPost?.tags) ? [...currentPost.tags] : [];
        } catch {
          baseTags = [];
        }
      }
      if (patch.hideImagePreview !== undefined) {
        if (patch.hideImagePreview) {
          if (!baseTags.includes("hide_image_preview")) baseTags.push("hide_image_preview");
        } else {
          baseTags = baseTags.filter((t) => t !== "hide_image_preview" && t !== "no_preview");
        }
      }
      updates.tags = baseTags;
    }
    if (Object.keys(updates).length === 0) return;
    updates.updated_at = new Date().toISOString();
    const { error } = await supabase.from("board_posts").update(updates).eq("id", postId);
    if (error) throw error;
  },

  async deleteBoardPost(postId) {
    const { error } = await supabase.from("board_posts").delete().eq("id", postId);
    if (error) throw error;
  },

  async incrementBoardPostViews(postId) {
    const { error } = await supabase.rpc("increment_board_post_views", { p_post_id: postId });
    if (error) throw error;
  },

  async setBoardPostLike(postId, active) {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");
    if (active) {
      const { error } = await supabase
        .from("board_likes")
        .upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    } else {
      const { error } = await supabase.from("board_likes").delete().eq("post_id", postId).eq("user_id", userId);
      if (error) throw error;
    }
  },

  async getBoardPostComments(postId): Promise<BoardComment[]> {
    const { data, error } = await supabase
      .from("board_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = data ?? [];
    const profileById = await fetchProfilesById([...new Set(rows.map((r: any) => r.author_user_id))]);
    const repliesByParent = new Map<number, any[]>();
    for (const row of rows) {
      if (row.parent_comment_id !== null) {
        const list = repliesByParent.get(row.parent_comment_id) ?? [];
        list.push(row);
        repliesByParent.set(row.parent_comment_id, list);
      }
    }
    return rows
      .filter((row: any) => row.parent_comment_id === null)
      .map((row: any) => ({
        id: row.id,
        authorUserId: row.author_user_id,
        author: profileById[row.author_user_id]?.display_name || "탈퇴한 사용자",
        authorAvatarUrl: profileById[row.author_user_id]?.avatar_url ?? null,
        createdAt: row.created_at,
        content: row.content,
        replies: (repliesByParent.get(row.id) ?? []).map((reply: any) => ({
          id: reply.id,
          authorUserId: reply.author_user_id,
          author: profileById[reply.author_user_id]?.display_name || "탈퇴한 사용자",
          authorAvatarUrl: profileById[reply.author_user_id]?.avatar_url ?? null,
          createdAt: reply.created_at,
          content: reply.content,
        })),
      }));
  },

  async addBoardComment(postId, content, parentCommentId) {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");
    const { error } = await supabase.from("board_comments").insert({
      post_id: postId,
      parent_comment_id: parentCommentId ?? null,
      author_user_id: userId,
      content: content.trim(),
    });
    if (error) throw error;
  },

  async deleteBoardComment(commentId) {
    const { error } = await supabase.from("board_comments").delete().eq("id", commentId);
    if (error) throw error;
  },

  async uploadBoardAttachment(file): Promise<BoardAttachment> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");
    if (file.size > 20 * 1024 * 1024) throw new Error("첨부파일은 20MB까지 업로드할 수 있습니다.");
    // 확장자는 영문·숫자 10자까지만 쓴다(공백·특수문자가 주소에 들어가면 첨부 주소 검증에 걸려 게시글 저장이 실패한다).
    const rawExt = file.name.includes(".") ? file.name.split(".").pop() ?? "" : "";
    const ext = /^[a-z0-9]{1,10}$/i.test(rawExt) ? rawExt.toLowerCase() : "bin";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("board-attachments").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (error) throw error;
    const { data } = supabase.storage.from("board-attachments").getPublicUrl(path);
    return {
      id: crypto.randomUUID(),
      name: file.name,
      size: formatAttachmentSize(file.size),
      kind: file.type.startsWith("image/") ? "image" : "file",
      url: data.publicUrl,
      mimeType: file.type,
    };
  },

  async castBoardPollVote(pollId, optionIds) {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");
    const { error } = await supabase.rpc("cast_board_poll_vote", { p_poll_id: pollId, p_option_ids: optionIds });
    if (error) throw error;
    return fetchSinglePoll(pollId, userId);
  },

  async reportBoardPost(postId, reason, detail) {
    const { error } = await supabase.rpc("report_board_post", { p_post_id: postId, p_reason: reason, p_detail: detail });
    if (error) throw error;
  },

  async listBoardPostReports(postId) {
    const { data, error } = await supabase.from("board_post_reports").select("*").eq("post_id", postId).order("created_at", { ascending: false });
    if (error) throw error;
    return mapReports(data ?? []);
  },

  async getBoardPostContent(postId) {
    const { data, error } = await supabase.from("board_posts").select("content").eq("id", postId).maybeSingle();
    if (error) throw error;
    return data ? (data.content as string) : null;
  },

  async listAllBoardReports() {
    const { data, error } = await supabase.from("board_post_reports").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    return mapReports(data ?? []);
  },

  async reviewBoardReport(reportId, status) {
    const { error } = await supabase.rpc("review_board_report", { p_report_id: reportId, p_status: status });
    if (error) throw error;
  },

  async closeBoardPoll(pollId) {
    const { error } = await supabase.rpc("close_board_poll", { p_poll_id: pollId });
    if (error) throw error;
  },

  async fetchCampusNotices({ school = "전국", category = "all" }) {
    try {
      const res = await fetch(`/api/campus-notices?school=${encodeURIComponent(school)}&category=${encodeURIComponent(category)}`);
      if (res.ok) {
        const data = (await res.json()) as { notices: NoticeItem[] };
        return data.notices || [];
      }
    } catch {
      // Dev / offline fallback: direct call to crawlerService
    }
    const { crawlNotices } = await import("../../lib/crawler/crawlerService");
    const result = await crawlNotices(school, category as any);
    return result.notices;
  },

  async listScrappedNotices() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user?.id) return [];

    const { data, error } = await supabase
      .from("campus_scrapped_notices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return [];
    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      schoolCode: row.school_code,
      schoolName: row.school_name,
      category: row.category,
      title: row.title,
      author: row.author || "",
      postDate: row.post_date || "",
      link: row.link,
      createdAt: row.created_at,
    }));
  },

  async toggleScrapNotice(notice: NoticeItem) {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");

    // Check if already scrapped
    const { data: existing } = await supabase
      .from("campus_scrapped_notices")
      .select("id")
      .eq("user_id", userId)
      .eq("link", notice.link)
      .maybeSingle();

    if (existing) {
      await supabase.from("campus_scrapped_notices").delete().eq("id", existing.id);
      return false; // unscrapped
    } else {
      await supabase.from("campus_scrapped_notices").insert({
        user_id: userId,
        school_code: notice.schoolCode,
        school_name: notice.schoolName,
        category: notice.category,
        title: notice.title,
        author: notice.author,
        post_date: notice.postDate,
        link: notice.link,
      });
      return true; // scrapped
    }
  },
};
