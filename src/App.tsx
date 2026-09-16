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
import Login from "./components/Login";
import ResetPassword from "./components/ResetPassword";
import Landing from "./components/Landing";
import AdminPanel from "./components/AdminPanel";
import { ProjectProvider, useProject } from "./context/ProjectContext";
import { AuthProvider, useAuth } from "./context/AuthContext";

export type Page = "dashboard" | "team" | "chat" | "tasks" | "schedule" | "workspace" | "collector" | "evaluation" | "admin";

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
  const { isAdmin } = useAuth();
  const { project } = useProject();
  const currentPage = (location.pathname.split("/")[1] || "dashboard") as Page;

  // Non-approved projects (created by a non-admin, awaiting review) are
  // locked to the dashboard page for everyone except an admin — matches
  // gwanhan.md: "승인 대기/반려 상태에서는 대시보드 외 나머지 기능 접근 불가".
  if (!isAdmin && project.approvalStatus !== "approved" && currentPage !== "dashboard") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: "var(--background)" }}>
      <Sidebar currentPage={currentPage} onNavigate={(p) => navigate(`/${p}`)} />
      {/* pt-16 clears the fixed mobile hamburger button (Sidebar.tsx) — moot at md+, where that button is hidden. */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pt-16 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}

function RequireAdmin() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminPanel />;
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
      <Route path="/" element={<Landing />} />
      <Route path="login" element={<Login />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route element={<RequireAuth />}>
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
        <Route path="admin" element={<RequireAdmin />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
