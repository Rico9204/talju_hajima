import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardActivity } from '../src/lib/dashboardActivity.ts';
const now=new Date('2026-09-16T12:00:00Z');
test('last change wins, sorts newest first, limits to 72 hours, ignores unknown and future dates',()=>{
 const files=[{id:1,name:'수정 자료',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-09-16T11:00:00Z'}, {id:2,name:'등록 자료',createdAt:'2026-09-15T12:00:00Z'}, {id:3,name:'경계',createdAt:'2026-09-13T12:00:00Z'}, {id:4,name:'오래됨',createdAt:'2026-09-13T11:59:59Z'}, {id:5,name:'미상'}, {id:6,name:'미래',createdAt:'2026-09-17T00:00:00Z'}];
 const result=dashboardActivity(files,[],'me',now);
 assert.deepEqual(result.map(x=>x.id),['file-1','file-2','file-3']);
 assert.equal(result[0].action,'수정 자료 수정'); assert.equal(result[1].action,'등록 자료 등록');
});
test('uses modification time rather than event date and preserves private/hidden titles',()=>{
 const base={createdAt:'2026-09-16T10:00:00Z',date:'2027-01-01',scope:'personal',ownerMemberId:'other'};
 const events=[{...base,id:1,title:'비공개',visibility:'private'}, {...base,id:2,title:'숨긴 제목',visibility:'shared',hideTitle:true}, {...base,id:3,title:'내 일정',visibility:'private',ownerMemberId:'me'}];
 assert.deepEqual(dashboardActivity([],events,'me',now).map(x=>x.title),['바쁨','내 일정']);
});
