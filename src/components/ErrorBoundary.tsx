import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

// 화면 그리기 중 오류가 나도 흰 화면 대신 안내를 보여 준다.
//  - variant "full": 앱 전체를 감싸는 마지막 안전망(로그인 상태·라우터 밖에서도 동작)
//  - variant "page": 사이드바 옆 페이지 영역만 감싼다 — 다른 메뉴로 이동하면 원래대로(RouteErrorBoundary)

const RELOAD_KEY = "collabpeer.new-version-reload-at";

// 배포 직후, 열려 있던 탭이 이미 지워진 옛 화면 파일(지연 로딩 조각)을 받으려다 실패한 경우.
export function isChunkLoadError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error);
  return (error as { name?: unknown })?.name === "ChunkLoadError"
    || /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message);
}

// 새 버전을 받으려고 한 번만 새로 고침한다. 1분 안에 또 실패하면(파일이 정말 없는 경우) 반복하지 않고 false.
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false; // 기록을 못 남기면 반복을 막을 수 없으니 자동 새로 고침은 하지 않는다
  }
  window.location.reload();
  return true;
}

type Props = { children: ReactNode; variant?: "full" | "page" };
type State = { failed: boolean; chunk: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, chunk: false };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, chunk: isChunkLoadError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("화면을 표시하지 못했습니다.", error, info.componentStack);
    if (isChunkLoadError(error)) reloadForNewVersion();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const full = this.props.variant === "full";
    return (
      <div role="alert" className={`flex w-full items-center justify-center p-6 ${full ? "h-full" : "min-h-[60vh]"}`} style={{ background: full ? "var(--background)" : undefined }}>
        <div className="w-[26rem] max-w-full p-6 text-center" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)" }}>
          <div className="text-3xl mb-3" aria-hidden="true">{this.state.chunk ? "🔄" : "⚠️"}</div>
          <h2 className="font-700 mb-2">{this.state.chunk ? "새 버전이 배포되었어요" : "화면을 표시하는 중 문제가 생겼어요"}</h2>
          <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            {this.state.chunk
              ? "새로 고침하면 최신 화면으로 이어서 사용할 수 있어요."
              : full
                ? "새로 고침해 주세요. 계속 같은 화면이 나오면 팀에 알려 주세요."
                : "다른 메뉴는 그대로 사용할 수 있어요. 계속 같은 화면이 나오면 새로 고침하거나 팀에 알려 주세요."}
          </p>
          <div className="flex gap-2 justify-center">
            <button type="button" onClick={() => window.location.reload()} className="px-5 py-2.5 text-sm font-700" style={{ background: "var(--primary)", color: "#fff", borderRadius: "40px" }}>
              새로 고침
            </button>
            {full && (
              <a href="/home" className="px-5 py-2.5 text-sm font-700" style={{ background: "var(--muted)", color: "var(--foreground)", borderRadius: "40px" }}>
                홈으로
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }
}

// 페이지 주소가 바뀌면 오류 상태를 비운다(오류 난 페이지에서 다른 메뉴로 가면 정상 표시).
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname} variant="page">{children}</ErrorBoundary>;
}
