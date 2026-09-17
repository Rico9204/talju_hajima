import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { MAX_WORKSPACE_FILE_SIZE, WORKSPACE_BUCKET, workspaceFileType, workspaceStoragePath, validateFileTags } from '../src/lib/workspaceFiles.ts';

// Execute the real repository against an in-memory Storage transport; no live credentials.
function repository(fake) {
  const source=readFileSync(new URL('../src/api/supabase/supabaseDataRepository.ts',import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const module={exports:{}};
  new Function('require','module','exports',outputText)((path)=> {
    if(path.endsWith('/supabase')) return {supabase:fake};
    if(path.endsWith('/workspaceFiles')) return {MAX_WORKSPACE_FILE_SIZE,WORKSPACE_BUCKET,workspaceFileType,workspaceStoragePath, validateFileTags};
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
        upload:async(path,file,options)=> { assert.equal(options.upsert,false); assert.match(path,/^[a-zA-Z0-9/-]+$/); objects.set(path,new Blob([await file.arrayBuffer()],{type:options.contentType})); return {error:null}; },
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
    const result=await repo.uploadFile('테스트-mtyks5m2',{file:new File([payload],name,{type}),folderId:null,tags:["자료"]});
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
test('folder creation persists trimmed metadata and is returned on a new list query',async()=> {
  const rows=[];
  const fake={from:(table)=> {
    assert.equal(table,'folders');
    return {
      select:(_columns,options)=>({eq:(_key,project)=>options?.count ? Promise.resolve({count:rows.length,error:null}) : {order:async()=>({data:rows.filter(row=>row.project_id===project),error:null})}}),
      insert:(row)=>({select:()=>({single:async()=>{const saved={...row,id:7};rows.push(saved);return {data:saved,error:null};}})}),
    };
  }};
  const repo=repository(fake);
  const created=await repo.createFolder('p','  발표 자료  ','팀원');
  assert.equal(created.name,'발표 자료'); assert.equal(created.id,7);
  assert.deepEqual(await repo.listFolders('p'),[created]);
  assert.deepEqual(await repo.listFolders('other'),[]);
  await assert.rejects(repo.createFolder('p','   ','팀원'),/비어/);
});
test('folder DB failures propagate instead of returning a success value',async()=> {
  const fake={from:()=>({select:()=>({eq:async()=>({count:0,error:null})}),insert:()=>({select:()=>({single:async()=>({data:null,error:new Error('폴더 저장 거부')})})})})};
  await assert.rejects(repository(fake).createFolder('p','발표 자료','팀원'),/저장 거부/);
});

function deletionTransport() {
  const pending=new Set(['p/user/a','p/other/b']);
  const objects=new Set(pending);
  const calls=[];
  const fake={
    from:(table)=>{ assert.equal(table,'workspace_delete_queue'); return {select:()=>({eq:()=>({order:()=>({limit:async()=>({data:[...pending].map(storage_path=>({storage_path})),error:null})})})})}; },
    storage:{from:()=>({remove:async(paths)=>{ calls.push('remove'); for(const p of paths) objects.delete(p); return {error:null}; }})},
    rpc:async(name,args)=>{ calls.push(name); if(name==='finish_workspace_cleanup') for(const p of pending) if(!objects.has(p)) pending.delete(p); return {error:null}; },
  };
  return {fake,pending,objects,calls};
}
test('file deletion uses authorized RPC; cleanup removes originals then acknowledges',async()=> {
  const {fake,pending,objects,calls}=deletionTransport(); const repo=repository(fake);
  await repo.deleteWorkspaceFile(1); await repo.cleanupWorkspaceFiles('p');
  assert.deepEqual(calls,['delete_workspace_file','remove','finish_workspace_cleanup']);
  assert.equal(objects.size,0); assert.equal(pending.size,0);
});
test('failed Storage deletion leaves a retryable queue and does not acknowledge success',async()=> {
  const {fake,pending,calls}=deletionTransport();
  fake.storage.from=()=>({remove:async()=>({error:new Error('network')})});
  await assert.rejects(repository(fake).cleanupWorkspaceFiles('p'),/network/);
  assert.equal(pending.size,2); assert.deepEqual(calls,[]);
});
test('silent Storage denial is reported instead of looping forever',async()=> {
  const {fake,pending}=deletionTransport();
  fake.storage.from=()=>({remove:async()=>({error:null})});
  await assert.rejects(repository(fake).cleanupWorkspaceFiles('p'),/일부 원본/);
  assert.equal(pending.size,2);
});
