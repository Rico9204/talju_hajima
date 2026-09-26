import { Injectable, Logger } from '@nestjs/common';
import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { JwtService } from '@nestjs/jwt';
import { ProjectsService } from '../projects/projects.service.js';
import { UsersService } from '../users/users.service.js';
import { FilesService } from '../files/files.service.js';
import {
  closeConn,
  messageListener,
  sendMessage,
  MESSAGE_SYNC,
  MESSAGE_AWARENESS,
  WSSharedDoc,
  type CollabContentMode,
} from './ws-shared-doc.js';

// 일정 시간(4초) 입력이 없으면 지금까지 여러 명이 같이 고친 내용을 새 버전으로 저장한다.
// 매 키 입력마다 저장하면 버전 이력이 의미 없이 쌓이므로, 타이핑이 잠깐이라도 멈춘 때만 스냅샷.
const PERSIST_DEBOUNCE_MS = 4000;
const WS_PATH = '/collab';

// 리치 문서/슬라이드는 내용이 Y.Text 하나로 표현되지 않는 구조(TipTap의 Y.XmlFragment, 슬라이드의
// Y.Array/Y.Map 트리)라, 일반 텍스트 파일과 달리 방 전체를 바이너리 스냅샷으로 저장/복원한다.
function contentModeFor(path: string): CollabContentMode {
  return path.endsWith('.rtdoc') || path.endsWith('.slides') ? 'snapshot' : 'text';
}

// 저장되는 content 문자열 앞에 이 접두사를 붙여서, 프론트엔드가 파일 경로 없이도(예: 버전 diff
// 화면처럼 content만 보는 곳) "이건 Yjs 스냅샷이라 줄글로 비교하면 안 된다"를 바로 알 수 있게 한다
// (이미지 업로드의 "data:" 접두사와 같은 방식).
const SNAPSHOT_PREFIX = 'yjs-snapshot:';

