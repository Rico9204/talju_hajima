import { supabase } from "../../lib/supabase";
import type { DataRepository } from "../dataRepository";
import type { Project, TeamData, Member, Folder, WorkspaceFile, FileComment, Task, TaskStatus } from "../types";

// TODO: replace with the signed-in user once an auth flow exists.
const CURRENT_USER_NAME = "김지수";
const CURRENT_USER_AVATAR = "김";

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

function mapMember(row: any): Member {
  return {
    name: row.name,
    role: row.role,
    major: row.major,
    student: row.student,
    avatar: row.avatar,
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
  };
}

export const supabaseDataRepository: DataRepository = {
  async listProjects() {
    const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapProject);
  },

  async createProject(input) {
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
      name: CURRENT_USER_NAME,
      role: "팀장",
      major: "역사문화학과 3학년",
      student: "2021123456",
      avatar: CURRENT_USER_AVATAR,
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

  async getTeam(projectId): Promise<TeamData> {
    const [teamResult, memberResult] = await Promise.all([
      supabase.from("teams").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("members").select("*").eq("project_id", projectId).order("is_leader", { ascending: false }),
    ]);
    if (teamResult.error) throw teamResult.error;
    if (memberResult.error) throw memberResult.error;

    return {
      teamLabel: teamResult.data?.team_label ?? "팀",
      teamSub: teamResult.data?.team_sub ?? "",
      members: (memberResult.data ?? []).map(mapMember),
    };
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

  async createFolder(projectId, name) {
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
        created_by: CURRENT_USER_NAME,
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

  async createFile(projectId, input) {
    const ext = input.name.split(".").pop()?.toLowerCase() || "doc";
    const type = (["pdf", "doc", "ppt", "xls", "zip", "img"].includes(ext) ? ext : "doc") as WorkspaceFile["type"];
    const sizeStr = formatSize(input.size);
    const today = todayISO();

    const { data: fileRow, error: fileError } = await supabase
      .from("files")
      .insert({
        project_id: projectId,
        name: input.name,
        type,
        uploader: CURRENT_USER_NAME,
        avatar: CURRENT_USER_AVATAR,
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
      uploaded_by: CURRENT_USER_NAME,
      date: today,
      size: sizeStr,
      note: input.note || "신규 업로드",
      current: true,
    });
    if (versionError) throw versionError;

    return mapFile({ ...fileRow, file_versions: [], file_comments: [] });
  },

  async addFileVersion(fileId, note) {
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
      uploaded_by: CURRENT_USER_NAME,
      date: todayISO(),
      size: fileRow.size,
      note: note || "업데이트",
      current: true,
    });
    if (error) throw error;
  },

  async addFileComment(fileId, text) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("댓글 내용이 비어 있습니다.");
    const { data, error } = await supabase
      .from("file_comments")
      .insert({ file_id: fileId, author: CURRENT_USER_NAME, avatar: CURRENT_USER_AVATAR, date: todayISO(), text: trimmed })
      .select()
      .single();
    if (error) throw error;
    return mapComment(data);
  },

  async listTasks(projectId) {
    const { data, error } = await supabase.from("tasks").select("*").eq("project_id", projectId).order("id", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapTask);
  },

  async updateTaskStatus(taskId, status: TaskStatus) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) throw error;
  },
};
