import { createRoot } from "react-dom/client";
import { Fixture } from "./workspace-context";
import Workspace from "../../src/components/Workspace";
import "../../src/index.css";
// ?opfs=1: 폴더 고르기 창 대신 브라우저 안 가상 폴더(OPFS)에서 window.__nextPick 이름의 폴더를 고른다(로컬 동기화 확인용).
if (new URLSearchParams(location.search).has("opfs")) {
  (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () =>
    (await navigator.storage.getDirectory()).getDirectoryHandle((window as unknown as { __nextPick?: string }).__nextPick ?? "picked", { create: true });
}
// ?nofs=1: 폴더 동기화를 지원하지 않는 브라우저(사파리 등)처럼 보이게 한다.
if (new URLSearchParams(location.search).has("nofs")) delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
createRoot(document.getElementById("root")!).render(<Fixture><Workspace /></Fixture>);