@Injectable()
export class CollabService {
  private readonly logger = new Logger(CollabService.name);
  private readonly docs = new Map<string, WSSharedDoc>();
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
    private readonly filesService: FilesService,
  ) {}

  // main.ts에서 Nest가 물고 있는 실제 http.Server에 붙인다 — Express 라우팅과는 완전히 별개로,
  // 이 경로(WS_PATH)로 들어오는 업그레이드 요청만 가로채 처리한다.
  //
  // 인증(JWT 검증 + 멤버십/파일 확인)은 전부 DB를 거치는 비동기 작업이다. 만약 이걸 소켓을 이미
  // "연결 완료"시킨 뒤에(handleUpgrade 콜백 안에서) 한다면, 그 await 하는 동안 클라이언트가
  // 곧바로 보낸 첫 메시지(sync step1)가 도착해도 아직 'message' 리스너를 안 달아놓은 상태라
  // 그냥 유실된다(EventEmitter는 리스너 없는 이벤트를 조용히 버림) — 실제로 이 문제 때문에
  // 접속 직후 기존 파일 내용이 안 불러와지는 버그가 있었다. 그래서 인증은 소켓을 완성하기
  // *전에*(업그레이드를 수락하기 전에) 전부 끝내고, handleUpgrade 콜백 안에서는 동기적으로만
  // 리스너를 달아서 메시지를 놓치지 않게 한다.
  attach(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
      const url = new URL(request.url ?? '', 'http://localhost');
      if (url.pathname !== WS_PATH) return;

      this.authenticate(url.searchParams)
        .then((auth) => {
          if (!auth) {
            socket.destroy();
            return;
          }
          this.wss!.handleUpgrade(request, socket, head, (ws) => {
            // 여기서부터는 전부 동기 코드 — await 없이 바로 리스너를 단다.
            this.setupConnection(ws, auth);
          });
        })
        .catch((err) => {
          this.logger.warn(`collab 인증 실패: ${err instanceof Error ? err.message : err}`);
          socket.destroy();
        });
    });
  }

  private async authenticate(params: URLSearchParams): Promise<{
    userId: string;
    name: string;
    projectId: string;
    fileId: string;
    pinId: string | null;
    content: string;
    contentMode: CollabContentMode;
  } | null> {
    const token = params.get('token') ?? '';
    const projectId = params.get('projectId') ?? '';
    const fileId = params.get('fileId') ?? '';
    const pinId = params.get('pinId') || null;
    if (!token || !projectId || !fileId) return null;

    let userId: string;
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token);
      userId = payload.sub;
    } catch {
      return null;
    }

    // 프로젝트 멤버인지 + 실제로 존재하는 파일인지 확인 (getFile이 멤버십도 함께 검사함).
    const file = await this.filesService.getFile(projectId, fileId, userId).catch(() => null);
    if (!file) return null;

    // 핀 기준 세션이면 그 핀이 가리키는 버전 내용으로 시작한다 — 파일의 현재 내용이 아니라.
    let content = file.content;
    if (pinId) {
      const pinData = await this.filesService.getPinContent(fileId, pinId);
      if (!pinData) return null;
      content = pinData.content;
    }

    const me = await this.usersService.findById(userId);
    return { userId, name: me?.name ?? '알 수 없음', projectId, fileId, pinId, content, contentMode: contentModeFor(file.path) };
  }

  private setupConnection(
    ws: WebSocket,
    auth: {
      userId: string;
      name: string;
      projectId: string;
      fileId: string;
      pinId: string | null;
      content: string;
      contentMode: CollabContentMode;
    },
  ): void {
    const { userId, name, projectId, fileId, pinId, content, contentMode } = auth;
    const roomKey = pinId ?? fileId;
    const doc = this.getOrCreateDoc(roomKey, fileId, projectId, pinId, contentMode, content);
    doc.conns.set(ws, new Set());
    doc.activeUsers.set(ws, { userId, name });

    ws.binaryType = 'nodebuffer';
    ws.on('message', (data: Buffer) => {
      try {
        messageListener(doc, ws, new Uint8Array(data), userId);
        this.schedulePersist(doc);
      } catch (err) {
        this.logger.warn(`collab 메시지 처리 실패: ${err instanceof Error ? err.message : err}`);
      }
    });

    ws.on('close', () => {
      closeConn(doc, ws);
      if (doc.conns.size === 0) {
        // 마지막 사람이 나가면 타이머를 기다리지 않고 즉시 저장한 뒤, 메모리에서 방을 정리한다.
        this.persistNow(doc).finally(() => {
          if (doc.conns.size === 0) this.docs.delete(roomKey);
        });
      }
    });

    // 접속 직후: 이 클라이언트에게 sync step1(내 상태를 알려달라는 요청)을 보내고,
    // 이미 있는 다른 참여자들의 awareness 상태도 함께 보내준다.
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(syncEncoder, doc);
    sendMessage(doc, ws, encoding.toUint8Array(syncEncoder));

    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())),
      );
      sendMessage(doc, ws, encoding.toUint8Array(awarenessEncoder));
    }
  }

  private getOrCreateDoc(
    roomKey: string,
    fileId: string,
    projectId: string,
    pinId: string | null,
    contentMode: CollabContentMode,
    initialContent: string,
  ): WSSharedDoc {
    const existing = this.docs.get(roomKey);
    if (existing) return existing;

    const doc = new WSSharedDoc(fileId, projectId, pinId, contentMode);
    // 방을 처음 만들 때만 현재 내용(핀이면 핀의 버전, 아니면 파일 현재 내용)으로 채운다 —
    // 이미 메모리에 있던 방이면(재연결 등) 진행 중인 공동편집 상태를 덮어쓰면 안 되므로 건드리지
    // 않는다.
    if (contentMode === 'text') {
      const ytext = doc.getText('content');
      if (ytext.length === 0 && initialContent.length > 0) ytext.insert(0, initialContent);
    } else if (initialContent.startsWith(SNAPSHOT_PREFIX)) {
      // 리치 문서/슬라이드 — 저장돼있던 Y.Doc 바이너리 스냅샷(base64)을 그대로 복원한다.
      // 새로 만든 빈 문서(아직 저장된 스냅샷이 없음)면 클라이언트가 기본 구조를 알아서 채운다.
      try {
        Y.applyUpdate(doc, Buffer.from(initialContent.slice(SNAPSHOT_PREFIX.length), 'base64'));
      } catch (err) {
        this.logger.warn(`collab 스냅샷 복원 실패(${fileId}): ${err instanceof Error ? err.message : err}`);
      }
    }
    this.docs.set(roomKey, doc);
    return doc;
  }

  private schedulePersist(doc: WSSharedDoc): void {
    if (doc.persistTimer) clearTimeout(doc.persistTimer);
    doc.persistTimer = setTimeout(() => {
      this.persistNow(doc).catch((err) => this.logger.warn(`collab 스냅샷 저장 실패: ${err instanceof Error ? err.message : err}`));
    }, PERSIST_DEBOUNCE_MS);
  }

  private async persistNow(doc: WSSharedDoc): Promise<void> {
    if (doc.persistTimer) {
      clearTimeout(doc.persistTimer);
      doc.persistTimer = null;
    }
    if (!doc.lastEditorUserId) return;
    const content =
      doc.contentMode === 'text'
        ? doc.getText('content').toString()
        : SNAPSHOT_PREFIX + Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
    if (doc.pinId) {
      await this.filesService.saveCollabSnapshotForPin(doc.pinId, doc.lastEditorUserId, content);
    } else {
      await this.filesService.saveCollabSnapshot(doc.fileId, doc.lastEditorUserId, content);
    }
  }

  // 파일 목록 화면의 "바로 수정 중" 배지용 — 지금 이 프로젝트에서 공동편집 중인 파일별 참여자 목록.
  // 같은 파일이라도 메인 버전 방과 핀 방이 동시에 열려있을 수 있으므로 fileId 기준으로 합친다.
  listActiveUsers(projectId: string): { fileId: string; users: { userId: string; name: string }[] }[] {
    const byFile = new Map<string, Map<string, { userId: string; name: string }>>();
    for (const doc of this.docs.values()) {
      if (doc.projectId !== projectId || doc.activeUsers.size === 0) continue;
      const users = byFile.get(doc.fileId) ?? new Map<string, { userId: string; name: string }>();
      for (const u of doc.activeUsers.values()) users.set(u.userId, u);
      byFile.set(doc.fileId, users);
    }
    return Array.from(byFile.entries()).map(([fileId, users]) => ({ fileId, users: Array.from(users.values()) }));
  }
}
