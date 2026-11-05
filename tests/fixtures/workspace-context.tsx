import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FileUploadInput, FileVersion, WorkspaceFile } from "../../src/api/types";
import { MAX_WORKSPACE_FILE_SIZE, workspaceFileType } from "../../src/lib/workspaceFiles";
import { newHwpxBytes, readZipEntries, writeZipEntries } from "../../src/lib/hwpx";
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
  const hwpxFile: WorkspaceFile = { id: 5, name: "팀플_최종보고서.hwpx", type: "doc", uploader: "테스트 팀원", avatar: "팀", date: "2026-09-17", size: "2 KB", tag: "보고서", tags: ["보고서"], folderId: null, comments: [], versions: [{ id: 5, parentVersionId: null, current: true, version: "v1", uploadedBy: "테스트 팀원", date: "2026-09-17", size: "2 KB", note: "초안 작성", storagePath: "fixture/5", originalName: "팀플_최종보고서.hwpx", mimeType: "application/hnc+zip", byteSize: 2000, pinned: false }] };
  const [files, setFiles] = useState<WorkspaceFile[]>([{ id: 1, name: "테스트.png", type: "img", uploader: "테스트 팀원", avatar: "팀", date: "2026-09-17", size: "1 KB", tag: "사진", tags: ["사진"], folderId: null, comments: [], versions: [version(4,2,false),version(3,2,true),version(2,1,false),version(1,null,false)] }, hwpxFile, ...(demo ? [demoFile(11, "기획서.pdf"), demoFile(12, "예산.xlsx"), demoFile(13, "자료 조사.docx"), demoFile(14, "발표.pptx")] : [])]);
  const bytes = useRef(new Map<number, Blob>([[2,new Blob([png])],[3,new Blob([png])],[4,new Blob([png])]]));
  const counter = useRef(6);
  useEffect(() => {
    void (async () => {
      const b = await newHwpxBytes("팀플 최종 보고서 초안입니다.");
      const entries = await readZipEntries(b);
      entries.set("Contents/section0.xml", new TextEncoder().encode("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<hs:sec xmlns:hs=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\">\n  <hp:p id=\"p0\"><hp:run><hp:t>팀플 최종 보고서 초안입니다.</hp:t></hp:run></hp:p>\n  <hp:p id=\"p1\"><hp:run><hp:t>1. 연구 배경 및 목적: 대학생들의 원활한 한글 문서 협업을 지원합니다.</hp:t></hp:run></hp:p>\n  <hp:p id=\"p2\">\n    <hp:run>\n      <hp:tbl rowCnt=\"3\" colCnt=\"3\" width=\"10000\">\n        <hp:tr>\n          <hp:tc><hp:p><hp:run><hp:t>구분</hp:t></hp:run></hp:p></hp:tc>\n          <hp:tc><hp:p><hp:run><hp:t>담당자</hp:t></hp:run></hp:p></hp:tc>\n          <hp:tc><hp:p><hp:run><hp:t>진행 상태</hp:t></hp:run></hp:p></hp:tc>\n        </hp:tr>\n        <hp:tr>\n          <hp:tc><hp:p><hp:run><hp:t>한글 동시편집 에디터</hp:t></hp:run></hp:p></hp:tc>\n          <hp:tc><hp:p><hp:run><hp:t>홍길동</hp:t></hp:run></hp:p></hp:tc>\n          <hp:tc><hp:p><hp:run><hp:t>개발 완료 (Yjs CRDT)</hp:t></hp:run></hp:p></hp:tc>\n        </hp:tr>\n        <hp:tr>\n          <hp:tc><hp:p><hp:run><hp:t>표/수식 무손실 보존</hp:t></hp:run></hp:p></hp:tc>\n          <hp:tc><hp:p><hp:run><hp:t>이순신</hp:t></hp:run></hp:p></hp:tc>\n          <hp:tc><hp:p><hp:run><hp:t>검증 완료</hp:t></hp:run></hp:p></hp:tc>\n        </hp:tr>\n      </hp:tbl>\n    </hp:run>\n  </hp:p>\n  <hp:p id=\"p3\">\n    <hp:run>\n      <hp:equation version=\"1.0\">\n        <hp:script>E = mc^2</hp:script>\n      </hp:equation>\n    </hp:run>\n  </hp:p>\n  <hp:p id=\"p4\"><hp:run><hp:t>2. 결론 및 향후 계획: 추가 서식 호환성을 계속 강화해 나갈 예정입니다.</hp:t></hp:run></hp:p>\n</hs:sec>"));
      const complexBytes = await writeZipEntries(entries);
      bytes.current.set(5, new Blob([new Uint8Array(complexBytes)], { type: "application/hnc+zip" }));
    })();
  }, []);
  function guard() { if (errorMode) throw new Error("테스트: 저장소 연결 실패"); if (done) throw new Error("종료된 프로젝트"); }
  return <Context.Provider value={{
    project: { id: "fixture", name: "파일 버전관리 검증", status: done ? "done" : "active" }, files, folders, team: { members: [{name:"테스트 팀원",color:"#2563eb"}] },
    currentMember: {id:"fixture-user",userId:"fixture-user",name:"테스트 팀원"}, isLeader: true, isManager: true,
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
