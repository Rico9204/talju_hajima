import { useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { Fixture } from "./workspace-context";
import Sidebar from "../../src/components/Sidebar";
import Workspace from "../../src/components/Workspace";
import BoardView from "../../src/components/BoardView";
import "../../src/index.css";

// ?opfs=1: 폴더 고르기 창 대신 브라우저 안 가상 폴더(OPFS)에서 window.__nextPick 이름의 폴더를 고른다(로컬 동기화 확인용).
if (new URLSearchParams(location.search).has("opfs")) {
  (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () =>
    (await navigator.storage.getDirectory()).getDirectoryHandle((window as unknown as { __nextPick?: string }).__nextPick ?? "picked", { create: true });
}
// ?nofs=1: 폴더 동기화를 지원하지 않는 브라우저(사파리 등)처럼 보이게 한다.
if (new URLSearchParams(location.search).has("nofs")) delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;

function LocalPreviewApp() {
  const [tab, setTab] = useState<"workspace" | "board">("workspace");

  return (
    <div className="h-screen w-screen bg-[var(--background)] text-foreground flex flex-col overflow-hidden">
      {/* Top Banner with Quick Switcher */}
      <header className="px-6 py-2 border-b border-[var(--border)] bg-[var(--card)] flex items-center justify-between shrink-0 z-40 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="font-800 text-xs tracking-tight flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-[var(--primary)] text-white flex items-center justify-center text-[10px] font-bold">SP</span>
            실제 사이드바 포함 로컬 테스트
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-500/20">
            🟢 백엔드 서버 없이 브라우저에서 100% 동작
          </span>
        </div>
        <div className="flex items-center gap-1 bg-[var(--surface-opaque)] p-1 rounded-xl border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setTab("workspace")}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              tab === "workspace" ? "bg-[var(--primary)] text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📁 워크스페이스 (실제 사이드바 + 드래그 여백)
          </button>
          <button
            type="button"
            onClick={() => setTab("board")}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              tab === "board" ? "bg-[var(--primary)] text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            💬 게시판 (실제 사이드바 + 1560px 와이드)
          </button>
        </div>
      </header>

      {/* Real Application Shell: Left Sidebar (w-60) + Main Content on Right */}
      <div className="relative flex flex-1 h-full w-full overflow-hidden">
        <Sidebar
          currentPage={tab === "workspace" ? "workspace" : ("dashboard" as any)}
          onNavigate={(p) => {
            if (p === "workspace") setTab("workspace");
          }}
          onHome={() => setTab("board")}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
          {tab === "workspace" ? (
            <Workspace />
          ) : (
            <div className="max-w-[1560px] mx-auto w-full transition-all">
              <BoardView />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const container = document.getElementById("root")!;
const root = (window as unknown as { __previewRoot?: ReturnType<typeof createRoot> }).__previewRoot ??
  ((window as unknown as { __previewRoot?: ReturnType<typeof createRoot> }).__previewRoot = createRoot(container));

root.render(
  <RouterProvider
    router={createMemoryRouter([
      {
        path: "*",
        element: (
          <Fixture>
            <LocalPreviewApp />
          </Fixture>
        ),
      },
    ])}
  />
);
