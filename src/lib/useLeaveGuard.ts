import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

// 저장 안 한 변경이 있는 편집기에서 뒤로가기 등으로 다른 화면으로 가려 하면 이동을 멈추고 편집기의 닫기 확인을 띄운다.
// (탭 닫기·새로고침은 beforeunload가 맡는다.) leave = 멈춘 이동 계속, stay = 이동 취소.
export function useLeaveGuard(dirty: boolean, showConfirm: (show: boolean) => void) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === "blocked") showConfirm(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);
  return {
    leave: () => { if (blocker.state === "blocked") blocker.proceed(); },
    stay: () => { if (blocker.state === "blocked") blocker.reset(); },
  };
}
