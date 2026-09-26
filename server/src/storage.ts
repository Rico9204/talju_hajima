import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Query as QueryParam,
  Res, UploadedFile, UseGuards, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsString, MaxLength } from "class-validator";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Express, Request, Response } from "express";

// multer가 넘겨주는 업로드 파일 중 여기서 쓰는 칸(메모리 저장).
type UploadFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };
import { AuthGuard, UserId } from "./auth.js";
import { Db, scalarJson, selectJson, selectOneJson, type Query } from "./db.js";

// ── 파일 저장소 ──
// 실제 바이트는 FileStore(지금은 서버 디스크)에, 목록(경로·크기·형식)은 storage.objects 표에 둔다.
// storage.objects 에 대한 권한 규칙과 DB 함수(업로드 등록 등)는 Supabase Storage 때 그대로 적용된다.
// 공개 파일 주소는 Supabase와 같은 모양(/storage/v1/object/public/<버킷>/<경로>)이라 DB의 주소 검사와 데이터 이전이 그대로 맞는다.
export abstract class FileStore {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract get(key: string): Promise<Buffer | null>;
  abstract remove(key: string): Promise<void>;
}

// 경로 조각은 영문·숫자·._- 만(상위 폴더 탈출·이상한 문자 차단). 버킷 이름도 같은 규칙.
const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
export function isSafeObjectName(name: string): boolean {
  const parts = name.split("/");
  return parts.length > 0 && parts.length <= 8 && parts.every((p) => SAFE_SEGMENT.test(p) && p !== "." && p !== "..");
}

// ponytail: 서버 한 대의 디스크. 여러 대로 늘리거나 디스크가 부족하면 S3 호환 저장소 구현으로 바꾼다.
export class DiskFileStore extends FileStore {
  private readonly root: string;

