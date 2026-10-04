import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { FileUploadInput, FileVersion, WorkspaceFile } from "../../src/api/types";
import { MAX_WORKSPACE_FILE_SIZE, workspaceFileType } from "../../src/lib/workspaceFiles";
const Context = createContext<any>(null);
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="), c => c.charCodeAt(0));
const version = (id: number, parent: number | null, current: boolean): FileVersion => ({
  id, parentVersionId: parent, current, version: `v${id}`, uploadedBy: "테스트 팀원", date: "2026-09-17", size: "1 KB", note: "검토용 파일",
  storagePath: id === 1 ? null : `fixture/${id}`, originalName: "테스트.png", mimeType: "image/png", byteSize: png.length, pinned: id === 2,
});
export function Fixture({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(false);
  const [errorMode, setErrorMode] = useState(false);
  type FixtureFolder = { id: number; parentId: number | null; name: string; color: string; createdBy: string; date: string; sortOrder?: number | null };
  // ?demo=1: 폴더·파일 순서 바꾸기·여러 개 고르기 확인용으로 폴더 3개(하나는 하위 폴더)와 파일 4개를 더 둔다.
  const demo = new URLSearchParams(location.search).has("demo");
  const [folders, setFolders] = useState<FixtureFolder[]>(demo ? [
    { id: 101, parentId: null, name: "발표 자료", color: "#2563eb", createdBy: "테스트 팀원", date: "2026-09-17" },
    { id: 102, parentId: null, name: "회의록", color: "#f59e0b", createdBy: "테스트 팀원", date: "2026-09-17" },
    { id: 103, parentId: 101, name: "1차 발표", color: "#22c55e", createdBy: "테스트 팀원", date: "2026-09-17" },
  ] : []);
  const demoFile = (id: number, name: string): WorkspaceFile => ({ id, name, type: workspaceFileType(name), uploader: "테스트 팀원", avatar: "팀", date: "2026-09-17", size: "1 KB", tag: "기타", tags: [], folderId: null, comments: [], versions: [{ ...version(id * 10, null, true), originalName: name }] });
  const [files, setFiles] = useState<WorkspaceFile[]>([{ id: 1, name: "테스트.png", type: "img", uploader: "테스트 팀원", avatar: "팀", date: "2026-09-17", size: "1 KB", tag: "사진", tags: ["사진"], folderId: null, comments: [], versions: [version(4,2,false),version(3,2,true),version(2,1,false),version(1,null,false)] }, ...(demo ? [demoFile(11, "기획서.pdf"), demoFile(12, "예산.xlsx"), demoFile(13, "자료 조사.docx"), demoFile(14, "발표.pptx")] : [])]);
  const bytes = useRef(new Map<number, Blob>([[2,new Blob([png])],[3,new Blob([png])],[4,new Blob([png])]]));
  const counter = useRef(5);
  function guard() { if (errorMode) throw new Error("테스트: 저장소 연결 실패"); if (done) throw new Error("종료된 프로젝트"); }
  return <Context.Provider value={{
    project: { id: "fixture", name: "파일 버전관리 검증", status: done ? "done" : "active" }, files, folders, team: { members: [{name:"테스트 팀원",color:"#2563eb"}] },
    currentMember: {userId:"fixture-user"}, isLeader: true, isManager: true,
    deleteWorkspaceFile: async(id:number)=>{ guard(); setFiles(prev=>prev.filter(f=>f.id!==id)); },
    deleteWorkspaceFolder: async(id:number)=>{ guard(); if(files.some(f=>f.folderId===id)) throw new Error("파일이 있는 폴더는 삭제할 수 없습니다."); setFolders(prev=>prev.filter(f=>f.id!==id)); },
    pendingWorkspaceCleanup: async()=>[], cleanupWorkspaceFiles: async()=>{}, markSectionViewed: async()=>{},
    addFolder: async(name: string, parentId: number | null = null)=>{ guard(); const created={id:counter.current++,parentId,name:name.trim(),color:"#2563eb",createdBy:"테스트 팀원",date:"2026-09-17"}; setFolders(prev=>[...prev,created]); return created; }, addFileComment: async()=>{},
    moveWorkspaceFiles: async(ids:number[], folderId:number|null)=>{ guard(); setFiles(prev=>prev.map(f=>ids.includes(f.id)?{...f,folderId,sortOrder:null}:f)); return 0; },
    moveWorkspaceFolder: async(id:number, parentId:number|null)=>{ guard(); setFolders(prev=>prev.map(f=>f.id===id?{...f,parentId,sortOrder:null}:f)); },
    reorderWorkspaceItems: async(kind:"folder"|"file", ids:number[])=>{ guard(); const order=new Map(ids.map((id,i)=>[id,i+1]));
      if(kind==="folder") setFolders(prev=>prev.map(f=>order.has(f.id)?{...f,sortOrder:order.get(f.id)}:f)); else setFiles(prev=>prev.map(f=>order.has(f.id)?{...f,sortOrder:order.get(f.id)}:f)); },
    uploadWorkspaceFile: async(input: FileUploadInput)=> {
      guard(); if(input.file.size>MAX_WORKSPACE_FILE_SIZE) throw new Error("파일은 50MB까지 업로드할 수 있습니다.");
      const id=counter.current++, fileId=input.fileId ?? id;
      const existing=files.find(f=>f.id===input.fileId);
      const branched=!!existing && existing.versions.find(v=>v.current)?.id!==input.baseVersionId;
      bytes.current.set(id,input.file);
      const v={...version(id,input.baseVersionId??null,!branched),originalName:input.file.name,storagePath:`fixture/${id}`,pinned:false,note:input.note??""};
      setFiles(prev=>existing ? prev.map(f=>f.id===fileId?{...f,versions:[v,...f.versions.map(old=>({...old,current:branched?old.current:false}))]}:f):[...prev,{id:fileId,name:input.file.name,type:workspaceFileType(input.file.name),uploader:"테스트 팀원",avatar:"팀",date:"2026-09-17",size:`${input.file.size} B`,tag:"기타",tags:input.tags??[],folderId:input.folderId,comments:[],versions:[v]}]);
      return {fileId,versionId:id,branched};
    },
    setFileTags: async(id:number,tags:string[])=>{ guard(); setFiles(prev=>prev.map(f=>f.id===id?{...f,tags}:f)); },
    promoteFileVersion: async(fileId:number,id:number)=> { guard(); setFiles(prev=>prev.map(f=>f.id===fileId?{...f,versions:f.versions.map(v=>({...v,current:v.id===id}))}:f)); },
    pinFileVersion: async(fileId:number,id:number,pinned:boolean)=> { guard(); setFiles(prev=>prev.map(f=>f.id===fileId?{...f,versions:f.versions.map(v=>v.id===id?{...v,pinned}:v)}:f)); },
    downloadFileVersion: async(id:number)=> { if(errorMode) throw new Error("테스트: 다운로드 실패"); const blob=bytes.current.get(id); if(!blob) throw new Error("원본 없음"); return blob; },
  }}>
    <div className="p-3 flex gap-4"><label><input type="checkbox" checked={done} onChange={e=>setDone(e.target.checked)} />종료 상태 테스트</label><label><input type="checkbox" checked={errorMode} onChange={e=>setErrorMode(e.target.checked)} />오류 테스트</label></div>
    {children}
  </Context.Provider>;
}
export function useProject() { return useContext(Context); }
export function useOptionalProject() { return useContext(Context); }
