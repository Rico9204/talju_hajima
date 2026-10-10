import { createContext, useContext, useState, type ReactNode } from "react";
// 내 카드 메뉴·프로필 편집 미리보기용 가짜 컨텍스트(실제 DB 미연결). ProjectContext와 AuthContext를 함께 대신한다.
const Context = createContext<any>(null);
const me = { id: "me", userId: "me", name: "테스트 사용자", avatar: "테", color: "#2563eb", role: "팀장", major: "컴퓨터공학과 3학년", student: "20230001", contact: "", links: [], score: 0, evalCount: 0 };
export function Fixture({ children }: { children: ReactNode }) {
  const [viewedMemberId, setViewedMemberId] = useState<string | null>(null);
  const [profileSection, setProfileSection] = useState<string | null>(null);
  const [member, setMember] = useState(me);
  return <Context.Provider value={{
    project: { id: "test", name: "로컬 UI 검증", status: "active" }, projects: [], team: { members: [member] }, currentMember: member,
    viewedMemberId, profileSection,
    openMemberProfile: (id: string, section?: string) => { setProfileSection(section ?? null); setViewedMemberId(id); },
    closeMemberProfile: () => setViewedMemberId(null),
    updateMyProfile: async (input: { name?: string; major?: string; student?: string; contact?: string | null; bannerColor?: string }) =>
      setMember((m) => ({ ...m, name: input.name ?? m.name, major: input.major ?? m.major, student: input.student ?? m.student, contact: input.contact ?? "", bannerColor: input.bannerColor })),
    getMyEvaluationSummary: () => Promise.reject(new Error("미리보기")),
    isAdmin: false,
    user: { email: "test@example.com" },
    signOut: () => console.log("[fixture] 로그아웃"),
    updatePassword: async () => ({ error: null }),
  }}>
    <div className="p-3" style={{ background: "#fef3c7", color: "#111" }}><strong>테스트 전용 · 실제 DB 미연결</strong></div>
    {children}
  </Context.Provider>;
}
export function useProject() { return useContext(Context); }
export function useProjectManagement() { return useContext(Context); }
export function useAuth() { return useContext(Context); }
