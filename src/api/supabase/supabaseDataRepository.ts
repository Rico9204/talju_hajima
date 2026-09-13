import { supabase } from "../../lib/supabase";
import type { DataRepository } from "../dataRepository";
import type {
  Project,
  TeamData,
  Member,
  Folder,
  WorkspaceFile,
  FileComment,
  Task,
  TaskStatus,
  ChecklistItem,
  TaskComment,
  ScheduleEvent,
  ChatMessage,
} from "../types";

const FOLDER_COLOR_PALETTE = ["#2563eb", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444", "#06b6d4"];

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "");
  return (base || "project") + "-" + Date.now().toString(36);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatSize(bytes: number): string {
  return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
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
    avatar: profile?.avatar_initial || row.avatar,
    avatarUrl: profile?.avatar_url ?? row.avatar_url ?? null,
    tasks: { done: row.tasks_done, total: row.tasks_total },
    activities: row.activities,
    score: Number(row.score),
    evalCount: row.eval_count,
    online: row.online,
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
  };
}

function mapFolder(row: any): Folder {
  return { id: row.id, name: row.name, color: row.color, createdBy: row.created_by, date: row.date };
}

function mapFile(row: any): WorkspaceFile {
  const versions = (row.file_versions ?? [])
    .slice()
    .sort((a: any, b: any) => b.id - a.id)
    .map((v: any) => ({ version: v.version, uploadedBy: v.uploaded_by, date: v.date, size: v.size, note: v.note, current: v.current }));
  const comments = (row.file_comments ?? [])
    .slice()
    .sort((a: any, b: any) => a.id - b.id)
    .map((c: any) => mapComment(c));
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    uploader: row.uploader,
    avatar: row.avatar,
    date: row.date,
    size: row.size,
    tag: row.tag,
    folderId: row.folder_id,
    versions,
    comments,
  };
}

function mapComment(row: any): FileComment {
  return { id: row.id, author: row.author, avatar: row.avatar, date: row.date, text: row.text };
}

function mapChecklistItem(row: any): ChecklistItem {
  return { id: row.id, text: row.text, done: row.done };
}

function mapTaskComment(row: any): TaskComment {
  return { id: row.id, author: row.author, avatar: row.avatar, date: row.date, text: row.text };
}

function mapTask(row: any): Task {
  return {
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
    type: row.type,
    scope: row.scope,
    ownerMemberId: row.owner_member_id,
    visibility: row.visibility,
    hideTitle: row.hide_title,
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
  };
}

