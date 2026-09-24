import type { BoardReportReason } from "../api/types";

export const BOARD_REPORT_REASONS: { value: BoardReportReason; label: string }[] = [
  { value: "spam", label: "스팸·광고" },
  { value: "abuse", label: "욕설·비방·혐오" },
  { value: "sexual", label: "음란·부적절한 내용" },
  { value: "privacy", label: "개인정보 노출" },
  { value: "other", label: "기타" },
];

export function reportReasonLabel(reason: BoardReportReason): string {
  return BOARD_REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}
