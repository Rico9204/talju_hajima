import { useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { Fixture } from "./workspace-context";
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
    <div className="min-h-screen bg-[var(--background)] text-foreground flex flex-col">
      <header className="px-6 py-2.5 border-b border-[var(--border)] bg-[var(--card)] flex items-center justify-between sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="font-800 text-sm tracking-tight flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-md bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold">SP</span>
            오프라인 로컬 테스트
          </span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-500/20">
            🟢 백엔드 서버 없이 브라우저에서 100% 동작 중
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--surface-opaque)] p-1 rounded-xl border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setTab("workspace")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              tab === "workspace" ? "bg-[var(--primary)] text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📁 워크스페이스 (드래그 박스 여백 & HWPX)
          </button>
          <button
            type="button"
            onClick={() => setTab("board")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              tab === "board" ? "bg-[var(--primary)] text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            💬 게시판 (1560px 와이드 너비)
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 overflow-y-auto">
        {tab === "workspace" ? (
          <Workspace />
        ) : (
          <div className="max-w-[1560px] mx-auto w-full transition-all">
            <BoardView />
          </div>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
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
