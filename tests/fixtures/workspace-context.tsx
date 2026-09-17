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
  const [files, setFiles] = useState<WorkspaceFile[]>([{ id: 1, name: "테스트.png", type: "img", uploader: "테스트 팀원", avatar: "팀", date: "2026-09-17", size: "1 KB", tag: "사진", folderId: null, comments: [], versions: [version(4,2,false),version(3,2,true),version(2,1,false),version(1,null,false)] }]);
  const bytes = useRef(new Map<number, Blob>([[2,new Blob([png])],[3,new Blob([png])],[4,new Blob([png])]]));
  const counter = useRef(5);
  function guard() { if (errorMode) throw new Error("테스트: 저장소 연결 실패"); if (done) throw new Error("종료된 프로젝트"); }
  return <Context.Provider value={{
    project: { id: "fixture", name: "파일 버전관리 검증", status: done ? "done" : "active" }, files, folders: [], team: { members: [{name:"테스트 팀원",color:"#2563eb"}] },
    addFolder: async()=>{}, addFileComment: async()=>{},
    uploadWorkspaceFile: async(input: FileUploadInput)=> {
      guard(); if(input.file.size>MAX_WORKSPACE_FILE_SIZE) throw new Error("파일은 50MB까지 업로드할 수 있습니다.");
      const id=counter.current++, fileId=input.fileId ?? id;
      const existing=files.find(f=>f.id===input.fileId);
      const branched=!!existing && existing.versions.find(v=>v.current)?.id!==input.baseVersionId;
      bytes.current.set(id,input.file);
      const v={...version(id,input.baseVersionId??null,!branched),originalName:input.file.name,storagePath:`fixture/${id}`,pinned:false,note:input.note??""};
      setFiles(prev=>existing ? prev.map(f=>f.id===fileId?{...f,versions:[v,...f.versions.map(old=>({...old,current:branched?old.current:false}))]}:f):[...prev,{id:fileId,name:input.file.name,type:workspaceFileType(input.file.name),uploader:"테스트 팀원",avatar:"팀",date:"2026-09-17",size:`${input.file.size} B`,tag:"기타",folderId:null,comments:[],versions:[v]}]);
      return {fileId,versionId:id,branched};
    },
    promoteFileVersion: async(fileId:number,id:number)=> { guard(); setFiles(prev=>prev.map(f=>f.id===fileId?{...f,versions:f.versions.map(v=>({...v,current:v.id===id}))}:f)); },
    pinFileVersion: async(fileId:number,id:number,pinned:boolean)=> { guard(); setFiles(prev=>prev.map(f=>f.id===fileId?{...f,versions:f.versions.map(v=>v.id===id?{...v,pinned}:v)}:f)); },
    downloadFileVersion: async(id:number)=> { if(errorMode) throw new Error("테스트: 다운로드 실패"); const blob=bytes.current.get(id); if(!blob) throw new Error("원본 없음"); return blob; },
  }}>
    <div className="p-3 flex gap-4"><label><input type="checkbox" checked={done} onChange={e=>setDone(e.target.checked)} />종료 상태 테스트</label><label><input type="checkbox" checked={errorMode} onChange={e=>setErrorMode(e.target.checked)} />오류 테스트</label></div>
    {children}
  </Context.Provider>;
}
export function useProject() { return useContext(Context); }
