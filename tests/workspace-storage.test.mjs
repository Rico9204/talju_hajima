import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { MAX_WORKSPACE_FILE_SIZE, WORKSPACE_BUCKET, workspaceFileType } from '../src/lib/workspaceFiles.ts';

// Execute the real repository against an in-memory Storage transport; no live credentials.
function repository(fake) {
  const source=readFileSync(new URL('../src/api/supabase/supabaseDataRepository.ts',import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const module={exports:{}};
  new Function('require','module','exports',outputText)((path)=> {
    if(path.endsWith('/supabase')) return {supabase:fake};
    if(path.endsWith('/workspaceFiles')) return {MAX_WORKSPACE_FILE_SIZE,WORKSPACE_BUCKET,workspaceFileType};
    if(path.endsWith('/evaluationSummary')) return {};
    throw new Error(`Unexpected dependency ${path}`);
  },module,module.exports);
  return module.exports.supabaseDataRepository;
}
function transport() {
  const objects=new Map(); const records=new Map(); let counter=0;
  const fake={
    auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})},
    storage:{from:(bucket)=> {
      assert.equal(bucket,'workspace-files');
      return {
        upload:async(path,file,options)=> { assert.equal(options.upsert,false); objects.set(path,new Blob([await file.arrayBuffer()],{type:options.contentType})); return {error:null}; },
        download:async(path)=>({data:objects.get(path),error:null}),
        remove:async(paths)=>{ for(const path of paths) if(![...records.values()].includes(path)) objects.delete(path); return {error:null}; },
      };
    }},
    rpc:async(name,args)=> { assert.equal(name,'register_workspace_version'); const id=++counter; records.set(id,args.p_path); return {data:{file_id:id,version_id:id,branched:false},error:null}; },
    from:()=>({select:()=>({eq:(_key,id)=>({single:async()=>({data:{storage_path:records.get(id)},error:null})})})}),
  };
  return {fake,objects,records};
}
test('PDF, PPTX, image and text bytes survive actual upload/download repository calls',async()=> {
  const {fake}=transport(); const repo=repository(fake);
  const payload=Uint8Array.from([0,255,128,13,10,0,80,75,3,4,239,191,189]);
  for(const [name,type] of [['발표.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],['문서.pdf','application/pdf'],['사진.png','image/png'],['기록.txt','text/plain']]) {
    const result=await repo.uploadFile('project',{file:new File([payload],name,{type}),folderId:null});
    const blob=await repo.downloadFileVersion(result.versionId);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),payload);
  }
});
test('failed registration cleans unlinked bytes',async()=> {
  const {fake,objects}=transport(); fake.rpc=async()=>({data:null,error:new Error('DB 실패')});
  await assert.rejects(repository(fake).uploadFile('p',{file:new File(['a'],'a.pdf'),folderId:null}),/DB 실패/);
  assert.equal(objects.size,0);
});
test('ambiguous response cannot remove committed bytes',async()=> {
  const {fake,objects,records}=transport(); fake.rpc=async(_name,args)=>{records.set(1,args.p_path);return {data:null,error:new Error('응답 유실')};};
  await assert.rejects(repository(fake).uploadFile('p',{file:new File(['a'],'a.pdf'),folderId:null}),/응답 유실/);
  assert.equal(objects.size,1);
});
test('oversized file rejected before storage upload',async()=> {
  const {fake,objects}=transport();
  await assert.rejects(repository(fake).uploadFile('p',{file:{size:MAX_WORKSPACE_FILE_SIZE+1},folderId:null}),/50MB/);
  assert.equal(objects.size,0);
});
