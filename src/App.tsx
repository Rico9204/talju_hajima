import { useState } from "react";
import Dashboard from "./components/Dashboard";
import TeamView from "./components/TeamView";
import TaskBoard from "./components/TaskBoard";
import PeerEvaluation from "./components/PeerEvaluation";
import Workspace, { type WorkspaceFocus } from "./components/Workspace";
import TeamChat from "./components/TeamChat";
import DataCollector from "./components/DataCollector";
import Schedule from "./components/Schedule";
import Sidebar from "./components/Sidebar";
import { ProjectProvider } from "./context/ProjectContext";

export type Page = "dashboard" | "team" | "chat" | "tasks" | "schedule" | "workspace" | "collector" | "evaluation";

function AppShell() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [chatTarget, setChatTarget] = useState<string | undefined>(undefined);
  const [workspaceFocus, setWorkspaceFocus] = useState<WorkspaceFocus | null>(null);

  function openChatWith(name: string) {
    setChatTarget(name);
    setCurrentPage("chat");
  }

  function openFileInWorkspace(fileId: number, folderId: number | null) {
    setWorkspaceFocus({ fileId, folderId });
    setCurrentPage("workspace");
  }

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "var(--background)" }}>
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 overflow-y-auto">
        {currentPage === "dashboard" && <Dashboard onNavigate={setCurrentPage} />}
        {currentPage === "team" && <TeamView onMessage={openChatWith} />}
        {currentPage === "chat" && <TeamChat initialChannel={chatTarget} onOpenFile={openFileInWorkspace} />}
        {currentPage === "tasks" && <TaskBoard />}
        {currentPage === "schedule" && <Schedule />}
        {currentPage === "workspace" && <Workspace focusFile={workspaceFocus} />}
        {currentPage === "collector" && <DataCollector />}
        {currentPage === "evaluation" && <PeerEvaluation />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <AppShell />
    </ProjectProvider>
  );
}
