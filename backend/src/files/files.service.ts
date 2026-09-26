import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProjectFile } from './project-file.entity.js';
import { FileVersion } from './file-version.entity.js';
import { FileComment } from './file-comment.entity.js';
import { FileVersionPin } from './file-version-pin.entity.js';
import { ProjectsService } from '../projects/projects.service.js';
import { FileEntryDto } from './dto/sync-files.dto.js';

// 버전을 새로 만들지 말지 결정할 때만 쓰는 비교용 정규화 — 실제로 저장되는 content는 안
// 건드림. CRLF/LF 차이나 파일 끝 개행 유무처럼 화면 diff에서도 "차이 없음"으로 취급하는
// 부분까지 걸러야, 그런 무의미한 차이만으로 새 버전(또는 새 분기)이 계속 쌓이지 않는다.
// (talju_hajima-main의 Workspace.tsx diff 화면에 있는 splitLines와 같은 기준.)
function normalizeForComparison(content: string): string {
  const unified = content.replace(/\r\n|\r/g, '\n');
  return unified.endsWith('\n') ? unified.slice(0, -1) : unified;
}

export interface SyncResult {
  created: string[];
  updated: string[];
  branched: { path: string; versionId: string }[];
  alreadyBranched: { path: string; versionId: string }[];
  unchanged: string[];
}

export interface FileBranches {
  file: ProjectFile;
  branches: FileVersion[];
}

