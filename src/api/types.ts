export interface Project {
  id: string;
  name: string;
  org: string;
  period: string;
  status: "active" | "done";
  startDate?: string;
  endDate?: string;
}

export interface NewProjectInput {
  name: string;
  org: string;
  period: string;
  startDate?: string;
  endDate?: string;
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
  bannerColor: string | null;
  bannerImageUrl: string | null;
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
}

export interface TeamData {
  teamLabel: string;
  teamSub: string;
  members: Member[];
}

export interface FileVersion {
  version: string;
  uploadedBy: string;
  date: string;
  size: string;
  note: string;
  current: boolean;
}

export interface FileComment {
  id: number;
  author: string;
  avatar: string;
  date: string;
  text: string;
}

export interface WorkspaceFile {
  createdAt?: string | null;
  updatedAt?: string | null;
  id: number;
  name: string;
  type: "pdf" | "doc" | "img" | "ppt" | "xls" | "zip";
  uploader: string;
  avatar: string;
  date: string;
  size: string;
  tag: string;
  folderId: number | null;
  versions: FileVersion[];
  comments: FileComment[];
}

export interface Folder {
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
  date: string; // YYYY-MM-DD
  type: ScheduleEventType;
  scope: ScheduleEventScope;
  ownerMemberId: string | null; // scope === "personal"일 때만 존재
  visibility: ScheduleEventVisibility | null; // scope === "personal"일 때만 존재
  hideTitle: boolean;
}

export interface NewScheduleEventInput {
  title: string;
  date: string;
  type: ScheduleEventType;
  scope: ScheduleEventScope;
  visibility?: ScheduleEventVisibility; // scope === "personal"일 때 필수
  hideTitle?: boolean;
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
  average?: { available: boolean; count: number; score: number | null; criteria: Record<"role" | "deadline" | "communication" | "collaboration" | "quality", number> | null };
  records: PeerEvaluationRecord[];
  submitted: boolean;
}
