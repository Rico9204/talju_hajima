// EditorAvatars가 쓰는 팀원 목록만 돌려준다.
export function useProject() {
  return { team: { members: [{ id: "user-a", name: "김하나", avatar: "하", color: "#2563eb" }, { id: "user-b", name: "이두리", avatar: "두", color: "#db2777" }] } };
}
