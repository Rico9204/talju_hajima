export function workspaceUploadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error ?? "");
  const normalized = message.toLowerCase();
  if (normalized.includes("bucket not found")) {
    return "워크스페이스 저장소가 준비되지 않았습니다. 관리자에게 저장소 배포 상태 확인을 요청한 뒤 다시 시도해 주세요.";
  }
  if (normalized.includes("row-level security") || normalized.includes("new row violates")) {
    return "파일을 올릴 권한이 없습니다. 프로젝트 참여 상태와 워크스페이스 업로드 권한을 확인해 주세요.";
  }
  if (normalized.includes("register_workspace") || normalized.includes("schema cache")) {
    return "파일 등록 기능이 아직 배포되지 않았습니다. 관리자에게 DB 배포 상태 확인을 요청해 주세요.";
  }
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  return message || "업로드에 실패했습니다. 다시 시도해 주세요.";
}
