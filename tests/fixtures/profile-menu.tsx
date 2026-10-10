import { createRoot } from "react-dom/client";
import { Fixture } from "./profile-menu-context";
import UserMenu from "../../src/components/UserMenu";
import ProfileModal from "../../src/components/ProfileModal";
import "../../src/index.css";
// 왼쪽 사이드바 아래쪽에 붙는 내 카드처럼 배치한다.
createRoot(document.getElementById("root")!).render(<Fixture>
  <aside className="w-64 p-4 flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
    <div className="flex-1 p-4" style={{ background: "var(--card-glass)", borderRadius: "var(--radius)" }}>메뉴 자리</div>
    <UserMenu subtitle="팀장 · 이 프로젝트" onOpenSettings={() => console.log("[fixture] 설정 열기")} />
  </aside>
  <ProfileModal />
</Fixture>);
