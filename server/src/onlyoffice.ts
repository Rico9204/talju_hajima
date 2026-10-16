import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Logger, NotFoundException, Param, ParseIntPipe, Post, Query as QueryParam, Req, Res, UseGuards } from "@nestjs/common";
import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import type { Duplex } from "node:stream";
import { createHash } from "node:crypto";
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware";
import { SignJWT, jwtVerify } from "jose";
import { myProfile } from "./actor.js";
import { AuthGuard, UserId } from "./auth.js";
import { Db, selectOneJson } from "./db.js";
import { FileStore, saveWorkspaceVersion } from "./storage.js";

// ── 오피스 편집(OnlyOffice Document Server 연동, Temporary_Merge에서 이식) ──
// 워드·엑셀·PPT를 앱 안에서 편집한다. 공동편집은 OnlyOffice가 스스로 하고, 이 서버는 세 가지만 한다:
//  1) 편집기 설정 만들기(그 파일을 볼 수 있는 사람만, 종료된 프로젝트는 보기 전용)
//  2) 문서 서버에 원본 내려주기(raw)  3) 저장 콜백을 받아 워크스페이스의 새 버전으로 등록.
// 문서 서버는 이 서버의 /onlyoffice/ 아래로 중계해서, ngrok 주소 하나로 화면에 편집기를 띄운다(터널 추가 없음).
// 문서 서버 ↔ 이 서버는 공유 비밀값(ONLYOFFICE_JWT_SECRET)으로 서명한 JWT로 서로 확인한다(OnlyOffice 표준 방식).

export interface OnlyofficeSettings {
  url: string; // 이 서버가 문서 서버에 닿는 주소(예: http://127.0.0.1:8080)
  jwtSecret: string; // 문서 서버의 JWT_SECRET과 같은 값
  callbackBaseUrl: string; // 문서 서버가 이 서버에 닿는 주소(원본·저장 콜백). 기본은 PUBLIC_BASE_URL
}

