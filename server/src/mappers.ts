// DB 행 → 앱이 쓰는 객체. src/api/supabase/supabaseDataRepository.ts 의 변환 함수를 그대로 옮겼다
// (프론트를 이 서버로 전환할 때 화면 코드가 받는 모양이 바뀌지 않도록). 한쪽을 바꾸면 다른 쪽도 맞춘다.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

export function mapProject(row: Row) {
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

// profile: 계정이 있는 팀원의 profiles 행(이름·전공·아바타 등은 계정 기준으로 통일된 값이 우선).
export function mapMember(row: Row, profile?: Row) {
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

export function mapFolder(row: Row) {
  return { id: row.id, parentId: row.parent_id ?? null, name: row.name, color: row.color, createdBy: row.created_by, ownerUserId: row.owner_user_id ?? null, date: row.date };
}

export function mapComment(row: Row) {
  return {
    id: row.id, memberId: row.member_id ?? null, versionId: row.version_id ?? null,
    reactions: (row.file_comment_reactions ?? []).map((r: Row) => ({ commentId: row.id, memberId: r.member_id, emoji: r.emoji })),
    author: row.author, avatar: row.avatar, date: row.date, text: row.text,
  };
}

export function mapFile(row: Row) {
  const versions = (row.file_versions ?? [])
    .slice()
    .sort((a: Row, b: Row) => b.id - a.id)
    .map((v: Row) => ({
      id: v.id, parentVersionId: v.parent_version_id ?? null, storagePath: v.storage_path ?? null, originalName: v.original_name ?? null,
      mimeType: v.mime_type ?? "application/octet-stream", byteSize: v.byte_size ?? null, pinned: v.pinned ?? false, version: v.version,
      searchText: v.search_text ?? "", searchStatus: v.search_status ?? "pending", uploadedBy: v.uploaded_by, uploadedAt: v.uploaded_at ?? null,
      date: v.date, size: v.size, note: v.note, current: v.current,
    }));
  const comments = (row.file_comments ?? []).slice().sort((a: Row, b: Row) => a.id - b.id).map(mapComment);
  return {
    id: row.id, name: row.name, type: row.type, createdAt: row.created_at ?? null, updatedAt: row.updated_at ?? null,
    uploader: row.uploader, avatar: row.avatar, date: row.date, size: row.size, tag: row.tag, ownerUserId: row.owner_user_id ?? null,
    tags: row.tags ?? (row.tag && row.tag !== "기타" ? [row.tag] : []),
    folderId: row.folder_id, versions, comments,
  };
}

export function mapChecklistItem(row: Row) {
  return { id: row.id, text: row.text, done: row.done };
}

export function mapTaskComment(row: Row) {
  return {
    id: row.id, memberId: row.member_id ?? null, author: row.author, avatar: row.avatar, date: row.date, text: row.text,
    reactions: (row.task_comment_reactions ?? []).map((r: Row) => ({ commentId: row.id, memberId: r.member_id, emoji: r.emoji })),
  };
}

export function mapTask(row: Row) {
  return {
    createdAt: row.created_at ?? null, id: row.id, title: row.title, assignee: row.assignee, avatar: row.avatar,
    priority: row.priority, due: row.due, tags: row.tags ?? [], status: row.status, color: row.color,
    assigneeIds: (row.task_assignees ?? []).map((a: Row) => a.member_id),
    checklist: (row.task_checklist_items ?? []).map(mapChecklistItem),
    comments: (row.task_comments ?? []).map(mapTaskComment),
    teamScheduleEventId: row.team_schedule_event_id, personalScheduleEventId: row.personal_schedule_event_id,
  };
}

export function mapScheduleEvent(row: Row) {
  return {
    id: row.id, title: row.title, date: row.date, endDate: row.end_date ?? null, type: row.type, scope: row.scope,
    ownerMemberId: row.owner_member_id, visibility: row.visibility, hideTitle: row.hide_title,
    createdAt: row.created_at ?? null, updatedAt: row.updated_at ?? null,
  };
}

// chat_tool_events 행(snake_case) 또는 DB 함수가 돌려주는 JSON(camelCase) 모두 받는다.
export function mapToolEvent(row: Row) {
  return {
    id: row.id, messageId: row.messageId ?? row.message_id, kind: row.kind, event: row.event,
    actorMemberId: row.actorMemberId ?? row.actor_member_id ?? null, data: row.data ?? {}, createdAt: row.createdAt ?? row.created_at,
  };
}

export function mapMessage(row: Row) {
  return {
    id: row.id, channelId: row.channel_id, senderId: row.sender_id, text: row.text, fileId: row.file_id, createdAt: row.created_at,
    readBy: (row.message_reads ?? []).map((r: Row) => r.member_id),
    reactions: (row.message_reactions ?? []).map((r: Row) => ({ messageId: row.id, memberId: r.member_id, emoji: r.emoji })),
  };
}

export function mapMyAdminApplication(row: Row) {
  return {
    id: row.id, status: row.status, org: row.org, jobTitle: row.job_title, docType: row.doc_type, docName: row.doc_name,
    submittedAt: row.submitted_at, reviewedAt: row.reviewed_at ?? null, reviewNote: row.review_note ?? null,
  };
}

export function mapAdminApplicationRecord(row: Row) {
  return {
    id: row.id, userId: row.user_id, displayName: row.display_name ?? "이름 없음", email: row.email ?? "",
    emailConfirmed: row.email_confirmed === true, org: row.org, jobTitle: row.job_title, contact: row.contact,
    docType: row.doc_type, docName: row.doc_name, docSize: Number(row.doc_size), docPath: row.doc_path ?? null,
    docDeleted: !!row.doc_deleted_at, status: row.status, submittedAt: row.submitted_at, reviewedAt: row.reviewed_at ?? null,
    reviewNote: row.review_note ?? null, reviewedByName: row.reviewed_by_name ?? null,
  };
}

export function mapAdminAccount(row: Row) {
  return {
    userId: row.user_id, displayName: row.display_name ?? "이름 없음", email: row.email ?? "", org: row.org ?? null,
    isOperator: row.is_operator === true, pendingProjects: Number(row.pending_projects ?? 0),
  };
}

export function mapBoardPost(row: Row, profile: Row, likedByMe: boolean, poll?: Row | null) {
  const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
  const hideImagePreview = Boolean(row.hide_image_preview || tags.includes("hide_image_preview") || tags.includes("no_preview"));
  return {
    id: row.id, category: row.category, title: row.title, content: row.content, authorUserId: row.author_user_id,
    author: profile?.display_name || "탈퇴한 사용자", authorAvatarUrl: profile?.avatar_url ?? null, createdAt: row.created_at,
    views: row.views, likes: row.likes_count, likedByMe, pinned: row.pinned, tags, attachments: row.attachments ?? [],
    commentsCount: row.comments_count, comments: [], poll: poll ?? null, hideImagePreview,
  };
}

// src/lib/evaluationSummary.ts 와 같은 계산.
type EvalMember = { score: number; evalCount: number; criteriaScores: Record<"role" | "deadline" | "communication" | "collaboration" | "quality", number> };
export function summarizeEvaluations(members: EvalMember[], projectCount: number, collaboratorCount: number) {
  const count = members.reduce((sum, m) => sum + m.evalCount, 0);
  const criteria = { role: 0, deadline: 0, communication: 0, collaboration: 0, quality: 0 };
  for (const key of Object.keys(criteria) as (keyof typeof criteria)[]) {
    criteria[key] = count ? members.reduce((sum, m) => sum + m.criteriaScores[key] * m.evalCount, 0) / count : 0;
  }
  return { projectCount, collaboratorCount, count, score: count ? members.reduce((sum, m) => sum + m.score * m.evalCount, 0) / count : null, criteria };
}
