import { ApiClient } from "./apiClient";
import { accessToken } from "./session";

// C·C++·Java 코드 실행: 브라우저에서는 컴파일할 수 없어서 서버(일회용 Docker 컨테이너)에 맡긴다. 서버가 꺼 두었으면 안내 오류가 온다.
const client = new ApiClient(String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, ""), accessToken);

export interface RemoteRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean; // 시간 또는 메모리 한도 초과
  compileError: boolean;
  truncated: boolean;
  durationMs: number;
}

// 중지: 서버에 취소를 직접 요청해 실행 중인 컨테이너를 종료한다(연결을 끊는 것만으로는 중간 프록시를 거치면 전달되지 않을 수 있다).
export function cancelRemoteRun(): Promise<void> {
  return client.request<void>("/code/cancel", { method: "POST" });
}

// signal로 중단하면 연결도 끊긴다.
export function runRemoteCode(language: "c" | "cpp" | "java", code: string, signal: AbortSignal): Promise<RemoteRunResult> {
  return client.request<RemoteRunResult>("/code/run", { method: "POST", body: JSON.stringify({ language, code }), signal });
}
