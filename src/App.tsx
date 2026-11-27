import { lazy, Suspense, useCallback, useRef, type CSSProperties } from "react";
import { createBrowserRouter, Navigate, Outlet, Route, RouterProvider, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { WorkspaceFocus } from "./components/Workspace";
import AppChrome from "./components/AppChrome";
import Sidebar from "./components/Sidebar";
import Login from "./components/Login";
import ResetPassword from "./components/ResetPassword";
import ConfirmEmail from "./components/ConfirmEmail";
import Landing from "./components/Landing";
import { ProjectProvider, useProject, useProjectManagement } from "./context/ProjectContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useAccountBackground } from "./lib/useAccountBackground";
import ErrorBoundary, { RouteErrorBoundary } from "./components/ErrorBoundary";

// Keep sign-in and the selected route responsive while infrequently visited
// workspace, evaluation and profile-related pages download in the background.
const Home = lazy(() => import("./components/Home"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const TeamView = lazy(() => import("./components/TeamView"));
const TaskBoard = lazy(() => import("./components/TaskBoard"));
const PeerEvaluation = lazy(() => import("./components/PeerEvaluation"));
const Workspace = lazy(() => import("./components/Workspace"));
const TeamChat = lazy(() => import("./components/TeamChat"));
const Schedule = lazy(() => import("./components/Schedule"));
const AdminPanel = lazy(() => import("./components/AdminPanel"));
const AdminApplication = lazy(() => import("./components/AdminApplication"));
// 한글 편집기 단독 테스트 화면(로그인 없이 열림)은 개발 서버에서만 연다. 운영 빌드에서는 경로와 코드가 빠진다.
const HwpxTestPage = import.meta.env.DEV ? lazy(() => import("./components/HwpxTestPage")) : null;

function PageLoading() {
  return <div className="flex h-full min-h-48 items-center justify-center text-sm" style={{ color: "var(--muted-foreground)" }}>화면을 불러오는 중…</div>;
}

export type Page = "dashboard" | "team" | "chat" | "tasks" | "schedule" | "workspace" | "evaluation" | "admin";

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
  return <Outlet />;
}

// 앱 셸의 overflow-hidden 래퍼들은 사용자가 스크롤할 수 없지만, 코드(scrollIntoView, 포커스 이동,
// 텍스트 드래그 자동 스크롤, 브라우저 "찾기" 등)로는 스크롤된다. 한 번 밀리면 사이드바가 잘린 채
// 돌아오지 않으므로, 이 요소들이 스크롤되는 즉시 원위치로 되돌린다.
function usePinnedScroll(pinTop: boolean) {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const reset = () => {
      if (el.scrollLeft) el.scrollLeft = 0;
      if (pinTop && el.scrollTop) el.scrollTop = 0;
    };
    el.addEventListener("scroll", reset, { passive: true });
    cleanup.current = () => el.removeEventListener("scroll", reset);
  }, [pinTop]);
}

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useProjectManagement();
  const { project } = useProject();
  const currentPage = (location.pathname.split("/")[1] || "dashboard") as Page;
  const { backgroundStyle, glassStyle } = useAccountBackground();
  const pinShell = usePinnedScroll(true);
  const pinRow = usePinnedScroll(true);
  const pinMain = usePinnedScroll(false); // main은 세로 스크롤이 정상 동작이라 가로만 고정

  // Non-approved projects (created by a non-admin, awaiting review) are
  // locked to the dashboard page for everyone except an admin.
  if (!isAdmin && (project.approvalStatus === "pending" || project.approvalStatus === "rejected") && currentPage !== "dashboard") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div ref={pinShell} className="relative h-full w-full overflow-hidden" style={glassStyle}>
      {/* Filter only this stationary background layer. Cards reuse it through
          transparency; scaling keeps the blurred edges outside the viewport. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          ...backgroundStyle,
          transform: "scale(1.1) translateZ(0)",
          // A viewport-sized blurred+scaled layer is prone to Chromium's
          // tile-based rasterization seams (thin flickering lines at tile
          // boundaries, worse on weaker GPUs/drivers) — translateZ(0) alone
          // pins it to its own layer. Deliberately NOT adding
          // will-change: transform here too: combined with the backdrop-filter
          // glass cards elsewhere in the tree, it isolated this layer enough
          // that Chromium's backdrop-filter sampling broke for fixed-position
          // popups above it (the notification dropdown rendered invisible —
          // just a sliver of its box-shadow — instead of showing its content).
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      />
      <div ref={pinRow} className="relative flex h-full w-full overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={(p) => navigate(`/${p}`)} onHome={() => navigate("/home")} />
        {/* pt-16 clears the fixed mobile hamburger button (Sidebar.tsx) — moot at md+, where that button is hidden. */}
        <main ref={pinMain} className="flex-1 overflow-y-auto overflow-x-hidden pt-16 md:pt-0">
          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function RequireAdmin() {
  const { isAdmin } = useProjectManagement();
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
  const [searchParams, setSearchParams] = useSearchParams();
  const messageIdParam = searchParams.get("messageId");
  const focusMessageId = messageIdParam ? Number(messageIdParam) : undefined;
  return (
    <TeamChat
      initialChannel={channel ? decodeURIComponent(channel) : undefined}
      focusMessageId={focusMessageId}
      onFocusHandled={() => setSearchParams({}, { replace: true })}
      onOpenFile={(fileId, folderId) => navigate(`/workspace/${folderId ?? "none"}/${fileId}`)}
    />
  );
}

