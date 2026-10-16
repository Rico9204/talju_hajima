import { useState } from "react";
import type { NewProjectInput, Project } from "../api/types";
import { recruitPostFromNotice, type BoardInitialState } from "../lib/recruitFromNotice";
import AdminApplicationNotice from "./AdminApplicationNotice";
import BoardView from "./BoardView";
import CampusNoticesView from "./CampusNoticesView";
import CreateProjectModal from "./CreateProjectModal";
import JoinProjectModal from "./JoinProjectModal";
import Settings from "./Settings";

// 아직 참여한 프로젝트가 없는 계정의 첫 화면. 예전에는 "만들기/참여하기" 카드만 있어서
// 팀을 찾는 데 필요한 게시판(팀원 모집 글)·캠퍼스 소식·설정을 쓸 수 없었고 로그아웃 버튼도 없었다.
// 프로젝트가 필요 없는 메뉴만 보여 준다(업적·프로필은 팀원 정보가 있어야 해서 참여 후에).
type Tab = "start" | "board" | "campus" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "start", label: "🚀 시작하기" },
  { id: "board", label: "📋 게시판" },
  { id: "campus", label: "📰 캠퍼스 소식" },
  { id: "settings", label: "⚙️ 설정" },
];

export default function NoProjectHome({ signOut, addProject, lookupProject, joinProject }: {
  signOut: () => void;
  addProject: (input: NewProjectInput, recruitMessage?: string) => Promise<string>;
  lookupProject: (code: string) => Promise<Project | null>;
  joinProject: (projectId: string, code: string, input: { school: string; major: string; student: string }) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("start");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [boardInitialState, setBoardInitialState] = useState<BoardInitialState | null>(null);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      <header className="shrink-0 border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3 px-4 md:px-8 py-3">
          <img src="/slackerspace_icon.png" alt="Slackerspace" className="w-8 h-8 shrink-0" style={{ borderRadius: "20%" }} />
          <nav className="flex-1 min-w-0 flex gap-1 overflow-x-auto" aria-label="메뉴">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className="shrink-0 text-sm font-600 px-3 py-2 transition-all"
                style={{ borderRadius: "10px", background: tab === t.id ? "var(--primary)" : "transparent", color: tab === t.id ? "#fff" : "var(--foreground)" }}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button type="button" onClick={signOut} className="shrink-0 text-xs font-600 px-3.5 py-2" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}>
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <AdminApplicationNotice />
          {tab === "start" ? (
            <div className="max-w-md mx-auto mt-6 px-6 py-6 text-center" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
              <div className="text-base font-700 mb-1">아직 참여한 프로젝트가 없어요</div>
              <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
                새 프로젝트를 만들거나, 팀장에게 받은 참여 코드로 참여해 보세요.
                팀을 찾고 있다면 <button type="button" onClick={() => setTab("board")} className="font-700 underline" style={{ color: "var(--primary)" }}>게시판의 팀원 모집 글</button>을 둘러보세요.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setJoinOpen(true)} className="flex-1 py-2.5 text-sm font-700" style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "40px" }}>
                  참여하기
                </button>
                <button type="button" onClick={() => setCreateOpen(true)} className="flex-1 py-2.5 text-sm font-700" style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px" }}>
                  새 프로젝트
                </button>
              </div>
            </div>
          ) : tab === "board" ? (
            <BoardView
              initialCategory={boardInitialState?.category}
              initialCreating={boardInitialState?.isCreating}
              initialPostTitle={boardInitialState?.title}
              initialPostContent={boardInitialState?.content}
              onResetInitialState={() => setBoardInitialState(null)}
            />
          ) : tab === "campus" ? (
            <CampusNoticesView onRecruitFromNotice={(notice) => { setBoardInitialState(recruitPostFromNotice(notice)); setTab("board"); }} />
          ) : (
            <Settings />
          )}
        </div>
      </main>

      {createOpen && <CreateProjectModal onCancel={() => setCreateOpen(false)} onCreate={(input, recruit) => addProject(input, recruit)} />}
      {joinOpen && (
        <JoinProjectModal
          lookupProject={lookupProject}
          joinProject={joinProject}
          onCancel={() => setJoinOpen(false)}
          onJoined={() => setJoinOpen(false)}
        />
      )}
    </div>
  );
}
