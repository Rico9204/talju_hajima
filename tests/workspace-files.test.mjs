import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceFileType,versionTree,workspaceStoragePath,parseFileTags,validateFileTags } from '../src/lib/workspaceFiles.ts';
test('tags normalize duplicates and images require a nonempty tag list',()=> {
  assert.deepEqual(parseFileTags(' 사진, 디자인,사진, , '),['사진','디자인']);
  assert.throws(()=>validateFileTags([],true),/하나 이상/);
  assert.doesNotThrow(()=>validateFileTags([],false));
  assert.throws(()=>validateFileTags(['가'.repeat(31)],false),/30자/);
});
test('Unicode project IDs produce ASCII storage keys without changing the original ID',()=> {
  for (const project of ['테스트-mtyks5m2','팀 프로젝트😀','ascii-project']) {
    const path=workspaceStoragePath(project,'user-id','object-id');
    assert.match(path,/^[a-zA-Z0-9/-]+$/);
    assert.equal(Buffer.from(path.split('/')[1],'hex').toString('utf8'),project);
  }
});
test('binary and text extensions have the correct badges',()=> {
  for (const [name,type] of [['자료.PPTX','ppt'],['사진.jpeg','img'],['문서.pdf','pdf'],['표.xlsx','xls'],['기록.txt','doc'],['압축.zip','zip']]) assert.equal(workspaceFileType(name),type);
});
test('tree preserves siblings, older branches, legacy roots and orphan history',()=> {
  const v=(id,parentVersionId)=>({id,parentVersionId});
  const result=versionTree([v(4,1),v(3,2),v(2,1),v(1,null),v(5,999)]);
  assert.deepEqual(result.map(({version,depth})=>[version.id,depth]),[[1,0],[2,1],[3,2],[4,1],[5,0]]);
});
test('malformed cycles never hide history or loop forever',()=> {
  assert.equal(versionTree([{id:1,parentVersionId:2},{id:2,parentVersionId:1}]).length,2);
});
test('파일 정렬: 최신순은 마지막 버전 시각, 이름순은 한국어·숫자 순서, 크기순은 바이트(옛 기록은 표시 문자열)', async () => {
  const { sortWorkspaceFiles } = await import('../src/lib/workspaceFiles.ts');
  const file = (id, name, uploadedAt, byteSize, size = '') => ({ id, name, size, date: '2026. 09. 01', tags: [], versions: [{ id: id * 10, current: true, uploadedAt, byteSize, date: '2026. 09. 01' }] });
  const old = file(1, '보고서10.pdf', '2026-09-01T00:00:00Z', 5000);
  const updated = { ...file(2, '보고서2.pdf', '2026-09-01T01:00:00Z', null, '1.5 MB'), versions: [{ id: 20, current: false, uploadedAt: '2026-09-01T01:00:00Z', byteSize: 10, date: '' }, { id: 99, current: true, uploadedAt: '2026-09-20T00:00:00Z', byteSize: null, date: '' }] };
  const legacy = { id: 3, name: 'Abc.txt', size: '3 KB', date: '2026. 09. 10', tags: [], versions: [] };
  const ids = (list) => list.map((f) => f.id);
  assert.deepEqual(ids(sortWorkspaceFiles([old, updated, legacy], 'latest')), [2, 3, 1]); // 새 버전을 올린 파일이 위로
  assert.deepEqual(ids(sortWorkspaceFiles([old, updated, legacy], 'oldest')), [1, 3, 2]);
  assert.deepEqual(ids(sortWorkspaceFiles([old, updated, legacy], 'nameAsc')), [2, 1, 3]); // 보고서2 < 보고서10, 한국어 기준이라 한글 뒤에 영문
  assert.deepEqual(ids(sortWorkspaceFiles([old, updated, legacy], 'nameDesc')), [3, 1, 2]);
  assert.deepEqual(ids(sortWorkspaceFiles([old, updated, legacy], 'sizeDesc')), [2, 1, 3]); // 1.5 MB > 5000 B > 3 KB(3072 B)
  assert.deepEqual(ids(sortWorkspaceFiles([old, updated, legacy], 'sizeAsc')), [3, 1, 2]);
});