const PREFIX = "/onlyoffice";
const OFFICE_TYPES: Record<string, { documentType: "word" | "cell" | "slide"; mime: string }> = {
  docx: { documentType: "word", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xlsx: { documentType: "cell", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  pptx: { documentType: "slide", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
};
export const officeTypeOf = (name: string) => OFFICE_TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;

type LinkClaims = { p: "raw" | "cb"; f: number; v: number; u: string };

export class OnlyofficeService {
  private readonly logger = new Logger("OnlyOffice");
  private readonly linkKey: Uint8Array;
  private readonly officeKey: Uint8Array | null;
  // 진행 중인 공동편집 세션: 같은 세션의 자동 저장으로 버전이 바뀌어도, 새로 여는 사람이 같은 문서 키(=같은 세션)로 합류하게.
  // ponytail: 서버를 다시 켜면 잊는다 — 그때 연 사람은 새 세션으로 열린다(저장 내용은 모두 버전으로 남음).
  private readonly sessions = new Map<number, { key: string; versionId: number }>();

  constructor(private readonly db: Db, private readonly store: FileStore, readonly settings: OnlyofficeSettings | undefined, jwtSecret: string,
    private readonly fetchImpl: typeof fetch = fetch) {
    this.linkKey = createHash("sha256").update(`${jwtSecret}:onlyoffice-link`).digest();
    this.officeKey = settings ? new TextEncoder().encode(settings.jwtSecret) : null;
  }

  get enabled(): boolean { return !!this.settings; }

  private require(): OnlyofficeSettings {
    if (!this.settings) throw new NotFoundException("오피스 편집이 설정되지 않았습니다.");
    return this.settings;
  }

  private signLink(claims: LinkClaims, ttl: string): Promise<string> {
    return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(this.linkKey);
  }

  async verifyLink(token: string, purpose: LinkClaims["p"]): Promise<LinkClaims> {
    const { payload } = await jwtVerify(token, this.linkKey, { algorithms: ["HS256"] });
    if (payload.p !== purpose || typeof payload.f !== "number" || typeof payload.v !== "number" || typeof payload.u !== "string") throw new Error("잘못된 링크");
    return payload as unknown as LinkClaims;
  }

  // 1) 편집기 설정. 파일·현재 버전·원본 목록이 "그 사용자로서" 보여야 한다(권한 규칙).
  async editorConfig(userId: string, fileId: number) {
    const settings = this.require();
    const found = await this.db.asUser(userId, async (query) => {
      const file = await selectOneJson(query, "select f.id, f.name, f.project_id, p.status from public.files f join public.projects p on p.id = f.project_id where f.id = $1", [fileId]);
      if (!file) throw new NotFoundException("파일을 찾을 수 없습니다.");
      const version = await selectOneJson(query, "select id, storage_path, original_name from public.file_versions where file_id = $1 and current", [fileId]);
      if (!version?.storage_path) throw new BadRequestException("원본이 있는 버전이 없어 편집기로 열 수 없습니다.");
      const object = await selectOneJson(query, "select 1 as ok from storage.objects where bucket_id = 'workspace-files' and name = $1", [version.storage_path]);
      if (!object) throw new ForbiddenException("원본을 볼 권한이 없습니다.");
      return { file, version, me: await myProfile(query) };
    });
    const type = officeTypeOf(found.version.original_name ?? found.file.name) ?? officeTypeOf(found.file.name);
    if (!type) throw new BadRequestException("워드(docx)·엑셀(xlsx)·파워포인트(pptx) 파일만 오피스 편집기로 열 수 있습니다.");
    const editable = found.file.status !== "done";
    const versionId = Number(found.version.id);
    const session = this.sessions.get(fileId);
    // 문서 키: 같은 키 = 같은 공동편집 세션. 세션이 만든 버전이 아직 현재 버전이면 그 세션에 합류한다.
    const key = session && session.versionId === versionId ? session.key : `${fileId}-${versionId}-${Date.now().toString(36)}`;
    const base = settings.callbackBaseUrl;
    const config = {
      document: {
        fileType: (found.version.original_name ?? found.file.name).split(".").pop()!.toLowerCase(),
        key,
        title: found.file.name,
        url: `${base}/api/onlyoffice/raw?token=${await this.signLink({ p: "raw", f: fileId, v: versionId, u: userId }, "6h")}`,
        permissions: { edit: editable, download: true, print: true },
      },
      documentType: type.documentType,
      editorConfig: {
        mode: editable ? "edit" : "view",
        lang: "ko",
        callbackUrl: `${base}/api/onlyoffice/callback?token=${await this.signLink({ p: "cb", f: fileId, v: versionId, u: userId }, "7d")}`,
        user: { id: userId, name: found.me.name },
        // 화면에 외부 편집기 이름이 보이지 않게: 상단 로고와 도움말(외부 사이트) 메뉴를 숨긴다(무료판에서 허용되는 설정).
        // 로딩 화면 문구·로고(loaderName·loaderLogo)와 정보(about)는 유료판 전용이라, 로딩 화면은 화면 쪽에서 가린다.
        customization: { forcesave: true, autosave: true, logo: { visible: false }, help: false, feedback: false },
      },
    };
    const token = await new SignJWT(config as unknown as Record<string, unknown>).setProtectedHeader({ alg: "HS256" }).sign(this.officeKey!);
    return { ...config, token };
  }

  // 2) 원본(문서 서버가 가져감). 링크 토큰의 버전 원본만.
  async raw(token: string): Promise<{ bytes: Buffer; mime: string }> {
    this.require();
    const claims = await this.verifyLink(token, "raw");
    const version = await this.db.asSystem((query) => selectOneJson(query, "select storage_path, original_name from public.file_versions where id = $1 and file_id = $2", [claims.v, claims.f]));
    if (!version?.storage_path) throw new NotFoundException("원본이 없습니다.");
    const bytes = await this.store.get(`workspace-files/${version.storage_path}`);
    if (!bytes) throw new NotFoundException("원본이 없습니다.");
    return { bytes, mime: officeTypeOf(version.original_name ?? "")?.mime ?? "application/octet-stream" };
  }

  // 3) 저장 콜백. status 2 = 모두 닫고 저장, 6 = 편집 중 강제(자동) 저장, 4 = 바뀐 것 없이 닫힘. 나머지는 무시.
  async callback(token: string, authorization: string | undefined, body: Record<string, unknown>): Promise<void> {
    const settings = this.require();
    const claims = await this.verifyLink(token, "cb");
    // 문서 서버의 서명 확인: 본문 token(권장) 또는 Authorization 헤더({payload: 본문}).
    const signed = typeof body.token === "string" ? body.token : authorization?.replace(/^Bearer\s+/i, "");
    if (!signed) throw new Error("문서 서버 서명이 없습니다.");
    const { payload } = await jwtVerify(signed, this.officeKey!, { algorithms: ["HS256"] });
    const data = (typeof body.token === "string" ? payload : payload.payload) as { status?: number; url?: string; key?: string } | undefined;
    if (!data) throw new Error("문서 서버 서명 내용이 없습니다.");

    if (data.status === 4) {
      if (this.sessions.get(claims.f)?.key === data.key) this.sessions.delete(claims.f);
      return;
    }
    if ((data.status !== 2 && data.status !== 6) || typeof data.url !== "string") return;

    // 문서 서버가 준 주소는 문서 서버 안쪽 주소일 수 있고, 아무 주소로나 요청하면 안 되므로 경로만 빌려 우리가 아는 문서 서버로.
    // 문서 서버는 자기 공개 주소를 "<공개 주소>/onlyoffice"로 알기 때문에(중계의 가상 경로) 그 접두어를 떼고 요청한다.
    const given = new URL(data.url);
    const path = given.pathname.startsWith(`${PREFIX}/`) ? given.pathname.slice(PREFIX.length) : given.pathname;
    const response = await this.fetchImpl(new URL(path + given.search, settings.url));
    if (!response.ok) throw new Error(`편집한 문서를 받지 못했습니다(HTTP ${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());

    const saved = await this.db.asUser(claims.u, async (query) => {
      const file = await selectOneJson(query, "select f.id, f.name, f.project_id, f.folder_id, v.id as current_id from public.files f left join public.file_versions v on v.file_id = f.id and v.current where f.id = $1", [claims.f]);
      if (!file) throw new Error("파일이 없거나 볼 권한이 없습니다.");
      return file;
    });
    const type = officeTypeOf(saved.name);
    const searchText = await extractOfficeText(bytes);
    const result = await saveWorkspaceVersion(this.db, this.store, claims.u, saved.project_id,
      { buffer: bytes, size: bytes.length, mimetype: type?.mime ?? "application/octet-stream", originalname: saved.name, displayName: saved.name },
      {
        fileId: claims.f, baseVersionId: saved.current_id ?? null, folderId: saved.folder_id ?? null,
        note: data.status === 6 ? "오피스 편집 자동 저장" : "오피스 편집 저장", tags: null,
        searchText: searchText ?? "", searchStatus: searchText === null ? "failed" : "ready",
      });
    if (data.status === 2) this.sessions.delete(claims.f);
    else if (data.key) this.sessions.set(claims.f, { key: data.key, versionId: result.versionId });
    this.logger.log(`오피스 편집 저장: file=${claims.f} version=${result.versionId} status=${data.status}`);
  }
}

// 검색·버전 비교용 글자(화면 업로드 때와 같은 officeparser). 읽지 못하면 null.
async function extractOfficeText(bytes: Buffer): Promise<string | null> {
  try {
    const { parseOffice } = await import("officeparser");
    const document = await parseOffice(bytes, { includeRawContent: false } as never);
    const text = (await (document as unknown as { to(format: "text"): Promise<{ value: string }> }).to("text")).value;
    return text.replace(/\0/g, "");
  } catch {
    return null;
  }
}

@Controller()
export class OnlyofficeController {
  private readonly logger = new Logger("OnlyOffice");

  constructor(private readonly office: OnlyofficeService) {}

  @Get("onlyoffice/status")
  @UseGuards(AuthGuard)
  status() {
    return { enabled: this.office.enabled };
  }

  @Get("workspace/files/:fileId/onlyoffice")
  @UseGuards(AuthGuard)
  config(@UserId() userId: string, @Param("fileId", ParseIntPipe) fileId: number) {
    return this.office.editorConfig(userId, fileId);
  }

  // 아래 둘은 브라우저가 아니라 문서 서버가 부른다(로그인 토큰 없음) — 편집기 설정에 넣어 준 링크 토큰으로 확인.
  @Get("onlyoffice/raw")
  async raw(@QueryParam("token") token: string, @Res() res: Response) {
    try {
      const file = await this.office.raw(String(token ?? ""));
      res.setHeader("Content-Type", file.mime);
      res.setHeader("Cache-Control", "no-store");
      res.send(file.bytes);
    } catch {
      res.status(403).end();
    }
  }

  // OnlyOffice는 응답이 정확히 200 + {"error":0}이어야 저장 성공으로 본다.
  @Post("onlyoffice/callback")
  @HttpCode(200)
  async callback(@QueryParam("token") token: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    try {
      await this.office.callback(String(token ?? ""), req.headers.authorization, body ?? {});
      return { error: 0 };
    } catch (error) {
      this.logger.warn(`저장 콜백 실패: ${error instanceof Error ? error.message : error}`);
      return { error: 1 };
    }
  }
}

// 편집기 화면: /onlyoffice/[9.4.0-<해시>/]web-apps/apps/<documenteditor|spreadsheeteditor|presentationeditor…>/main/index.html 등.
// 문서 서버는 버전 없는 주소를 버전이 붙은 주소로 넘긴다(302) — 실제로 화면이 오는 건 버전 주소다.
export const EDITOR_PAGE = /^\/onlyoffice\/(?:[\w.-]+\/)?web-apps\/apps\/[a-z]+\/main\/index[\w.-]*\.html$/;
// 상단 로고(#header-logo), 왼쪽 아래 정보 버튼(#left-btn-about, 외부 편집기 이름·버전이 나옴),
// 상단 오른쪽 편집 중인 사람 표시(#tlb-box-users·.btn-current-user·.slot-btn-user-name, 이니셜만 나옴 — 우리 창 상단에 프로필로 대신 보여 준다).
export const EDITOR_PAGE_STYLE = "<style>#header-logo,#left-btn-about,#tlb-box-users,.btn-current-user,.slot-btn-user-name{display:none!important}</style>";

// 문서 서버를 /onlyoffice/ 아래로 중계(HTTP + 공동편집 WebSocket). 문서 서버가 자기 주소를 "<공개 주소>/onlyoffice"로 알도록
// X-Forwarded-Host에 경로를 붙인다(OnlyOffice 공식 가상 경로 방식). 편집기 스크립트(api.js)는 화면의 서비스 워커가
// ngrok 경고 건너뛰기 헤더를 붙여 다른 출처에서 가져가므로 CORS를 허용한다.
export function registerOnlyofficeProxy(http: Express, server: Server, settings: OnlyofficeSettings | undefined) {
  if (!settings) return;
  const forwardedHost = (req: { headers: Record<string, string | string[] | undefined> }) =>
    `${String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "")}${PREFIX}`;
  const forwardedProto = (req: { headers: Record<string, string | string[] | undefined> }) =>
    String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0].trim();
  // 편집기 화면(HTML)은 따로 중계하며 외부 편집기 로고·정보 버튼을 숨기는 스타일을 끼운다. 무료판은 설정(customization.logo)을
  // 라이선스가 막아 반영하지 않기 때문. 브라우저 캐시의 옛 화면(304)이 쓰이지 않게 조건부 요청 헤더를 빼고 저장도 막는다.
  const pageProxy = createProxyMiddleware<Request, Response>({
    target: settings.url,
    changeOrigin: false,
    selfHandleResponse: true,
    pathRewrite: (path) => path.slice(PREFIX.length) || "/",
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader("X-Forwarded-Host", forwardedHost(req));
        proxyReq.setHeader("X-Forwarded-Proto", forwardedProto(req));
        proxyReq.removeHeader("if-none-match");
        proxyReq.removeHeader("if-modified-since");
      },
      proxyRes: responseInterceptor(async (body, proxyRes, _req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.removeHeader("etag");
        res.removeHeader("last-modified");
        if (!String(proxyRes.headers["content-type"] ?? "").includes("text/html")) return body;
        return body.toString("utf8").replace("</head>", `${EDITOR_PAGE_STYLE}</head>`);
      }),
      error: (_error, _req, res) => {
        if ("writeHead" in res && !res.headersSent) { res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" }); res.end("오피스 문서 서버에 연결하지 못했습니다."); }
        else if ("destroy" in res) res.destroy();
      },
    },
  });
  const proxy = createProxyMiddleware<Request, Response>({
    target: settings.url,
    changeOrigin: false,
    ws: false, // 업그레이드는 아래에서 /onlyoffice 경로만 직접 넘긴다(/realtime과 섞이지 않게)
    pathFilter: (path) => path === PREFIX || path.startsWith(`${PREFIX}/`),
    pathRewrite: (path) => path.slice(PREFIX.length) || "/",
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader("X-Forwarded-Host", forwardedHost(req));
        proxyReq.setHeader("X-Forwarded-Proto", forwardedProto(req));
      },
      proxyReqWs: (proxyReq, req) => {
        proxyReq.setHeader("X-Forwarded-Host", forwardedHost(req));
        proxyReq.setHeader("X-Forwarded-Proto", forwardedProto(req));
      },
      proxyRes: (proxyRes, req) => {
        if (req.method === "GET") proxyRes.headers["access-control-allow-origin"] = "*";
      },
      error: (_error, _req, res) => {
        if ("writeHead" in res && !res.headersSent) { res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" }); res.end("오피스 문서 서버에 연결하지 못했습니다."); }
        else if ("destroy" in res) res.destroy();
      },
    },
  });
  http.use((req, res, next) => {
    if (req.path !== PREFIX && !req.path.startsWith(`${PREFIX}/`)) return next();
    // 서비스 워커가 보내는 사전 확인(헤더를 붙인 다른 출처 요청).
    if (req.method === "OPTIONS" && req.headers["access-control-request-method"]) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET");
      res.setHeader("Access-Control-Allow-Headers", "ngrok-skip-browser-warning, range");
      res.status(204).end();
      return;
    }
    if (req.method === "GET" && EDITOR_PAGE.test(req.path)) return pageProxy(req, res, next);
    return proxy(req, res, next);
  });
  server.on("upgrade", (req, socket: Duplex, head) => {
    const path = new URL(req.url ?? "", "http://localhost").pathname;
    if (path === PREFIX || path.startsWith(`${PREFIX}/`)) proxy.upgrade(req as Request, socket as never, head);
  });
}
