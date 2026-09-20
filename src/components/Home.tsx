import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../context/AuthContext";
import CreateProjectModal from "./CreateProjectModal";
import JoinProjectModal from "./JoinProjectModal";

const statusStyle: Record<"active" | "done", { label: string; bg: string; color: string }> = {
  active: { label: "진행 중", bg: "#22c55e18", color: "#22c55e" },
  done: { label: "완료", bg: "var(--muted)", color: "var(--muted-foreground)" },
};

export default function Home() {
  const { projects, setProjectId, addProject, lookupProject, joinProject } = useProject();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  function enterProject(id: string) {
    setProjectId(id);
    navigate("/dashboard");
  }

  return (
    <div className="h-full w-full overflow-y-auto" style={{ background: "var(--background)" }}>
      <div className="max-w-5xl mx-auto px-6 py-8 md:px-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 flex items-center justify-center text-sm font-800 shrink-0"
              style={{ background: "var(--primary)", color: "#fff", borderRadius: "12px", boxShadow: "0 6px 16px rgba(37,99,235,0.3)" }}
            >
              CP
            </div>
            <div className="min-w-0">
              <div className="text-lg font-800">CollabPeer</div>
              <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{user?.email}</div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="text-xs font-600 px-3.5 py-2 shrink-0"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "20px" }}
          >
            로그아웃
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 mb-4">
          <h1 className="text-xl font-700">내 프로젝트</h1>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setJoinOpen(true)}
              className="text-xs font-700 px-3.5 py-2"
              style={{ background: "#22c55e18", color: "#22c55e", borderRadius: "20px" }}
            >
              참여하기
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="text-xs font-700 px-3.5 py-2"
              style={{ background: "var(--primary)", color: "#fff", borderRadius: "20px" }}
            >
              새 프로젝트
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div
            className="p-8 text-center border-2 border-dashed"
            style={{ borderColor: "var(--border)", borderRadius: "var(--radius)", color: "var(--muted-foreground)" }}
          >
            참여 중인 프로젝트가 없어요
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => {
              const st = statusStyle[p.status];
              return (
                <button
                  key={p.id}
                  onClick={() => enterProject(p.id)}
                  className="text-left p-5 transition-all"
                  style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                    <span className="text-xs font-700 px-2 py-0.5" style={{ background: st.bg, color: st.color, borderRadius: "20px" }}>
                      {st.label}
                    </span>
                    {p.approvalStatus === "pending" && (
                      <span className="text-xs font-700 px-2 py-0.5" style={{ background: "#f0a50018", color: "#f0a500", borderRadius: "20px" }}>
                        승인 대기
                      </span>
                    )}
                    {p.approvalStatus === "rejected" && (
                      <span className="text-xs font-700 px-2 py-0.5" style={{ background: "#ef444418", color: "#ef4444", borderRadius: "20px" }}>
                        반려됨
                      </span>
                    )}
                  </div>
                  <div className="text-base font-700 truncate mb-1">{p.name}</div>
                  <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{p.org}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{p.period}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateProjectModal
          onCancel={() => setCreateOpen(false)}
          onCreate={async (input) => {
            const id = await addProject(input);
            setCreateOpen(false);
            navigate("/dashboard");
            return id;
          }}
        />
      )}
      {joinOpen && (
        <JoinProjectModal
          lookupProject={lookupProject}
          joinProject={joinProject}
          onCancel={() => setJoinOpen(false)}
          onJoined={() => {
            setJoinOpen(false);
            navigate("/dashboard");
          }}
        />
      )}
    </div>
  );
}
