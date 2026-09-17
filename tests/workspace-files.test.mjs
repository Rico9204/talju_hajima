import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceFileType,versionTree } from '../src/lib/workspaceFiles.ts';
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
