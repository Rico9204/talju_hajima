import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FilesService } from '../files/files.service.js';
import { User } from '../users/user.entity.js';

export type OfficeDocumentType = 'word' | 'cell' | 'slide';

const EXT_TYPE_MAP: Record<string, { documentType: OfficeDocumentType; fileType: string }> = {
  docx: { documentType: 'word', fileType: 'docx' },
  doc: { documentType: 'word', fileType: 'doc' },
  xlsx: { documentType: 'cell', fileType: 'xlsx' },
  xls: { documentType: 'cell', fileType: 'xls' },
  pptx: { documentType: 'slide', fileType: 'pptx' },
  ppt: { documentType: 'slide', fileType: 'ppt' },
};

const MIME_BY_EXT: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
};

export function officeTypeFor(path: string): { documentType: OfficeDocumentType; fileType: string } | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPE_MAP[ext] ?? null;
}

export interface OnlyofficeAccessToken {
  purpose: 'raw' | 'callback';
  projectId: string;
  fileId: string;
  userId: string;
}

// 워드/엑셀/PPT를 브라우저 안에서 진짜로 열고 편집하게 해주는 OnlyOffice Document Server 연동.
// 그 서버는 우리 collab(Yjs) 인프라와 완전히 별개로 자기 자신의 실시간 공동편집을 갖고 있고,
// 우리는 "편집기 설정을 만들어주고 / 원본 파일을 내려주고 / 저장 콜백을 받는" 세 가지 역할만 한다.
@Injectable()
export class OnlyofficeService {
  private readonly logger = new Logger(OnlyofficeService.name);

  constructor(
    private readonly filesService: FilesService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
  ) {}

  private internalUrl(): string {
    return this.configService.get<string>('ONLYOFFICE_INTERNAL_URL', 'http://localhost:8080');
  }

  private callbackBaseUrl(): string {
    return this.configService.get<string>('ONLYOFFICE_CALLBACK_BASE_URL', 'http://host.docker.internal:3000');
  }

  private officeJwtSecret(): string {
    return this.configService.get<string>('ONLYOFFICE_JWT_SECRET', 'dev-onlyoffice-secret-change-me');
  }

  private signAccessToken(payload: OnlyofficeAccessToken): string {
    return this.jwtService.sign(payload as unknown as Record<string, unknown>, {
      secret: this.officeJwtSecret(),
      expiresIn: '6h',
    });
  }

  async verifyAccessToken(token: string): Promise<OnlyofficeAccessToken> {
    return this.jwtService.verifyAsync<OnlyofficeAccessToken>(token, { secret: this.officeJwtSecret() });
  }

  async buildEditorConfig(projectId: string, fileId: string, userId: string) {
    const file = await this.filesService.getFile(projectId, fileId, userId);
    const type = officeTypeFor(file.path);
    if (!type) throw new NotFoundException('이 확장자는 오피스 편집기로 열 수 없습니다.');
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    const rawToken = this.signAccessToken({ purpose: 'raw', projectId, fileId, userId });
    const callbackToken = this.signAccessToken({ purpose: 'callback', projectId, fileId, userId });
    const base = this.callbackBaseUrl();

    const config = {
      document: {
        fileType: type.fileType,
        // OnlyOffice는 key가 바뀔 때만 캐시된 이전 상태를 버리고 새로 불러온다 — 버전이 바뀔
        // 때마다(우리 쪽에서 저장이 일어날 때마다) 값이 같이 바뀌어야 남이 편집기를 새로 열 때
        // 옛날 캐시가 아니라 최신 내용을 받는다. OnlyOffice의 key는 영숫자/./_/=/- 만 허용.
        key: `${fileId}-${file.currentVersionId ?? 'seed'}`.replace(/[^0-9a-zA-Z_.=-]/g, '_'),
        title: file.path.split('/').pop(),
        url: `${base}/api/projects/${projectId}/files/${fileId}/onlyoffice/raw?token=${rawToken}`,
        permissions: { edit: true, download: true, print: true },
      },
      documentType: type.documentType,
      editorConfig: {
        callbackUrl: `${base}/api/projects/${projectId}/files/${fileId}/onlyoffice/callback?token=${callbackToken}`,
        lang: 'ko',
        user: { id: userId, name: user?.name ?? '사용자' },
        customization: { forcesave: true, autosave: true },
      },
    };

    const token = this.jwtService.sign(config, { secret: this.officeJwtSecret() });
    return { ...config, token };
  }

  async getRawFile(projectId: string, fileId: string, userId: string): Promise<{ mime: string; bytes: Buffer }> {
    const file = await this.filesService.getFile(projectId, fileId, userId);
    const type = officeTypeFor(file.path);
    if (!type) throw new NotFoundException('이 확장자는 오피스 편집기로 열 수 없습니다.');
    if (!file.content.startsWith('data:')) {
      // 아직 실제 바이너리 내용이 없는 새 파일 — 빈 문서로 취급(OnlyOffice가 새 문서 템플릿을
      // 만들 수 있게 빈 바이트를 내려주면 형식이 깨지므로, 그냥 실패시켜 프론트에서 안내한다).
      throw new NotFoundException('아직 저장된 내용이 없는 파일이에요.');
    }
    const comma = file.content.indexOf(',');
    const mimeMatch = file.content.slice(0, comma).match(/^data:(.*?)(;base64)?$/);
    const mime = mimeMatch?.[1] || MIME_BY_EXT[type.fileType] || 'application/octet-stream';
    const bytes = Buffer.from(file.content.slice(comma + 1), 'base64');
    return { mime, bytes };
  }

  // OnlyOffice 콜백 status 코드: 2 = 편집기를 닫은 뒤 저장 준비됨(MustSave), 6 = 강제 저장
  // (자동 저장 켜둔 상태로 계속 편집 중에도 주기적으로 옴, forcesave 옵션 덕분). 그 외(0=편집
  // 없음, 1=편집 중, 3/4=저장 실패/문서 닫힘 등)는 저장할 내용이 없으므로 무시.
  async handleCallback(
    projectId: string,
    fileId: string,
    userId: string,
    body: { status?: number; url?: string },
  ): Promise<void> {
    if (body.status !== 2 && body.status !== 6) return;
    if (!body.url) return;

    const file = await this.filesService.getFile(projectId, fileId, userId);
    const type = officeTypeFor(file.path);
    if (!type) return;

    // OnlyOffice가 내려준 url은 컨테이너가 "자기 자신"을 가리키는 주소라 호스트에서 그대로
    // fetch하면 포트/호스트가 안 맞을 수 있다 — path+query만 빌려서 우리가 아는
    // ONLYOFFICE_INTERNAL_URL(호스트에 실제로 열려 있는 포트) 기준으로 다시 만든다.
    const savedUrl = new URL(body.url);
    const rebuilt = new URL(savedUrl.pathname + savedUrl.search, this.internalUrl()).toString();
    const res = await fetch(rebuilt);
    if (!res.ok) throw new Error(`OnlyOffice가 저장한 파일을 가져오지 못했습니다: ${res.status}`);
    const arrayBuf = await res.arrayBuffer();

    const mime = MIME_BY_EXT[type.fileType] ?? 'application/octet-stream';
    const base64 = Buffer.from(arrayBuf).toString('base64');
    await this.filesService.saveCollabSnapshot(fileId, userId, `data:${mime};base64,${base64}`);
    this.logger.log(`OnlyOffice 저장 반영: file=${fileId} status=${body.status}`);
  }
}