export interface VersionCalendarEntry {
  id: string;
  fileId: string;
  path: string;
  authorId: string;
  createdAt: Date;
}

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(ProjectFile)
    private readonly filesRepository: Repository<ProjectFile>,
    @InjectRepository(FileVersion)
    private readonly versionsRepository: Repository<FileVersion>,
    @InjectRepository(FileComment)
    private readonly commentsRepository: Repository<FileComment>,
    @InjectRepository(FileVersionPin)
    private readonly pinsRepository: Repository<FileVersionPin>,
    private readonly projectsService: ProjectsService,
  ) {}

  async listFiles(projectId: string, userId: string): Promise<ProjectFile[]> {
    await this.projectsService.assertMembership(projectId, userId);
    return this.filesRepository.find({ where: { projectId }, order: { path: 'ASC' } });
  }

  async getFile(projectId: string, fileId: string, userId: string): Promise<ProjectFile> {
    await this.projectsService.assertMembership(projectId, userId);
    const file = await this.filesRepository.findOne({ where: { id: fileId, projectId } });
    if (!file) throw new NotFoundException('파일을 찾을 수 없습니다.');
    return file;
  }

  async listVersions(projectId: string, fileId: string, userId: string): Promise<FileVersion[]> {
    await this.getFile(projectId, fileId, userId);
    return this.versionsRepository.find({ where: { fileId }, order: { createdAt: 'ASC' } });
  }

  async syncFiles(projectId: string, userId: string, files: FileEntryDto[]): Promise<SyncResult> {
    await this.projectsService.assertMembership(projectId, userId);

    const result: SyncResult = { created: [], updated: [], branched: [], alreadyBranched: [], unchanged: [] };

    for (const entry of files) {
      const existing = await this.filesRepository.findOne({ where: { projectId, path: entry.path } });

      if (!existing) {
        const file = await this.filesRepository.save(
          this.filesRepository.create({
            projectId,
            path: entry.path,
            content: entry.content,
            currentVersionId: null,
            lastEditorId: userId,
          }),
        );
        const version = await this.versionsRepository.save(
          this.versionsRepository.create({
            fileId: file.id,
            parentVersionId: null,
            authorId: userId,
            content: entry.content,
            note: entry.note ?? null,
          }),
        );
        file.currentVersionId = version.id;
        await this.filesRepository.save(file);
        result.created.push(entry.path);
        continue;
      }

      if (entry.pinId) {
        await this.syncAgainstPin(existing, entry, userId, result);
        continue;
      }

      if (normalizeForComparison(existing.content) === normalizeForComparison(entry.content)) {
        result.unchanged.push(entry.path);
        continue;
      }

      if (entry.baseVersionId && entry.baseVersionId === existing.currentVersionId) {
        const version = await this.versionsRepository.save(
          this.versionsRepository.create({
            fileId: existing.id,
            parentVersionId: existing.currentVersionId,
            authorId: userId,
            content: entry.content,
            note: entry.note ?? null,
          }),
        );
        existing.currentVersionId = version.id;
        existing.content = entry.content;
        existing.lastEditorId = userId;
        await this.filesRepository.save(existing);
        result.updated.push(entry.path);
        continue;
      }

      // baseVersionId가 없거나 이미 지나간(stale) 버전을 기준으로 한 수정 -> 분기 생성
      const openBranches = await this.listOpenBranches(existing.id);
      const duplicate = openBranches.find((b) => normalizeForComparison(b.content) === normalizeForComparison(entry.content));
      if (duplicate) {
        result.alreadyBranched.push({ path: entry.path, versionId: duplicate.id });
        continue;
      }

      const branch = await this.versionsRepository.save(
        this.versionsRepository.create({
          fileId: existing.id,
          parentVersionId: entry.baseVersionId ?? existing.currentVersionId,
          authorId: userId,
          content: entry.content,
          note: entry.note ?? null,
        }),
      );
      result.branched.push({ path: entry.path, versionId: branch.id });
    }

    return result;
  }

  // 핀을 기준으로 한 동기화: 파일의 currentVersionId 대신 핀의 현재 위치와 비교한다.
  // 빨리감기에 성공하면 "파일"이 아니라 이 핀이 새 버전으로 이동한다 — 그래서 같은 핀을 보고
  // 작업하는 사람들끼리는 서로 이어붙고, 파일의 전체 "현재 버전"은 건드리지 않는다.
  private async syncAgainstPin(
    file: ProjectFile,
    entry: FileEntryDto,
    userId: string,
    result: SyncResult,
  ): Promise<void> {
    const pin = await this.pinsRepository.findOne({ where: { id: entry.pinId, fileId: file.id } });
    if (!pin) throw new NotFoundException('핀을 찾을 수 없습니다.');

    const pinVersion = await this.versionsRepository.findOne({ where: { id: pin.versionId } });
    if (pinVersion && normalizeForComparison(pinVersion.content) === normalizeForComparison(entry.content)) {
      result.unchanged.push(entry.path);
      return;
    }

    if (entry.baseVersionId && entry.baseVersionId === pin.versionId) {
      const version = await this.versionsRepository.save(
        this.versionsRepository.create({
          fileId: file.id,
          parentVersionId: pin.versionId,
          authorId: userId,
          content: entry.content,
          note: entry.note ?? null,
        }),
      );
      pin.versionId = version.id;
      await this.pinsRepository.save(pin);
      result.updated.push(entry.path);
      return;
    }

    // 핀의 지금 위치보다 낡은 기준으로 올린 경우 -> 그 기준 위에 별도 분기 생성 (핀은 안 움직임)
    const branch = await this.versionsRepository.save(
      this.versionsRepository.create({
        fileId: file.id,
        parentVersionId: entry.baseVersionId ?? pin.versionId,
        authorId: userId,
        content: entry.content,
        note: entry.note ?? null,
      }),
    );
    result.branched.push({ path: entry.path, versionId: branch.id });
  }

  async listPins(projectId: string, fileId: string, userId: string): Promise<FileVersionPin[]> {
    await this.getFile(projectId, fileId, userId);
    return this.pinsRepository.find({ where: { fileId }, order: { createdAt: 'ASC' } });
  }

  async createPin(
    projectId: string,
    fileId: string,
    versionId: string,
    label: string | undefined,
    userId: string,
  ): Promise<FileVersionPin> {
    await this.getFile(projectId, fileId, userId);
    const version = await this.versionsRepository.findOne({ where: { id: versionId, fileId } });
    if (!version) throw new NotFoundException('버전을 찾을 수 없습니다.');

    const count = await this.pinsRepository.count({ where: { fileId } });
    return this.pinsRepository.save(
      this.pinsRepository.create({ fileId, versionId, label: label?.trim() || `핀 ${count + 1}` }),
    );
  }

  async deletePin(projectId: string, fileId: string, pinId: string, userId: string): Promise<void> {
    await this.getFile(projectId, fileId, userId);
    await this.pinsRepository.delete({ id: pinId, fileId });
  }

  // 해소되지 않은 분기 = 다른 버전의 parent도 아니고 파일의 currentVersionId도 아닌 버전
  async listOpenBranches(fileId: string): Promise<FileVersion[]> {
    const [versions, file] = await Promise.all([
      this.versionsRepository.find({ where: { fileId } }),
      this.filesRepository.findOne({ where: { id: fileId } }),
    ]);
    const parentIds = new Set(versions.map((v) => v.parentVersionId).filter((id): id is string => !!id));
    return versions.filter((v) => v.id !== file?.currentVersionId && !parentIds.has(v.id));
  }

  async listBranchesForProject(projectId: string, userId: string): Promise<FileBranches[]> {
    await this.projectsService.assertMembership(projectId, userId);
    const files = await this.filesRepository.find({ where: { projectId } });
    const results: FileBranches[] = [];
    for (const file of files) {
      const branches = await this.listOpenBranches(file.id);
      if (branches.length > 0) results.push({ file, branches });
    }
    return results;
  }

  // 워크스페이스 "버전 이력" 달력용 — 프로젝트 전체 파일의 버전을 날짜별로 훑어보기 위한 가벼운
  // 목록(content 제외, 파일 경로만 같이 내려줌). fileId를 주면 그 파일만 걸러서 반환한다.
  async listVersionsForCalendar(projectId: string, userId: string, fileId?: string): Promise<VersionCalendarEntry[]> {
    await this.projectsService.assertMembership(projectId, userId);
    const qb = this.versionsRepository
      .createQueryBuilder('v')
      .innerJoin(ProjectFile, 'f', 'f.id = v.file_id')
      .where('f.project_id = :projectId', { projectId })
      .select(['v.id AS id', 'v.file_id AS "fileId"', 'f.path AS path', 'v.author_id AS "authorId"', 'v.created_at AS "createdAt"'])
      .orderBy('v.created_at', 'ASC');
    if (fileId) qb.andWhere('v.file_id = :fileId', { fileId });
    return qb.getRawMany<VersionCalendarEntry>();
  }

  // 파일 목록 화면에서 "분기 N"처럼 "핀 N" 배지를 보여주기 위한 파일별 핀 개수 — 목록 화면에서
  // 파일마다 GET .../pins를 따로 부르지 않아도 되게 한 번에 내려준다(listBranchesForProject와
  // 같은 목적).
  async listPinCountsForProject(projectId: string, userId: string): Promise<{ fileId: string; count: number }[]> {
    await this.projectsService.assertMembership(projectId, userId);
    const files = await this.filesRepository.find({ where: { projectId }, select: { id: true } });
    if (files.length === 0) return [];
    const pins = await this.pinsRepository.find({ where: { fileId: In(files.map((f) => f.id)) } });
    const counts = new Map<string, number>();
    for (const p of pins) counts.set(p.fileId, (counts.get(p.fileId) ?? 0) + 1);
    return [...counts.entries()].map(([fileId, count]) => ({ fileId, count }));
  }

  async promoteVersion(projectId: string, fileId: string, versionId: string, userId: string): Promise<ProjectFile> {
    await this.projectsService.assertMembership(projectId, userId);
    const file = await this.filesRepository.findOne({ where: { id: fileId, projectId } });
    if (!file) throw new NotFoundException('파일을 찾을 수 없습니다.');
    const version = await this.versionsRepository.findOne({ where: { id: versionId, fileId } });
    if (!version) throw new NotFoundException('버전을 찾을 수 없습니다.');

    file.currentVersionId = version.id;
    file.content = version.content;
    file.lastEditorId = version.authorId;
    return this.filesRepository.save(file);
  }

  async setTag(projectId: string, fileId: string, tag: string, userId: string): Promise<ProjectFile> {
    await this.projectsService.assertMembership(projectId, userId);
    const file = await this.filesRepository.findOne({ where: { id: fileId, projectId } });
    if (!file) throw new NotFoundException('파일을 찾을 수 없습니다.');
    file.tag = tag.trim() || null;
    return this.filesRepository.save(file);
  }

  // "바로 수정"(실시간 공동편집) 세션에서 일정 시간 입력이 없을 때(또는 마지막 참여자가 나갈 때)
  // 지금까지의 병합된 내용을 새 버전으로 저장한다. 여러 명이 실시간으로 같은 문서를 고치는 동안은
  // 분기 개념이 없으므로(모두가 항상 최신 병합 상태를 보고 있음) 매번 현재 버전 위로 바로 이어붙인다.
  async saveCollabSnapshot(fileId: string, userId: string, content: string): Promise<ProjectFile | null> {
    const file = await this.filesRepository.findOne({ where: { id: fileId } });
    if (!file) return null;
    if (normalizeForComparison(file.content) === normalizeForComparison(content)) return null;

    const version = await this.versionsRepository.save(
      this.versionsRepository.create({
        fileId: file.id,
        parentVersionId: file.currentVersionId,
        authorId: userId,
        content,
        note: null,
      }),
    );
    file.currentVersionId = version.id;
    file.content = content;
    file.lastEditorId = userId;
    return this.filesRepository.save(file);
  }

  // "바로 수정"을 핀 기준으로 시작할 때 시드 내용 조회 — 그 핀이 지금 가리키는 버전의 내용을 준다.
  async getPinContent(fileId: string, pinId: string): Promise<{ pin: FileVersionPin; content: string } | null> {
    const pin = await this.pinsRepository.findOne({ where: { id: pinId, fileId } });
    if (!pin) return null;
    const version = await this.versionsRepository.findOne({ where: { id: pin.versionId } });
    if (!version) return null;
    return { pin, content: version.content };
  }

  // 핀 기준 "바로 수정" 세션의 스냅샷 저장 — saveCollabSnapshot과 같은 타이밍/조건이지만, 파일의
  // 메인 currentVersionId가 아니라 그 핀만 앞으로 이어붙인다(핀을 보고 작업하던 사람들끼리만
  // 서로 이어지고, 파일의 "현재 버전"은 건드리지 않음 — syncAgainstPin과 동일한 규칙).
  async saveCollabSnapshotForPin(pinId: string, userId: string, content: string): Promise<void> {
    const pin = await this.pinsRepository.findOne({ where: { id: pinId } });
    if (!pin) return;
    const currentVersion = await this.versionsRepository.findOne({ where: { id: pin.versionId } });
    if (currentVersion && normalizeForComparison(currentVersion.content) === normalizeForComparison(content)) return;

    const version = await this.versionsRepository.save(
      this.versionsRepository.create({
        fileId: pin.fileId,
        parentVersionId: pin.versionId,
        authorId: userId,
        content,
        note: null,
      }),
    );
    pin.versionId = version.id;
    await this.pinsRepository.save(pin);
  }

  async listComments(projectId: string, fileId: string, userId: string): Promise<FileComment[]> {
    await this.getFile(projectId, fileId, userId);
    return this.commentsRepository.find({ where: { fileId }, order: { createdAt: 'ASC' } });
  }

  async addComment(
    projectId: string,
    fileId: string,
    userId: string,
    content: string,
    versionId?: string,
  ): Promise<FileComment> {
    await this.getFile(projectId, fileId, userId);
    if (versionId) {
      const version = await this.versionsRepository.findOne({ where: { id: versionId, fileId } });
      if (!version) throw new NotFoundException('버전을 찾을 수 없습니다.');
    }
    return this.commentsRepository.save(
      this.commentsRepository.create({ fileId, authorId: userId, content, versionId: versionId ?? null }),
    );
  }
}
