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
