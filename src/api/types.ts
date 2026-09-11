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

export interface Member {
  name: string;
  role: string;
  major: string;
  student: string;
  avatar: string;
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
