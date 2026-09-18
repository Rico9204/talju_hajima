import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRanges, contentSnippet, matchesWorkspaceSearch, currentFileText } from '../src/lib/workspaceSearch.ts';
const file={name:'보고서.pdf',tags:['자료'],uploader:'팀원',comments:[{text:'확인 완료',author:'동료'}],versions:[{id:1,current:true,searchText:'한글 본문 기획안',note:'초안'},{id:2,current:false,searchText:'미승인 분기',note:''}]};
test('project file search uses current version and metadata',()=>{
 assert.equal(matchesWorkspaceSearch(file,'기획안'),true);
 assert.equal(matchesWorkspaceSearch(file,'미승인'),false);
 assert.equal(matchesWorkspaceSearch(file,'확인 완료'),true);
 assert.equal(matchesWorkspaceSearch(file,'자료'),true);
 const promoted={...file,versions:file.versions.map(v=>({...v,current:v.id===2}))};
 assert.equal(matchesWorkspaceSearch(promoted,'기획안'),false);
 assert.equal(currentFileText(promoted),'미승인 분기');
});
test('highlight treats regex metacharacters literally and preserves case offsets',()=>{
 assert.deepEqual(matchRanges('a+b A+B','a+b'),[{start:0,end:3},{start:4,end:7}]);
 assert.deepEqual(matchRanges('<script>본문</script>','본문'),[{start:8,end:10}]);
 assert.deepEqual(matchRanges('본문','  '),[]);
});
test('snippet centers the body match and does not claim a metadata-only match',()=>{
 assert.equal(contentSnippet('본문','파일명'),'');
 assert.match(contentSnippet('앞'.repeat(80)+'검색어'+'뒤'.repeat(100),'검색어'),/^….*검색어.*…$/);
});
