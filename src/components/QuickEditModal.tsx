import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { buildCollabWsOrigin, collabAuthToken, applyTextareaDelta, colorForUserId, getCaretCoordinates } from "../lib/quickEdit";

interface Peer {
  userId: string;
  name: string;
  color: string;
  // 이 사람의 커서가 지금 문서의 몇 번째 글자 위치에 있는지 — Y.RelativePosition을 매번
  // 현재 문서 기준으로 다시 풀어낸 값이라, 다른 사람이 그 앞부분을 고쳐도 정확한 위치를 유지한다.
  cursorOffset: number | null;
}

// "바로 수정" — 폴더 연동/새 버전 업로드 없이, 지금 워크스페이스에 있는 텍스트 파일을 곧바로
// 열어서 고칠 수 있는 실시간 공동편집 창. 같은 파일을 동시에 "바로 수정"으로 연 사람들은 서로의
// 타이핑과 커서 위치가 실시간으로 보인다(Yjs CRDT + 웹소켓, backend/src/collab). 타이핑이 잠깐
// 멈추면 서버가 자동으로 새 버전을 저장하므로 따로 "저장" 버튼은 없다.
export default function QuickEditModal({
  projectId,
  fileId,
  filePath,
  pinId,
  pinLabel,
  myUserId,
  myName,
  onClose,
}: {
  projectId: string;
  fileId: string;
  filePath: string;
  // 지정하면 파일의 메인 현재 버전이 아니라 이 핀이 가리키는 버전 기준으로 시작하고, 자동 저장도
  // 파일의 현재 버전이 아니라 이 핀만 앞으로 이어붙인다(다른 사람의 메인 작업과 안 섞임).
  pinId?: string;
  pinLabel?: string;
  myUserId: string;
  myName: string;
  onClose: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<InstanceType<typeof WebsocketProvider>["awareness"] | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [peers, setPeers] = useState<Peer[]>([]);
  // 커서가 화면 어디쯤 그려져야 하는지(스크롤 반영 전, 문서 좌표 기준) — 텍스트나 peer 커서
  // 위치가 바뀔 때만 다시 계산하고, 스크롤은 렌더링에서 그때그때 빼서 반영한다(재계산 비용 절약).
  const [caretCoords, setCaretCoords] = useState<Map<string, { top: number; left: number; height: number }>>(new Map());
  const [scrollPos, setScrollPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const doc = new Y.Doc();
    const ytext = doc.getText("content");
    ytextRef.current = ytext;
    docRef.current = doc;

    const params: Record<string, string> = { projectId, fileId, token: collabAuthToken() };
    if (pinId) params.pinId = pinId;
    const provider = new WebsocketProvider(buildCollabWsOrigin(), "collab", doc, { params });
    awarenessRef.current = provider.awareness;
    provider.awareness.setLocalStateField("user", { userId: myUserId, name: myName, color: colorForUserId(myUserId) });

    const updatePeers = () => {
      const states = provider.awareness.getStates();
      const list: Peer[] = [];
      states.forEach((state, clientId) => {
        if (clientId === doc.clientID) return;
        const user = (state as { user?: { userId: string; name: string; color: string } }).user;
        if (!user) return;
        let cursorOffset: number | null = null;
        const cursorRaw = (state as { cursor?: number[] }).cursor;
        if (cursorRaw) {
          try {
            const relPos = Y.decodeRelativePosition(Uint8Array.from(cursorRaw));
            const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, doc);
            if (absPos) cursorOffset = absPos.index;
          } catch {
            // 커서 정보가 깨져 왔으면(버전 불일치 등) 그냥 표시하지 않는다.
          }
        }
        list.push({ userId: user.userId, name: user.name, color: user.color, cursorOffset });
      });
      setPeers(list);
    };
    provider.awareness.on("change", updatePeers);

    const onTextChange = () => {
      setValue(ytext.toString());
      // 문서가 바뀌면 다른 사람 커서의 "절대 위치"도 같이 다시 계산해야 한다(그 앞부분이
      // 늘거나 줄었을 수 있으므로) — RelativePosition은 그대로지만 index는 다시 풀어야 함.
      updatePeers();
    };
    ytext.observe(onTextChange);

    provider.on("status", ({ status: s }: { status: string }) => {
      setStatus(s === "connected" ? "connected" : "connecting");
    });
    provider.on("connection-close", () => setStatus("disconnected"));
    provider.on("connection-error", () => setStatus("disconnected"));

    setValue(ytext.toString());

    return () => {
      ytext.unobserve(onTextChange);
      provider.awareness.setLocalState(null);
      provider.destroy();
      doc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, fileId, pinId]);

  // 내 커서(또는 선택 영역의 끝) 위치를 다른 사람에게 알린다 — 클릭/방향키/드래그로 선택이
  // 바뀔 때마다(onSelect는 이 모든 경우에 다 발생함).
  function broadcastCursor() {
    const textarea = textareaRef.current;
    const ytext = ytextRef.current;
    const doc = docRef.current;
    const awareness = awarenessRef.current;
    if (!textarea || !ytext || !doc || !awareness) return;
    const relPos = Y.createRelativePositionFromTypeIndex(ytext, textarea.selectionEnd);
    awareness.setLocalStateField("cursor", Array.from(Y.encodeRelativePosition(relPos)));
  }

  // peer 목록(위치)이 바뀔 때마다 화면에 그릴 좌표를 다시 계산 — textarea 값이 리렌더된
  // 뒤(같은 값 기준)라야 mirror 측정이 정확하므로 value도 의존성에 넣는다.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const next = new Map<string, { top: number; left: number; height: number }>();
    for (const p of peers) {
      if (p.cursorOffset === null) continue;
      const clamped = Math.max(0, Math.min(p.cursorOffset, textarea.value.length));
      next.set(p.userId, getCaretCoordinates(textarea, clamped));
    }
    setCaretCoords(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers, value]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    const ytext = ytextRef.current;
    if (!ytext) return;
    applyTextareaDelta(ytext, value, newValue);
    // observe 콜백이 곧 setValue(ytext.toString())로 다시 반영하지만, 타이핑이 끊김 없이 보이게
    // 우선 로컬 state도 바로 갱신해둔다(같은 값이라 거의 항상 일치함).
    setValue(newValue);
    broadcastCursor();
  }

  function handleScroll(e: React.UIEvent<HTMLTextAreaElement>) {
    setScrollPos({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft });
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-6" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div
        className="w-full max-w-4xl h-[85vh] flex flex-col"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.28)" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <div className="text-sm font-700 truncate">
              바로 수정 · {filePath}
              {pinLabel && <span style={{ color: "#8b5cf6" }}> · 📌 {pinLabel}</span>}
            </div>
            {/* 지금 같이 수정 중인 사람 이름 — 제목 바로 옆에 표시 */}
            {peers.map((p) => (
              <span
                key={p.userId}
                className="px-1.5 py-0.5 text-[10px] font-700 rounded-full shrink-0"
                style={{ background: `${p.color}20`, color: p.color }}
              >
                ✏️ {p.name}
              </span>
            ))}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-lg shrink-0"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "10px" }}
          >
            ×
          </button>
        </div>
        <div className="text-xs flex items-center gap-1.5 px-5 pt-2" style={{ color: "var(--muted-foreground)" }}>
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: status === "connected" ? "#22c55e" : status === "connecting" ? "#f59e0b" : "#ef4444" }}
          />
          {status === "connected" ? "실시간 연결됨" : status === "connecting" ? "연결 중..." : "연결 끊김 — 재연결 시도 중"}
        </div>
        <div className="flex-1 relative min-h-0 m-4 mt-2">
          {/* 다른 사람의 커서 — textarea 위에 겹쳐서 그린다(입력은 막지 않게 pointer-events: none) */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {peers.map((p) => {
              const coord = caretCoords.get(p.userId);
              if (!coord) return null;
              const top = coord.top - scrollPos.top;
              const left = coord.left - scrollPos.left;
              if (top < -coord.height || left < -8) return null;
              return (
                <div key={p.userId} className="absolute" style={{ top, left, height: coord.height }}>
                  <div style={{ width: 2, height: coord.height, background: p.color }} />
                  <div
                    className="absolute top-0 left-0 -translate-y-full whitespace-nowrap text-[10px] font-700 px-1 rounded-sm"
                    style={{ background: p.color, color: "#fff" }}
                  >
                    {p.name}
                  </div>
                </div>
              );
            })}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onSelect={broadcastCursor}
            onScroll={handleScroll}
            spellCheck={false}
            className="w-full h-full p-4 text-xs outline-none resize-none"
            style={{ fontFamily: "var(--font-jetbrains)", color: "var(--foreground)", background: "var(--muted)", borderRadius: "10px" }}
          />
        </div>
        <div className="px-5 py-2.5 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
          타이핑을 멈추면 자동으로 새 버전이 저장돼요. 이 창을 닫아도 계속 저장됩니다.
          {pinLabel && ` (파일의 현재 버전이 아니라 "${pinLabel}" 핀에 이어붙어요)`}
        </div>
      </div>
    </div>
  );
}