function ScheduleRoute() {
  const { eventId } = useParams();
  return <Schedule focusEventId={eventId ? Number(eventId) : undefined} />;
}

function TaskBoardRoute() {
  const { taskId } = useParams();
  return <TaskBoard focusTaskId={taskId ? Number(taskId) : undefined} />;
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
      {HwpxTestPage && <Route path="hwpx-test" element={<HwpxTestPage />} />}
      <Route path="reset-password" element={<ResetPassword />} />
      <Route path="confirm-email" element={<ConfirmEmail />} />
      <Route element={<RequireAuth />}>
        <Route path="home" element={<Home />} />
        <Route path="admin-application" element={<AdminApplication />} />
        {/* 업적은 메인 화면(/home) 좌측 메뉴로 옮겼다. 예전 주소는 메인 화면으로. */}
        <Route path="achievements" element={<Navigate to="/home" replace />} />
        <Route element={<Layout />}>
          <Route path="dashboard" element={<DashboardRoute />} />
          <Route path="team" element={<TeamViewRoute />} />
          <Route path="chat" element={<ChatRoute />} />
          <Route path="chat/:channel" element={<ChatRoute />} />
          <Route path="tasks" element={<TaskBoardRoute />} />
          <Route path="tasks/:taskId" element={<TaskBoardRoute />} />
          <Route path="schedule" element={<ScheduleRoute />} />
          <Route path="schedule/:eventId" element={<ScheduleRoute />} />
          <Route path="workspace" element={<WorkspaceRoute />} />
          <Route path="workspace/:folderId/:fileId" element={<WorkspaceRoute />} />
          <Route path="evaluation" element={<PeerEvaluation />} />
          <Route path="admin" element={<RequireAdmin />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

// 라우트는 AppRoutes(<Routes>)가 그대로 맡고, data router는 편집기의 이탈 확인(useBlocker)에만 쓴다.
// data router는 화면 오류를 자체 기본 화면으로 먼저 잡으므로 앱의 ErrorBoundary를 안쪽에도 둔다.
const router = createBrowserRouter([{
  path: "*",
  element: (
    <ErrorBoundary variant="full">
      {/* 공지 배너·알림 종·관리자 공지 팝업은 ProjectProvider 바깥에 둔다: 프로젝트가 없는 사용자는 앱 전체가 다른 화면으로 바뀐다. */}
      <AppChrome>
        <ProjectProvider>
          <Suspense fallback={<PageLoading />}>
            <AppRoutes />
          </Suspense>
        </ProjectProvider>
      </AppChrome>
    </ErrorBoundary>
  ),
}]);

export default function App() {
  // 가장 바깥 안전망: 로그인·프로젝트 불러오기 단계를 포함해 어디서 오류가 나도 흰 화면 대신 안내.
  // 페이지 영역 오류는 Layout 안의 RouteErrorBoundary가 먼저 받아 사이드바는 그대로 둔다.
  return (
    <ErrorBoundary variant="full">
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  );
}
