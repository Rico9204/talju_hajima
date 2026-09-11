import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
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

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = (location.pathname.split("/")[1] || "dashboard") as Page;

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "var(--background)" }}>
      <Sidebar currentPage={currentPage} onNavigate={(p) => navigate(`/${p}`)} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function DashboardRoute() {
  const navigate = useNavigate();
  return <Dashboard onNavigate={(p) => navigate(`/${p}`)} />;
}

function TeamViewRoute() {
  const navigate = useNavigate();
  return <TeamView onMessage={(name) => navigate(`/chat/${encodeURIComponent(name)}`)} />;
}

function ChatRoute() {
  const navigate = useNavigate();
  const { channel } = useParams();
  return (
    <TeamChat
      initialChannel={channel ? decodeURIComponent(channel) : undefined}
      onOpenFile={(fileId, folderId) => navigate(`/workspace/${folderId ?? "none"}/${fileId}`)}
    />
  );
}

function WorkspaceRoute() {
  const { folderId, fileId } = useParams();
  const focusFile: WorkspaceFocus | null =
    fileId !== undefined
      ? { fileId: Number(fileId), folderId: folderId && folderId !== "none" ? Number(folderId) : null }
      : null;
  return <Workspace focusFile={focusFile} />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardRoute />} />
        <Route path="team" element={<TeamViewRoute />} />
        <Route path="chat" element={<ChatRoute />} />
        <Route path="chat/:channel" element={<ChatRoute />} />
        <Route path="tasks" element={<TaskBoard />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="workspace" element={<WorkspaceRoute />} />
        <Route path="workspace/:folderId/:fileId" element={<WorkspaceRoute />} />
        <Route path="collector" element={<DataCollector />} />
        <Route path="evaluation" element={<PeerEvaluation />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ProjectProvider>
  );
}
