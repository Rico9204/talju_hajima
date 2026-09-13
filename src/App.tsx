import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import Dashboard from "./components/Dashboard";
import MyProjects from "./components/MyProjects";
import TeamView from "./components/TeamView";
import TaskBoard from "./components/TaskBoard";
import PeerEvaluation from "./components/PeerEvaluation";
import Workspace from "./components/Workspace";
import FolderSync from "./components/FolderSync";
import TeamChat from "./components/TeamChat";
import DataCollector from "./components/DataCollector";
import Schedule from "./components/Schedule";
import Sidebar from "./components/Sidebar";
import Login from "./components/Login";
import ResetPassword from "./components/ResetPassword";
import Landing from "./components/Landing";
import { ProjectProvider } from "./context/ProjectContext";
import { AuthProvider, useAuth } from "./context/AuthContext";

export type Page =
  | "myprojects"
  | "dashboard"
  | "team"
  | "chat"
  | "tasks"
  | "schedule"
  | "workspace"
  | "foldersync"
  | "collector"
  | "evaluation";

function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>불러오는 중…</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <Layout />;
}

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = (location.pathname.split("/")[1] || "myprojects") as Page;

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
  return <TeamView onMessage={(memberId) => navigate(`/chat/${encodeURIComponent(memberId)}`)} />;
}

function ChatRoute() {
  const navigate = useNavigate();
  const { channel } = useParams();
  return (
    <TeamChat
      initialChannel={channel ? decodeURIComponent(channel) : undefined}
      onOpenFile={() => navigate("/workspace")}
    />
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="login" element={<Login />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route element={<RequireAuth />}>
        <Route path="myprojects" element={<MyProjects />} />
        <Route path="dashboard" element={<DashboardRoute />} />
        <Route path="team" element={<TeamViewRoute />} />
        <Route path="chat" element={<ChatRoute />} />
        <Route path="chat/:channel" element={<ChatRoute />} />
        <Route path="tasks" element={<TaskBoard />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="workspace" element={<Workspace />} />
        <Route path="foldersync" element={<FolderSync />} />
        <Route path="collector" element={<DataCollector />} />
        <Route path="evaluation" element={<PeerEvaluation />} />
        <Route path="*" element={<Navigate to="/myprojects" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ProjectProvider>
    </AuthProvider>
  );
}