  constructor(root: string) {
    super();
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    const [bucket, ...rest] = key.split("/");
    if (!SAFE_SEGMENT.test(bucket) || !isSafeObjectName(rest.join("/"))) throw new BadRequestException("잘못된 파일 경로입니다.");
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new BadRequestException("잘못된 파일 경로입니다.");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: "wx" }); // 이미 있는 파일은 덮어쓰지 않는다(경로는 항상 새로 만든다)
  }

  async get(key: string): Promise<Buffer | null> {
    return readFile(this.pathFor(key)).catch(() => null);
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

// 비공개 파일(관리자 증명서)을 잠깐 열어 볼 수 있는 서명 주소. 로그인 토큰 서명 키에서 따로 파생한 키를 쓴다.
export class StorageUrls {
  private readonly key: Buffer;

  constructor(readonly publicBaseUrl: string, jwtSecret: string) {
    this.key = createHash("sha256").update(`${jwtSecret}:storage-url`).digest();
  }

  publicUrl(bucket: string, name: string): string {
    return `${this.publicBaseUrl}/storage/v1/object/public/${bucket}/${name}`;
  }

  private mac(bucket: string, name: string, expires: number): Buffer {
    return createHmac("sha256", this.key).update(`${bucket}\n${name}\n${expires}`).digest();
  }

  signedUrl(bucket: string, name: string, seconds: number): string {
    const expires = Math.floor(Date.now() / 1000) + seconds;
    const token = `${expires}.${this.mac(bucket, name, expires).toString("base64url")}`;
    return `${this.publicBaseUrl}/storage/v1/object/sign/${bucket}/${name}?token=${token}`;
  }

  verify(bucket: string, name: string, token: string): boolean {
    const [expiresText, signature] = token.split(".");
    const expires = Number(expiresText);
    if (!Number.isInteger(expires) || expires < Date.now() / 1000 || !signature) return false;
    const expected = this.mac(bucket, name, expires);
    const given = Buffer.from(signature, "base64url");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}

// 브라우저에서 바로 열어도 안전한 형식. 그 밖(HTML·SVG 등)은 내려받기로만 준다 — 이 서버 주소에서 스크립트가 실행되지 않게.
const INLINE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "application/pdf"];

function sendFile(res: Response, bytes: Buffer, mime: string, filename: string, cacheSeconds: number) {
  const inline = INLINE_TYPES.includes(mime);
  res.setHeader("Content-Type", inline ? mime : "application/octet-stream");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (mime !== "application/pdf") res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", cacheSeconds > 0 ? `private, max-age=${cacheSeconds}` : "no-store");
  res.send(bytes);
}

const lastSegment = (name: string) => name.split("/").pop() ?? "file";

// 공개 파일·서명 주소는 로그인 없이 열린다(<img src>로 쓰이므로). Nest 라우터 밖, /api 앞머리 없이 붙인다.
export function registerFileRoutes(http: Express, deps: { db: Db; store: FileStore; urls: StorageUrls }) {
  const nameOf = (req: Request) => {
    const raw = (req.params as Record<string, string | string[]>).name;
    return Array.isArray(raw) ? raw.join("/") : raw;
  };
  http.get("/storage/v1/object/public/:bucket/*name", async (req, res) => {
    const bucket = String(req.params.bucket);
    const name = nameOf(req);
    if (!SAFE_SEGMENT.test(bucket) || !isSafeObjectName(name)) return void res.status(404).end();
    const object = await deps.db.asSystem((query) => selectOneJson(query, `
      select o.metadata from storage.objects o join storage.buckets b on b.id = o.bucket_id
      where o.bucket_id = $1 and o.name = $2 and b.public`, [bucket, name])).catch(() => null);
    const bytes = object ? await deps.store.get(`${bucket}/${name}`) : null;
    if (!object || !bytes) return void res.status(404).end();
    sendFile(res, bytes, object.metadata?.mimetype ?? "application/octet-stream", lastSegment(name), 3600);
  });
  http.get("/storage/v1/object/sign/:bucket/*name", async (req, res) => {
    const bucket = String(req.params.bucket);
    const name = nameOf(req);
    if (!SAFE_SEGMENT.test(bucket) || !isSafeObjectName(name) || !deps.urls.verify(bucket, name, String(req.query.token ?? ""))) {
      return void res.status(403).end();
    }
    const object = await deps.db.asSystem((query) => selectOneJson(query, "select metadata from storage.objects where bucket_id = $1 and name = $2", [bucket, name])).catch(() => null);
    const bytes = object ? await deps.store.get(`${bucket}/${name}`) : null;
    if (!object || !bytes) return void res.status(404).end();
    sendFile(res, bytes, object.metadata?.mimetype ?? "application/octet-stream", lastSegment(name), 0);
  });
}

// ── 업로드 규칙(화면 쪽 검사를 서버로 옮김) ──
const PROFILE_IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" };

function hasImageSignature(bytes: Buffer, mime: string): boolean {
  const head = bytes.subarray(0, 16);
  const text = (start: number, end: number) => head.subarray(start, end).toString("latin1");
  if (mime === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mime === "image/png") return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
  if (mime === "image/gif") return text(0, 4) === "GIF8";
  if (mime === "image/avif") return text(4, 8) === "ftyp" && ["avif", "avis", "mif1"].includes(text(8, 12));
  return false;
}

// 워크스페이스 파일 종류(화면의 workspaceFileType과 같은 규칙).
export function workspaceFileType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "heic", "tif", "tiff", "ico"].includes(ext)) return "img";
  if (["ppt", "pptx", "odp"].includes(ext)) return "ppt";
  if (["xls", "xlsx", "xlsm", "csv", "ods"].includes(ext)) return "xls";
  if (["zip", "7z", "rar", "gz"].includes(ext)) return "zip";
  return ext === "pdf" ? "pdf" : "doc";
}

