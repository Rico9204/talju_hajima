import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import type { WebSocket } from 'ws';

// y-websocket(npm) 클라이언트의 WebsocketProvider가 그대로 붙을 수 있도록, 그 표준 서버
// 구현(y-websocket/bin/utils.js)의 프로토콜을 그대로 따른다 — 메시지 타입 0=동기화(sync),
// 1=참여자 상태(awareness). 방(room) 하나 = 파일 하나(fileId 기준)의 Y.Doc.

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

// 방의 내용을 어떤 형태로 저장/복원할지 — 'text'는 기존 "바로 수정"(일반 텍스트 파일)처럼
// Y.Text 하나를 그대로 문자열로 저장하고, 'snapshot'은 리치 문서/슬라이드처럼 Y.Doc 전체를
// 바이너리 스냅샷(base64)으로 저장한다(문서 구조가 Y.Text 하나로 표현 안 되므로).
export type CollabContentMode = 'text' | 'snapshot';

export class WSSharedDoc extends Y.Doc {
  readonly fileId: string;
  readonly projectId: string;
  // 핀 기준 "바로 수정" 방이면 그 핀 id — null이면 파일의 메인 현재 버전을 편집하는 일반 방.
  // 핀 방은 fileId가 같아도 별도의 Y.Doc(별도 room)으로 취급한다(핀별로 독립된 작업 흐름).
  readonly pinId: string | null;
  readonly contentMode: CollabContentMode;
  // 연결(conn) -> 그 연결이 소유한 awareness clientID 집합. 연결이 끊기면 이 clientID들의
  // awareness 상태를 지워서 "이 사람은 더 이상 접속 중이 아님"을 다른 참여자에게 알린다.
  readonly conns = new Map<WebSocket, Set<number>>();
  readonly awareness: awarenessProtocol.Awareness;
  // 이 방에 지금 붙어있는 사람들(파일 목록의 "바로 수정 중" 배지용) — awareness와 별개로
  // REST 폴링에서 바로 읽을 수 있게 간단한 목록으로 따로 들고 있는다.
  readonly activeUsers = new Map<WebSocket, { userId: string; name: string }>();
  // 마지막으로 내용을 바꾼 사람 — 디바운스된 스냅샷 저장 시 버전의 작성자로 쓴다.
  lastEditorUserId: string | null = null;
  persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(fileId: string, projectId: string, pinId: string | null = null, contentMode: CollabContentMode = 'text') {
    super({ gc: true });
    this.fileId = fileId;
    this.projectId = projectId;
    this.pinId = pinId;
    this.contentMode = contentMode;
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, conn: WebSocket | null) => {
        const changedClients = added.concat(updated, removed);
        if (conn !== null) {
          const connControlledIds = this.conns.get(conn);
          if (connControlledIds) {
            added.forEach((id) => connControlledIds.add(id));
            removed.forEach((id) => connControlledIds.delete(id));
          }
        }
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients));
        const message = encoding.toUint8Array(encoder);
        this.conns.forEach((_ids, c) => sendMessage(this, c, message));
      },
    );

    // 문서 내용이 바뀔 때마다(누군가의 편집이 서버에 반영될 때마다) 그 변경분을 나머지 모든
    // 참여자에게 그대로 전달한다 — 이게 없으면 서버는 각자와 개별적으로만 동기화될 뿐, 다른
    // 사람의 편집이 실시간으로 서로에게 보이지 않는다(진짜 "같이 수정"의 핵심 부분).
    this.on('update', (update: Uint8Array, origin: WebSocket | null) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_ids, conn) => {
        if (conn !== origin) sendMessage(this, conn, message);
      });
    });
  }
}

// 소켓 하나에 메시지(바이너리 프레임)를 보낸다 — 이미 닫혔거나 보내다 실패하면 그 연결을
// 조용히 정리한다(전체 방이 죽지 않게).
export function sendMessage(doc: WSSharedDoc, conn: WebSocket, message: Uint8Array): void {
  if (conn.readyState !== conn.OPEN) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, (err) => {
      if (err) closeConn(doc, conn);
    });
  } catch {
    closeConn(doc, conn);
  }
}

export function closeConn(doc: WSSharedDoc, conn: WebSocket): void {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn)!;
    doc.conns.delete(conn);
    doc.activeUsers.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
  }
  try {
    conn.close();
  } catch {
    // 이미 닫혀있으면 무시
  }
}

export function messageListener(doc: WSSharedDoc, conn: WebSocket, message: Uint8Array, userId: string): void {
  const encoder = encoding.createEncoder();
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case MESSAGE_SYNC: {
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
      // 이 연결에게 보낼 응답이 실제로 생겼을 때만(예: step1에 대한 step2) 되돌려 보낸다.
      if (encoding.length(encoder) > 1) sendMessage(doc, conn, encoding.toUint8Array(encoder));
      doc.lastEditorUserId = userId;
      break;
    }
    case MESSAGE_AWARENESS: {
      awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
      break;
    }
    default:
      break;
  }
}