export const supabaseDataRepository: DataRepository = {
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
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
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

    // Major/student are now account-wide (see profiles table) — the join
    // form is real user input, unlike createProject's placeholder defaults,
    // so it's the right moment to sync it there too.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ major: input.major.trim() || null, student: input.student.trim() || null })
      .eq("id", userId);
    if (profileError) throw profileError;

    const { data, error: fetchError } = await supabase
      .from("members")
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .single();
    if (fetchError) throw fetchError;

    const { data: profile, error: profileFetchError } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (profileFetchError) throw profileFetchError;
    return mapMember(data, profile);
  },

  async getTeam(projectId): Promise<TeamData> {
    const [teamResult, memberResult] = await Promise.all([
      supabase.from("teams").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("members").select("*").eq("project_id", projectId).order("is_leader", { ascending: false }),
    ]);
    if (teamResult.error) throw teamResult.error;
    if (memberResult.error) throw memberResult.error;

    const members = memberResult.data ?? [];
    // Two separate queries instead of an embedded select: members.user_id and
    // profiles.id both reference auth.users independently, with no FK between
    // members and profiles themselves for PostgREST to embed through.
    const userIds = [...new Set(members.map((m) => m.user_id).filter((id): id is string => !!id))];
    let profileById: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase.from("profiles").select("*").in("id", userIds);
      if (profilesError) throw profilesError;
      profileById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
    }

    return {
      teamLabel: teamResult.data?.team_label ?? "팀",
      teamSub: teamResult.data?.team_sub ?? "",
      members: members.map((m) => mapMember(m, m.user_id ? profileById[m.user_id] : undefined)),
    };
  },

  async updateMyProfile(patch) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");

    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.display_name = patch.name.trim();
    if (patch.major !== undefined) updates.major = patch.major.trim();
    if (patch.student !== undefined) updates.student = patch.student.trim();
    if (patch.avatarUrl !== undefined) updates.avatar_url = patch.avatarUrl;
    if (Object.keys(updates).length === 0) return;
    const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
    if (error) throw error;
  },

  async uploadAvatar(file) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("로그인이 필요합니다.");

    const ext = file.name.split(".").pop() || "jpg";
    // Path prefix must be the uploader's own auth.uid() — the avatars_own_write
    // storage policy checks exactly this (see schema.sql).
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  },

  async transferLeadership(projectId, targetName) {
    const { data: members, error } = await supabase
      .from("members")
      .select("id, name, role, is_leader")
      .eq("project_id", projectId);
    if (error) throw error;

    for (const m of members ?? []) {
      if (m.name === targetName && !m.is_leader) {
        const { error: e } = await supabase
          .from("members")
          .update({ is_leader: true, role: m.role === "참여자" || m.role === "팀원" ? "팀장" : m.role })
          .eq("id", m.id);
        if (e) throw e;
      } else if (m.is_leader && m.name !== targetName) {
        const { error: e } = await supabase
          .from("members")
          .update({ is_leader: false, role: m.role === "팀장" ? "팀원" : m.role })
          .eq("id", m.id);
        if (e) throw e;
      }
    }
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

  async listFiles(projectId) {
    const { data, error } = await supabase
      .from("files")
      .select("*, file_versions(*), file_comments(*)")
      .eq("project_id", projectId)
      .order("id", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapFile);
  },

  async createFile(projectId, input, actorName, actorAvatar) {
    const ext = input.name.split(".").pop()?.toLowerCase() || "doc";
    const type = (["pdf", "doc", "ppt", "xls", "zip", "img"].includes(ext) ? ext : "doc") as WorkspaceFile["type"];
    const sizeStr = formatSize(new Blob([input.content]).size);
    const today = todayISO();

    const { data: fileRow, error: fileError } = await supabase
      .from("files")
      .insert({
        project_id: projectId,
        name: input.name,
        type,
        uploader: actorName,
        avatar: actorAvatar,
        date: today,
        size: sizeStr,
        tag: "보고서",
        folder_id: input.folderId,
      })
      .select()
      .single();
    if (fileError) throw fileError;

    const { error: versionError } = await supabase.from("file_versions").insert({
      file_id: fileRow.id,
      version: "v1",
      uploaded_by: actorName,
      date: today,
      size: sizeStr,
      note: input.note || "신규 업로드",
      current: true,
    });
    if (versionError) throw versionError;

    return mapFile({ ...fileRow, file_versions: [], file_comments: [] });
  },

  async addFileVersion(fileId, actorName, note) {
    const [{ count, error: countError }, { data: fileRow, error: fileError }] = await Promise.all([
      supabase.from("file_versions").select("id", { count: "exact", head: true }).eq("file_id", fileId),
      supabase.from("files").select("size").eq("id", fileId).single(),
    ]);
    if (countError) throw countError;
    if (fileError) throw fileError;

    const { error: clearError } = await supabase.from("file_versions").update({ current: false }).eq("file_id", fileId);
    if (clearError) throw clearError;

    const { error } = await supabase.from("file_versions").insert({
      file_id: fileId,
      version: `v${(count ?? 0) + 1}`,
      uploaded_by: actorName,
      date: todayISO(),
      size: fileRow.size,
      note: note || "업데이트",
      current: true,
    });
    if (error) throw error;
  },

  async addFileComment(fileId, actorName, actorAvatar, text) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("댓글 내용이 비어 있습니다.");
    const { data, error } = await supabase
      .from("file_comments")
      .insert({ file_id: fileId, author: actorName, avatar: actorAvatar, date: todayISO(), text: trimmed })
      .select()
      .single();
    if (error) throw error;
    return mapComment(data);
  },

  async listTasks(projectId) {
    const { data, error } = await supabase
      .from("tasks")
      .select("*, task_assignees(member_id), task_checklist_items(*), task_comments(*)")
      .eq("project_id", projectId)
      .order("id", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapTask);
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

  async addTaskComment(taskId, actorName, actorAvatar, text) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("댓글 내용을 입력해주세요.");
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: taskId, author: actorName, avatar: actorAvatar, date: todayISO(), text: trimmed })
      .select()
      .single();
    if (error) throw error;
    return mapTaskComment(data);
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

  async removeScheduleEvent(eventId) {
    const { error } = await supabase.from("schedule_events").delete().eq("id", eventId);
    if (error) throw error;
  },

  async listMessages(projectId, channelId) {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*, message_reads(member_id)")
      .eq("project_id", projectId)
      .eq("channel_id", channelId)
      .order("id", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapMessage);
  },

  async sendMessage(projectId, channelId, senderMemberId, input) {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ project_id: projectId, channel_id: channelId, sender_id: senderMemberId, text: input.text, file_id: input.fileId ?? null })
      .select()
      .single();
    if (error) throw error;
    return mapMessage({ ...data, message_reads: [] });
  },

  async markChannelRead(projectId, channelId, readerMemberId, messageIds) {
    if (messageIds.length === 0) return;
    const rows = messageIds.map((id) => ({ message_id: id, member_id: readerMemberId, project_id: projectId }));
    const { error } = await supabase.from("message_reads").upsert(rows, { onConflict: "message_id,member_id", ignoreDuplicates: true });
    if (error) throw error;
  },

  subscribeToMessages(projectId, onInsert) {
    const channel = supabase
      .channel(`chat_messages:${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `project_id=eq.${projectId}` },
        (payload) => onInsert(mapMessage({ ...payload.new, message_reads: [] }))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  subscribeToReads(projectId, onRead) {
    const channel = supabase
      .channel(`message_reads:${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reads", filter: `project_id=eq.${projectId}` },
        (payload) => onRead({ messageId: payload.new.message_id, memberId: payload.new.member_id })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },
};