// 워크스페이스 원본 경로: v2/<프로젝트 id의 16진수>/<올린 사람>/<무작위 id> (DB 함수가 이 모양을 읽어 프로젝트·주인을 확인한다).
export function workspaceStoragePath(projectId: string, userId: string, objectId: string): string {
  return `v2/${Buffer.from(projectId, "utf8").toString("hex")}/${userId}/${objectId}`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / 1024 ** i).toFixed(1))} ${["B", "KB", "MB", "GB"][i]}`;
}

// multer는 파일 이름을 latin1로 읽는다 — 브라우저가 보낸 UTF-8 이름(한글 등)을 되살린다.
const originalName = (file: UploadFile) => Buffer.from(file.originalname, "latin1").toString("utf8");

const UPLOAD_LIMIT = { limits: { fileSize: 52_428_800, files: 1 } }; // 버킷별 한도는 storage.buckets로 다시 검사

class DocumentPathDto {
  @IsString() @MaxLength(300) path!: string;
}

@Controller()
@UseGuards(AuthGuard)
export class StorageController {
  constructor(private readonly db: Db, private readonly store: FileStore, private readonly urls: StorageUrls) {}

  // 디스크에 먼저 쓰고, 같은 사용자 트랜잭션 안에서 목록(storage.objects)에 올린 뒤 after(등록 함수 등)를 부른다.
  // 어느 단계든 실패하면 트랜잭션은 되돌려지고 디스크 파일도 지운다.
  private async storeObject<T>(userId: string, bucket: string, name: string, file: UploadFile, after: (query: Query) => Promise<T>): Promise<T> {
    if (!file?.buffer?.length) throw new BadRequestException("빈 파일은 올릴 수 없습니다.");
    const key = `${bucket}/${name}`;
    await this.store.put(key, file.buffer);
    try {
      return await this.db.asUser(userId, async (query) => {
        const rule = await selectOneJson(query, "select file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]);
        if (!rule) throw new BadRequestException("알 수 없는 저장 공간입니다.");
        if (rule.file_size_limit && file.size > rule.file_size_limit) throw new BadRequestException(`파일이 너무 큽니다(최대 ${formatFileSize(rule.file_size_limit)}).`);
        if (rule.allowed_mime_types && !rule.allowed_mime_types.includes(file.mimetype)) throw new BadRequestException("허용되지 않는 파일 형식입니다.");
        await query(
          "insert into storage.objects(bucket_id, name, owner, metadata) values ($1, $2, auth.uid(), jsonb_build_object('size', $3::bigint, 'mimetype', $4::text))",
          [bucket, name, file.size, file.mimetype || "application/octet-stream"]);
        return after(query);
      });
    } catch (error) {
      await this.store.remove(key).catch(() => {});
      throw error;
    }
  }

  // 프로필 사진·배너·배경. 주소를 돌려주면 화면이 PATCH me/profile 로 저장한다(예전과 같은 흐름).
  @Post("me/images/:kind")
  @UseInterceptors(FileInterceptor("file", UPLOAD_LIMIT))
  async uploadProfileImage(@UserId() userId: string, @Param("kind") kind: string, @UploadedFile() file: UploadFile) {
    const prefix = ({ avatar: "", banner: "banner-", background: "background-" } as Record<string, string>)[kind];
    if (prefix === undefined) throw new BadRequestException("kind는 avatar·banner·background 중 하나입니다.");
    const ext = PROFILE_IMAGE_EXT[file?.mimetype];
    if (!ext) throw new BadRequestException("프로필 이미지는 JPG, PNG, WebP, AVIF, GIF 형식만 사용할 수 있습니다.");
    if (!hasImageSignature(file.buffer, file.mimetype)) throw new BadRequestException("이미지 파일 형식을 확인할 수 없습니다.");
    const name = `${userId}/${prefix}${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    await this.storeObject(userId, "avatars", name, file, async () => undefined);
    return { url: this.urls.publicUrl("avatars", name) };
  }

  @Post("board/attachments")
  @UseInterceptors(FileInterceptor("file", UPLOAD_LIMIT))
  async uploadBoardAttachment(@UserId() userId: string, @UploadedFile() file: UploadFile) {
    if (!file) throw new BadRequestException("파일을 선택해 주세요.");
    const displayName = originalName(file);
    const rawExt = displayName.includes(".") ? displayName.split(".").pop() ?? "" : "";
    const ext = /^[a-z0-9]{1,10}$/i.test(rawExt) ? rawExt.toLowerCase() : "bin";
    const name = `${userId}/${randomUUID()}.${ext}`;
    await this.storeObject(userId, "board-attachments", name, file, async () => undefined);
    return {
      id: randomUUID(), name: displayName, size: formatFileSize(file.size), kind: file.mimetype.startsWith("image/") ? "image" : "file",
      url: this.urls.publicUrl("board-attachments", name), mimeType: file.mimetype,
    };
  }

  // 워크스페이스 업로드: 원본 저장 + 버전 등록(register_workspace_search_version)을 한 트랜잭션으로.
  // 여러 값은 multipart 필드로 온다: fileId·baseVersionId·folderId(빈 값=루트)·note·tags(JSON 배열)·searchText·searchStatus.
  @Post("projects/:projectId/files")
  @UseInterceptors(FileInterceptor("file", UPLOAD_LIMIT))
  uploadWorkspaceFile(@UserId() userId: string, @Param("projectId") projectId: string, @UploadedFile() file: UploadFile, @Body() body: Record<string, string>) {
    if (!file) throw new BadRequestException("파일을 선택해 주세요.");
    const intOrNull = (value: string | undefined, label: string) => {
      if (value === undefined || value === "" || value === "null") return null;
      if (!/^\d+$/.test(value)) throw new BadRequestException(`${label} 값이 올바르지 않습니다.`);
      return Number(value);
    };
    const fileId = intOrNull(body.fileId, "fileId");
    const baseVersionId = intOrNull(body.baseVersionId, "baseVersionId");
    const folderId = intOrNull(body.folderId, "folderId");
    const displayName = originalName(file);
    const type = workspaceFileType(displayName);
    let tags: string[] | null = null;
    if (body.tags !== undefined && body.tags !== "") {
      try { tags = JSON.parse(body.tags); } catch { throw new BadRequestException("tags는 JSON 배열이어야 합니다."); }
      if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) throw new BadRequestException("tags는 문자열 배열이어야 합니다.");
    }
    // 새 파일이거나 태그를 보냈을 때만 태그 규칙 검사(이미지는 태그 1개 이상, 최대 10개·각 30자).
    if (tags !== null || fileId === null) {
      const list = tags ?? [];
      if ((type === "img" || file.mimetype.startsWith("image/")) && !list.length) throw new BadRequestException("이미지에는 태그를 하나 이상 입력해 주세요.");
      if (list.length > 10 || list.some((t) => t.length > 30)) throw new BadRequestException("태그는 최대 10개, 각각 30자까지 입력할 수 있습니다.");
    }
    const name = workspaceStoragePath(projectId, userId, randomUUID());
    return this.storeObject(userId, "workspace-files", name, file, async (query) => {
      const result = await scalarJson<{ file_id: number; version_id: number; branched: boolean }>(query,
        "public.register_workspace_search_version($1, $2::bigint, $3::bigint, $4::bigint, $5, $6, $7, $8, $9::text[], $10, $11)",
        [projectId, fileId, baseVersionId, folderId, displayName, type, name, body.note ?? "", tags,
          (body.searchText ?? "").slice(0, 2_000_000), body.searchStatus || "unsupported"]);
      return { fileId: result.file_id, versionId: result.version_id, branched: result.branched };
    });
  }

  // 원본 내려받기: 그 버전이 보이고(권한 규칙), 원본 목록도 보이는(workspace_binary_read) 사람만.
  @Get("workspace/versions/:versionId/download")
  async downloadVersion(@UserId() userId: string, @Param("versionId", ParseIntPipe) versionId: number, @Res() res: Response) {
    const found = await this.db.asUser(userId, async (query) => {
      const version = await selectOneJson(query, "select storage_path, original_name, mime_type from public.file_versions where id = $1", [versionId]);
      if (!version) throw new BadRequestException("파일을 찾을 수 없습니다.");
      if (!version.storage_path) throw new BadRequestException("이전 기록에는 원본 파일이 없습니다. 새 버전을 업로드해 주세요.");
      const object = await selectOneJson(query, "select metadata from storage.objects where bucket_id = 'workspace-files' and name = $1", [version.storage_path]);
      if (!object) throw new ForbiddenException("원본을 내려받을 권한이 없습니다.");
      return { version, object };
    });
    const bytes = await this.store.get(`workspace-files/${found.version.storage_path}`);
    if (!bytes) throw new BadRequestException("원본 파일을 찾을 수 없습니다.");
    const mime = found.version.mime_type ?? found.object.metadata?.mimetype ?? "application/octet-stream";
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(found.version.original_name ?? lastSegment(found.version.storage_path))}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-File-Type", mime);
    res.send(bytes);
  }

  // 지운 파일의 원본 정리: 대기열의 원본 목록을 지우고(권한 규칙 workspace_deleted_binary_cleanup), 커밋 뒤 디스크에서 지운다.
  @Post("projects/:projectId/workspace-cleanup")
  @HttpCode(204)
  async cleanupWorkspace(@UserId() userId: string, @Param("projectId") projectId: string) {
    for (let round = 0; round < 50; round++) {
      const removed = await this.db.asUser(userId, async (query) => {
        const paths = (await selectJson(query, "select storage_path from public.workspace_delete_queue where project_id = $1 order by storage_path limit 100", [projectId]))
          .map((r) => r.storage_path);
        if (!paths.length) return null;
        const deleted = (await query<{ name: string }>(
          "delete from storage.objects where bucket_id = 'workspace-files' and name = any($1::text[]) returning name", [paths])).map((r) => r.name);
        await query("select public.finish_workspace_cleanup($1)", [projectId]);
        return { paths, deleted };
      });
      if (!removed) return;
      for (const name of removed.deleted) await this.store.remove(`workspace-files/${name}`).catch(() => {});
      if (removed.deleted.length === 0) throw new BadRequestException("일부 원본을 정리하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  // 관리자(교수·교원) 신청: 증명서 PDF 저장 + 신청서 작성(submit_admin_application)을 한 트랜잭션으로.
  @Post("me/admin-application")
  @UseInterceptors(FileInterceptor("file", UPLOAD_LIMIT))
  async submitAdminApplication(@UserId() userId: string, @UploadedFile() file: UploadFile, @Body() body: Record<string, string>) {
    const displayName = file ? originalName(file) : "";
    if (!file || !/\.pdf$/i.test(displayName) || file.mimetype !== "application/pdf" || file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new BadRequestException("PDF 파일만 제출할 수 있습니다.");
    }
    const name = `${userId}/${randomUUID()}.pdf`;
    await this.storeObject(userId, "admin-verification", name, file, (query) =>
      query("select public.submit_admin_application($1, $2, $3, $4, $5, $6, $7)",
        [body.org ?? "", body.jobTitle ?? "", body.contact ?? "", body.docType ?? "", name, displayName, body.consent === "true"]));
  }

  // 운영자만 열 수 있고(권한 규칙 admin_verification_select), 주소는 60초 뒤 만료된다.
  @Get("admin/applications/document-url")
  async documentUrl(@UserId() userId: string, @QueryParam("path") path = "") {
    if (!isSafeObjectName(path)) throw new BadRequestException("잘못된 경로입니다.");
    const visible = await this.db.asUser(userId, (query) =>
      selectOneJson(query, "select 1 as ok from storage.objects where bucket_id = 'admin-verification' and name = $1", [path]));
    if (!visible) throw new ForbiddenException("증명서를 볼 권한이 없습니다.");
    return { url: this.urls.signedUrl("admin-verification", path, 60) };
  }

  // 처리 끝난 증명서 원본 삭제: 목록에서 지우고(운영자 권한 규칙) 삭제 기록(mark_admin_document_deleted) 뒤 디스크에서 지운다.
  @Post("admin/applications/:id/document-cleanup")
  @HttpCode(204)
  async cleanupDocument(@UserId() userId: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: DocumentPathDto) {
    if (!isSafeObjectName(body.path)) throw new BadRequestException("잘못된 경로입니다.");
    await this.db.asUser(userId, async (query) => {
      await query("delete from storage.objects where bucket_id = 'admin-verification' and name = $1", [body.path]);
      await query("select public.mark_admin_document_deleted($1::uuid)", [id]);
    });
    await this.store.remove(`admin-verification/${body.path}`).catch(() => {});
  }
}
