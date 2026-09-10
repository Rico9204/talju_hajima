import { createContext, useContext, useState, type ReactNode } from "react";

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

const SHORT_TERM_THRESHOLD_DAYS = 14;

export function getDurationDays(p: Project): number | null {
  if (!p.startDate || !p.endDate) return null;
  const start = new Date(p.startDate);
  const end = new Date(p.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function isShortTermProject(p: Project): boolean {
  const days = getDurationDays(p);
  return days !== null && days < SHORT_TERM_THRESHOLD_DAYS;
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
  criteriaScores: { role: number; deadline: number; communication: number; collaboration: number };
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

const INITIAL_PROJECTS: Project[] = [
  {
    id: "heritage",
    name: "지역 문화유산 디지털 아카이브",
    org: "역사문화학과 · 3분반",
    period: "2026-2학기 · 진행 중",
    status: "active",
    startDate: "2026-09-01",
    endDate: "2026-12-12",
  },
  {
    id: "dialect",
    name: "지역 방언 조사 프로젝트",
    org: "국어국문학과 · 2분반",
    period: "2026-1학기 · 2026-06-21 종료",
    status: "done",
    startDate: "2026-03-02",
    endDate: "2026-06-21",
  },
];

const INITIAL_TEAMS: Record<string, TeamData> = {
  heritage: {
    teamLabel: "지역 문화유산 디지털 아카이브 팀",
    teamSub: "총 5명 · 역사문화학과 3분반 · 2026-2학기",
    members: [
      {
        name: "김지수", role: "팀장", major: "역사문화학과 3학년", student: "2021123456", avatar: "김",
        tasks: { done: 5, total: 7 }, activities: 38, score: 4.4, evalCount: 3, online: true,
        responsibilities: ["자료 수집 총괄", "발표 자료 제작", "일정 관리"], color: "#2563eb", isLeader: true,
        criteriaScores: { role: 4.5, deadline: 4.3, communication: 4.2, collaboration: 4.6 },
      },
      {
        name: "박민준", role: "기록 담당", major: "문헌정보학과 3학년", student: "2021234567", avatar: "박",
        tasks: { done: 4, total: 6 }, activities: 29, score: 4.1, evalCount: 3, online: true,
        responsibilities: ["문헌 정리", "인터뷰 기록", "참고문헌 관리"], color: "#f59e0b", isLeader: false,
        criteriaScores: { role: 4.2, deadline: 4.0, communication: 4.1, collaboration: 4.1 },
      },
      {
        name: "이서연", role: "디자인 담당", major: "시각디자인학과 2학년", student: "2022345678", avatar: "이",
        tasks: { done: 3, total: 5 }, activities: 22, score: 3.9, evalCount: 3, online: false,
        responsibilities: ["인포그래픽 제작", "포스터 디자인", "웹 레이아웃"], color: "#22c55e", isLeader: false,
        criteriaScores: { role: 3.8, deadline: 3.7, communication: 4.0, collaboration: 4.1 },
      },
      {
        name: "정하늘", role: "조사 담당", major: "역사문화학과 3학년", student: "2021456789", avatar: "정",
        tasks: { done: 4, total: 6 }, activities: 31, score: 4.2, evalCount: 3, online: false,
        responsibilities: ["현장 답사", "사진 촬영", "지역 주민 인터뷰"], color: "#8b5cf6", isLeader: false,
        criteriaScores: { role: 4.3, deadline: 4.1, communication: 4.0, collaboration: 4.4 },
      },
      {
        name: "최현우", role: "편집 담당", major: "미디어커뮤니케이션학과 2학년", student: "2022567890", avatar: "최",
        tasks: { done: 2, total: 5 }, activities: 15, score: 3.6, evalCount: 3, online: true,
        responsibilities: ["영상 편집", "SNS 콘텐츠", "최종 보고서 편집"], color: "#ef4444", isLeader: false,
        criteriaScores: { role: 3.5, deadline: 3.4, communication: 3.6, collaboration: 3.9 },
      },
    ],
  },
  dialect: {
    teamLabel: "지역 방언 조사 프로젝트 팀",
    teamSub: "총 4명 · 국어국문학과 2분반 · 2026-1학기 (종료)",
    members: [
      {
        name: "김지수", role: "참여자", major: "역사문화학과 3학년", student: "2021123456", avatar: "김",
        tasks: { done: 8, total: 8 }, activities: 24, score: 4.5, evalCount: 2, online: false,
        responsibilities: ["설문 설계", "녹취 전사"], color: "#2563eb", isLeader: false,
        criteriaScores: { role: 4.5, deadline: 4.5, communication: 4.5, collaboration: 4.5 },
      },
      {
        name: "박민준", role: "조사 총괄", major: "문헌정보학과 3학년", student: "2021234567", avatar: "박",
        tasks: { done: 8, total: 8 }, activities: 33, score: 4.6, evalCount: 2, online: true,
        responsibilities: ["현지 화자 섭외", "일정 관리", "보고서 총괄"], color: "#f59e0b", isLeader: true,
        criteriaScores: { role: 4.7, deadline: 4.6, communication: 4.5, collaboration: 4.6 },
      },
      {
        name: "오유진", role: "분석 담당", major: "국어국문학과 2학년", student: "2022654321", avatar: "오",
        tasks: { done: 7, total: 8 }, activities: 27, score: 4.4, evalCount: 2, online: false,
        responsibilities: ["어휘 분류", "비교 분석", "최종 보고서 작성"], color: "#2563eb", isLeader: false,
        criteriaScores: { role: 4.4, deadline: 4.2, communication: 4.5, collaboration: 4.5 },
      },
      {
        name: "한소민", role: "촬영·기록 담당", major: "국어국문학과 2학년", student: "2022789012", avatar: "한",
        tasks: { done: 6, total: 8 }, activities: 19, score: 4.0, evalCount: 2, online: false,
        responsibilities: ["인터뷰 촬영", "녹취 자료 정리"], color: "#8b5cf6", isLeader: false,
        criteriaScores: { role: 3.9, deadline: 3.8, communication: 4.1, collaboration: 4.2 },
      },
    ],
  },
};

const folderPalette = ["#2563eb", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444", "#06b6d4"];

const INITIAL_FOLDERS: Record<string, Folder[]> = {
  heritage: [
    { id: 1, name: "현장조사", color: "#8b5cf6", createdBy: "정하늘", date: "2026-09-01" },
    { id: 2, name: "기획·발표", color: "#22c55e", createdBy: "이서연", date: "2026-09-03" },
    { id: 3, name: "데이터", color: "#f59e0b", createdBy: "박민준", date: "2026-08-30" },
  ],
  dialect: [
    { id: 101, name: "현지조사", color: "#8b5cf6", createdBy: "한소민", date: "2026-04-20" },
    { id: 102, name: "분석·보고서", color: "#2563eb", createdBy: "오유진", date: "2026-05-10" },
  ],
};

const INITIAL_FILES: Record<string, WorkspaceFile[]> = {
  heritage: [
    {
      id: 1, name: "문화유산_현장조사_보고서.pdf", type: "pdf", uploader: "김지수", avatar: "김", date: "2026-09-09", size: "2.4 MB", tag: "보고서", folderId: 1,
      versions: [
        { version: "v3", uploadedBy: "김지수", date: "2026-09-09", size: "2.4 MB", note: "최종 수정 — 4장 보완", current: true },
        { version: "v2", uploadedBy: "김지수", date: "2026-09-05", size: "2.1 MB", note: "2, 3장 추가", current: false },
        { version: "v1", uploadedBy: "박민준", date: "2026-09-01", size: "1.3 MB", note: "초안 작성", current: false },
      ],
      comments: [
        { id: 1, author: "박민준", avatar: "박", date: "2026-09-09", text: "4장 통계 수치 출처만 각주로 추가해주시면 좋을 것 같아요." },
        { id: 2, author: "이서연", avatar: "이", date: "2026-09-09", text: "사진 배치는 좋은데 3장 캡션 오타가 하나 보여요 (강화도→강화군)." },
      ],
    },
    {
      id: 2, name: "디지털_아카이브_기획안.pptx", type: "ppt", uploader: "이서연", avatar: "이", date: "2026-09-08", size: "8.7 MB", tag: "기획", folderId: 2,
      versions: [
        { version: "v2", uploadedBy: "이서연", date: "2026-09-08", size: "8.7 MB", note: "디자인 개선 및 내용 보완", current: true },
        { version: "v1", uploadedBy: "이서연", date: "2026-09-03", size: "5.2 MB", note: "초안 발표 자료", current: false },
      ],
      comments: [{ id: 1, author: "김지수", avatar: "김", date: "2026-09-08", text: "색감 훨씬 좋아졌어요! 이대로 중간발표 자료에 반영할게요." }],
    },
    {
      id: 3, name: "문화재_목록_데이터.xlsx", type: "xls", uploader: "정하늘", avatar: "정", date: "2026-09-07", size: "340 KB", tag: "데이터", folderId: 3,
      versions: [
        { version: "v4", uploadedBy: "정하늘", date: "2026-09-07", size: "340 KB", note: "52개 항목 추가 (강화군 지역)", current: true },
        { version: "v3", uploadedBy: "정하늘", date: "2026-09-04", size: "290 KB", note: "오류 수정 및 분류 체계 변경", current: false },
        { version: "v2", uploadedBy: "박민준", date: "2026-09-02", size: "210 KB", note: "초기 목록 구성", current: false },
        { version: "v1", uploadedBy: "박민준", date: "2026-08-30", size: "85 KB", note: "형식 틀 생성", current: false },
      ],
      comments: [],
    },
    {
      id: 4, name: "현장사진_모음.zip", type: "zip", uploader: "정하늘", avatar: "정", date: "2026-09-06", size: "156 MB", tag: "사진", folderId: 1,
      versions: [
        { version: "v2", uploadedBy: "정하늘", date: "2026-09-06", size: "156 MB", note: "인천 강화 지역 추가 촬영분 포함", current: true },
        { version: "v1", uploadedBy: "정하늘", date: "2026-09-01", size: "94 MB", note: "1차 답사 사진", current: false },
      ],
      comments: [{ id: 1, author: "최현우", avatar: "최", date: "2026-09-06", text: "편집 들어갈게요. 흔들린 사진 몇 장은 제외해도 될까요?" }],
    },
    {
      id: 5, name: "중간발표_피드백_정리.docx", type: "doc", uploader: "김지수", avatar: "김", date: "2026-09-05", size: "128 KB", tag: "회의록", folderId: null,
      versions: [{ version: "v1", uploadedBy: "김지수", date: "2026-09-05", size: "128 KB", note: "교수님 피드백 및 팀 내 논의 사항 정리", current: true }],
      comments: [],
    },
  ],
  dialect: [
    {
      id: 201, name: "방언조사_최종보고서.pdf", type: "pdf", uploader: "오유진", avatar: "오", date: "2026-06-19", size: "3.1 MB", tag: "보고서", folderId: 102,
      versions: [
        { version: "v2", uploadedBy: "오유진", date: "2026-06-19", size: "3.1 MB", note: "최종 제출본", current: true },
        { version: "v1", uploadedBy: "오유진", date: "2026-06-10", size: "2.6 MB", note: "초안", current: false },
      ],
      comments: [{ id: 1, author: "박민준", avatar: "박", date: "2026-06-19", text: "고생하셨습니다! 결론부 요약만 조금 더 짧게 가면 완벽할 것 같아요." }],
    },
    {
      id: 202, name: "인터뷰_녹취_전사본.docx", type: "doc", uploader: "김지수", avatar: "김", date: "2026-05-02", size: "540 KB", tag: "전사", folderId: 101,
      versions: [{ version: "v1", uploadedBy: "김지수", date: "2026-05-02", size: "540 KB", note: "1차 인터뷰 5건 전사 완료", current: true }],
      comments: [],
    },
    {
      id: 203, name: "어휘_분류_데이터.xlsx", type: "xls", uploader: "오유진", avatar: "오", date: "2026-05-12", size: "210 KB", tag: "데이터", folderId: 102,
      versions: [{ version: "v1", uploadedBy: "오유진", date: "2026-05-12", size: "210 KB", note: "지역별 방언 어휘 분류 완료", current: true }],
      comments: [],
    },
    {
      id: 204, name: "현지인터뷰_촬영본.zip", type: "zip", uploader: "한소민", avatar: "한", date: "2026-04-22", size: "89 MB", tag: "영상", folderId: 101,
      versions: [{ version: "v1", uploadedBy: "한소민", date: "2026-04-22", size: "89 MB", note: "1차 현지 촬영분", current: true }],
      comments: [],
    },
  ],
};

function emptyTeam(projectName: string, org: string): TeamData {
  return {
    teamLabel: `${projectName} 팀`,
    teamSub: `${org} · 팀원을 초대해보세요`,
    members: [
      {
        name: "김지수", role: "팀장", major: "역사문화학과 3학년", student: "2021123456", avatar: "김",
        tasks: { done: 0, total: 0 }, activities: 0, score: 0, evalCount: 0, online: true,
        responsibilities: [], color: "#2563eb", isLeader: true,
        criteriaScores: { role: 0, deadline: 0, communication: 0, collaboration: 0 },
      },
    ],
  };
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "");
  return (base || "project") + "-" + Date.now().toString(36);
}

interface ProjectContextValue {
  projects: Project[];
  project: Project;
  setProjectId: (id: string) => void;
  addProject: (input: NewProjectInput) => string;
  team: TeamData;
  transferLeadership: (targetName: string) => void;
  isShortTerm: boolean;
  folders: Folder[];
  files: WorkspaceFile[];
  addFolder: (name: string) => void;
  addFile: (name: string, size: number, folderId: number | null, note?: string) => void;
  addFileVersion: (fileId: number, note?: string) => void;
  addFileComment: (fileId: number, text: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [projectId, setProjectId] = useState<string>(INITIAL_PROJECTS[0].id);
  const [teams, setTeams] = useState<Record<string, TeamData>>(INITIAL_TEAMS);
  const [foldersByProject, setFoldersByProject] = useState<Record<string, Folder[]>>(INITIAL_FOLDERS);
  const [filesByProject, setFilesByProject] = useState<Record<string, WorkspaceFile[]>>(INITIAL_FILES);

  const project = projects.find((p) => p.id === projectId) || projects[0];
  const team = teams[project.id] || emptyTeam(project.name, project.org);
  const folders = foldersByProject[project.id] || [];
  const files = filesByProject[project.id] || [];

  function addProject(input: NewProjectInput): string {
    const id = slugify(input.name);
    const newProject: Project = {
      id,
      name: input.name.trim() || "새 프로젝트",
      org: input.org.trim() || "소속 미지정",
      period: input.period.trim() || "진행 중",
      status: "active",
      startDate: input.startDate,
      endDate: input.endDate,
    };
    setProjects((prev) => [newProject, ...prev]);
    setTeams((prev) => ({ ...prev, [id]: emptyTeam(newProject.name, newProject.org) }));
    setProjectId(id);
    return id;
  }

  function transferLeadership(targetName: string) {
    setTeams((prev) => {
      const current = prev[project.id] || emptyTeam(project.name, project.org);
      return {
        ...prev,
        [project.id]: {
          ...current,
          members: current.members.map((m) => {
            if (m.name === targetName) {
              return { ...m, isLeader: true, role: m.role === "참여자" || m.role === "팀원" ? "팀장" : m.role };
            }
            if (m.isLeader) {
              return { ...m, isLeader: false, role: m.role === "팀장" ? "팀원" : m.role };
            }
            return m;
          }),
        },
      };
    });
  }

  function addFolder(name: string) {
    if (!name.trim()) return;
    const newFolder: Folder = {
      id: Date.now(),
      name: name.trim(),
      color: folderPalette[(foldersByProject[project.id]?.length || 0) % folderPalette.length],
      createdBy: "김지수",
      date: new Date().toISOString().slice(0, 10),
    };
    setFoldersByProject((prev) => ({ ...prev, [project.id]: [...(prev[project.id] || []), newFolder] }));
  }

  function addFile(name: string, size: number, folderId: number | null, note?: string) {
    const ext = name.split(".").pop()?.toLowerCase() || "doc";
    const type = (["pdf", "doc", "ppt", "xls", "zip", "img"].includes(ext) ? ext : "doc") as WorkspaceFile["type"];
    const sizeStr = size > 1_000_000 ? `${(size / 1_000_000).toFixed(1)} MB` : `${Math.round(size / 1000)} KB`;
    const today = new Date().toISOString().slice(0, 10);
    const newFile: WorkspaceFile = {
      id: Date.now(),
      name,
      type,
      uploader: "김지수",
      avatar: "김",
      date: today,
      size: sizeStr,
      tag: "보고서",
      folderId,
      versions: [{ version: "v1", uploadedBy: "김지수", date: today, size: sizeStr, note: note || "신규 업로드", current: true }],
      comments: [],
    };
    setFilesByProject((prev) => ({ ...prev, [project.id]: [newFile, ...(prev[project.id] || [])] }));
  }

  function addFileVersion(fileId: number, note?: string) {
    setFilesByProject((prev) => ({
      ...prev,
      [project.id]: (prev[project.id] || []).map((f) => {
        if (f.id !== fileId) return f;
        const next = `v${f.versions.length + 1}`;
        return {
          ...f,
          versions: [
            { version: next, uploadedBy: "김지수", date: new Date().toISOString().slice(0, 10), size: f.size, note: note || "업데이트", current: true },
            ...f.versions.map((v) => ({ ...v, current: false })),
          ],
        };
      }),
    }));
  }

  function addFileComment(fileId: number, text: string) {
    if (!text.trim()) return;
    setFilesByProject((prev) => ({
      ...prev,
      [project.id]: (prev[project.id] || []).map((f) =>
        f.id !== fileId ? f : { ...f, comments: [...f.comments, { id: Date.now(), author: "김지수", avatar: "김", date: new Date().toISOString().slice(0, 10), text: text.trim() }] }
      ),
    }));
  }

  return (
    <ProjectContext.Provider
      value={{
        projects, project, setProjectId, addProject, team, transferLeadership, isShortTerm: isShortTermProject(project),
        folders, files, addFolder, addFile, addFileVersion, addFileComment,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}
