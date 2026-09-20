import type { BoardCategory } from "../api/types";

export interface BoardCategoryInfo {
  id: BoardCategory;
  name: string;
  icon: string;
  badgeColor: string;
  badgeBg: string;
  description: string;
}

export const BOARD_CATEGORIES: BoardCategoryInfo[] = [
  {
    id: "notice",
    name: "공지사항",
    icon: "📢",
    badgeColor: "#ef4444",
    badgeBg: "#ef444418",
    description: "플랫폼 및 서비스 주요 커뮤니티 공지사항입니다.",
  },
  {
    id: "free",
    name: "자유 게시판",
    icon: "💬",
    badgeColor: "#2563eb",
    badgeBg: "#2563eb18",
    description: "팀원 및 사용자들과 자유롭게 담소를 나누는 공간입니다.",
  },
  {
    id: "recruit",
    name: "팀원 모집",
    icon: "🚀",
    badgeColor: "#22c55e",
    badgeBg: "#22c55e18",
    description: "새로운 팀 프로젝트를 시작하거나 필요한 동료를 구해보세요.",
  },
];

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
