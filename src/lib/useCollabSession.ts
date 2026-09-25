import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { buildCollabWsOrigin, collabAuthToken, colorForUserId } from "./quickEdit";

export interface CollabPeer {
  userId: string;
  name: string;
  color: string;
}

// DocEditorModal/SlidesEditorModal이 공통으로 쓰는 웹소켓 연결 + 참여자(awareness) 추적.
// QuickEditModal(일반 텍스트, 커서 좌표 직접 계산)은 요구사항이 달라 따로 관리한다.
//
// provider는 useEffect가 아니라 useState의 lazy initializer로 "마운트 시 즉시" 만든다 — 그래야
// 첫 렌더부터 provider가 non-null로 안정적이다. 이전에는 useEffect 안에서 만들어서 첫 렌더엔
// provider가 null이었는데, DocEditorModal/SlidesEditorModal이 provider를 useEditor의
// 의존성 배열에 넣고 있어서 null -> 실제값으로 바뀌는 순간 에디터 전체가 한 번 더
// destroy+재생성됐다 — Yjs 문서에 이미 붙어있던 동기화 플러그인이 정리되는 타이밍과 겹치면서
// 새 문서를 만들자마자 먹통이 되는 원인으로 의심되어, aini 재생성 자체가 안 일어나게 바꿨다.
export function useCollabSession(
  ydoc: Y.Doc,
  {
    projectId,
    fileId,
    pinId,
    myUserId,
    myName,
  }: { projectId: string; fileId: string; pinId?: string; myUserId: string; myName: string },
) {
  const [provider] = useState(() => {
    const params: Record<string, string> = { projectId, fileId, token: collabAuthToken() };
    if (pinId) params.pinId = pinId;
    return new WebsocketProvider(buildCollabWsOrigin(), "collab", ydoc, { params });
  });
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  // provider.synced — 서버와 처음 상태 교환(sync step1/step2)까지 끝나 "지금 로컬에 있는 내용이
  // 서버 최신 상태"라고 믿을 수 있는 시점. SlidesEditorModal이 "슬라이드가 비어있으면 기본
  // 슬라이드 하나 만들기"를 이 시점 이후에만 하도록 쓴다(그래야 기존 슬라이드를 다시 열었을 때
  // 동기화되기 전 잠깐 비어 보이는 틈에 빈 슬라이드를 새로 만들어버리는 일이 없다).
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    // StrictMode(dev)는 마운트 직후 effect를 정리→재실행한다. 그 첫 정리에서 destroy()가
    // shouldConnect를 false로 내려버리고 ws를 닫으므로, 재실행되는 이 effect가 명시적으로
    // connect()를 다시 불러주지 않으면 연결이 "연결 중..."에 영구히 멈춘다. 이미 연결된
    // 상태에서 부르는 건 안전하다(provider.ws가 있으면 아무 일도 안 함).
    provider.connect();

    const updatePeers = () => {
      const states = provider.awareness.getStates();
      const list: CollabPeer[] = [];
      states.forEach((state, clientId) => {
        if (clientId === ydoc.clientID) return;
        const user = (state as { user?: CollabPeer }).user;
        if (user) list.push(user);
      });
      setPeers(list);
    };
    provider.awareness.on("change", updatePeers);
    provider.awareness.setLocalStateField("user", { userId: myUserId, name: myName, color: colorForUserId(myUserId) });

    const onStatus = ({ status: s }: { status: string }) => setStatus(s === "connected" ? "connected" : "connecting");
    const onClose = () => setStatus("disconnected");
    const onSync = (isSynced: boolean) => setSynced(isSynced);
    provider.on("status", onStatus);
    provider.on("connection-close", onClose);
    provider.on("connection-error", onClose);
    provider.on("sync", onSync);

    return () => {
      provider.awareness.off("change", updatePeers);
      provider.off("status", onStatus);
      provider.off("connection-close", onClose);
      provider.off("connection-error", onClose);
      provider.off("sync", onSync);
      provider.awareness.setLocalState(null);
      provider.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  return { provider, status, peers, synced };
}
