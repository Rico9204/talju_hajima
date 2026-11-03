import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import * as Y from "yjs";
import type { FileUploadInput, FileVersion, WorkspaceFile } from "../../src/api/types";
import { MAX_WORKSPACE_FILE_SIZE, workspaceFileType } from "../../src/lib/workspaceFiles";
import { RICH_DOC_FIELD } from "../../src/lib/richDoc";

const Context = createContext<any>(null);
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="), c => c.charCodeAt(0));

function makeSampleDoc(text: string): Uint8Array {
  const d = new Y.Doc();
  d.clientID = 1;
  const frag = d.getXmlFragment(RICH_DOC_FIELD);
  const lines = text.split("\n");
  const elements = lines.map(line => {
    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    t.insert(0, line);
    p.insert(0, [t]);
    return p;
  });
  frag.insert(0, elements);
  return Y.encodeStateAsUpdate(d);
}

const version = (id: number, parent: number | null, current: boolean, uploadedBy = "테스트 팀원", note = "검토용 파일", searchText?: string): FileVersion => ({
  id, parentVersionId: parent, current, version: `v${id}`, uploadedBy, date: "2026-09-17", size: "1 KB", note,
  storagePath: id === 1 ? null : `fixture/${id}`, originalName: "테스트.png", mimeType: "image/png", byteSize: png.length, pinned: id === 2,
  searchText,
});

export function Fixture({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(false);
  const [errorMode, setErrorMode] = useState(false);
  type FixtureFolder = { id: number; parentId: number | null; name: string; color: string; createdBy: string; date: string; sortOrder?: number | null };
  const demo = new URLSearchParams(location.search).has("demo");
  const [folders, setFolders] = useState<FixtureFolder[]>(demo ? [
    { id: 101, parentId: null, name: "발표 자료", color: "#2563eb", createdBy: "테스트 팀원", date: "2026-09-17" },
    { id: 102, parentId: null, name: "회의록", color: "#f59e0b", createdBy: "테스트 팀원", date: "2026-09-17" },
    { id: 103, parentId: 101, name: "1차 발표", color: "#22c55e", createdBy: "테스트 팀원", date: "2026-09-17" },
  ] : []);
  const demoFile = (id: number, name: string): WorkspaceFile => ({ id, name, type: workspaceFileType(name), uploader: "테스트 팀원", avatar: "팀", date: "2026-09-17", size: "1 KB", tag: "기타", tags: [], folderId: null, comments: [], versions: [{ ...version(id * 10, null, true), originalName: name }] });
  
  const textV1 = "1장: 프로젝트 개요\n본 문서는 원작자 홍길동이 작성한 프로젝트 기본 계획서입니다.\n\n2장: 기능 명세\n- 워크스페이스 문서 작성 및 파일 공유\n- 실시간 동시 협업 및 댓글 피드백\n\n3장: 향후 일정\n11월 첫째 주 기능 구현 완료 예정.";
  const textV2 = "1장: 프로젝트 개요\n본 문서는 원작자 홍길동이 작성한 프로젝트 기본 계획서입니다.\n\n2장: 기능 명세\n- 워크스페이스 문서 작성 및 파일 공유\n- 실시간 동시 협업 및 댓글 피드백\n- 타인이 문서를 수정해 저장했을 때 파일 내 수정 부분 강조 표시 (김철수 수정)\n- 파일 내 표시 온/오프 토글 스위치 제공 (김철수 추가)\n\n3장: 향후 일정\n11월 첫째 주 기능 구현 및 검증 완료 예정.";

  const docBytesV1 = makeSampleDoc(textV1);
  const docBytesV2 = makeSampleDoc(textV2);

  const [files, setFiles] = useState<WorkspaceFile[]>([
    { id: 1, name: "테스트.png", type: "img", uploader: "테스트 팀원", avatar: "팀", date: "2026-09-17", size: "1 KB", tag: "사진", tags: ["사진"], folderId: null, comments: [], versions: [version(4,2,false),version(3,2,true),version(2,1,false),version(1,null,false)] },
    {
      id: 2,
      name: "중간보고서.rtdoc",
      type: "doc",
      uploader: "홍길동",
      avatar: "홍",
      date: "2026-09-17",
      size: "2.4 KB",
      tag: "보고서",
      tags: ["보고서"],
      folderId: null,
      comments: [],
      versions: [
        { ...version(21, 20, true, "김철수", "김철수가 2장 기능 명세 수정 및 추가", textV2), originalName: "중간보고서.rtdoc", mimeType: "application/x-talju-rtdoc", byteSize: docBytesV2.length, size: "2.4 KB" },
        { ...version(20, null, false, "홍길동", "홍길동 원작자 초안 작성", textV1), originalName: "중간보고서.rtdoc", mimeType: "application/x-talju-rtdoc", byteSize: docBytesV1.length, size: "1.8 KB" },
      ],
    },
    {
      id: 3,
      name: "연구기획서.docx",
      type: "doc",
      uploader: "이영희",
      avatar: "이",
      date: "2026-09-17",
      size: "15 KB",
      tag: "보고서",
      tags: ["보고서"],
      folderId: null,
      comments: [],
      versions: [
        { ...version(31, 30, true, "박민수", "박민수가 예산 계획 및 개발 일정 추가", "1. 개요\n연구 기본 기획입니다.\n2. 세부 내용\n- 기존 내용\n- 박민수가 추가한 신규 항목\n- 박민수가 보완한 세부 추진 일정\n3. 결론"), originalName: "연구기획서.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", byteSize: 15360, size: "15 KB" },
        { ...version(30, null, false, "이영희", "이영희 원작자 초안 작성", "1. 개요\n연구 기본 기획입니다.\n2. 세부 내용\n- 기존 내용\n3. 결론"), originalName: "연구기획서.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", byteSize: 12288, size: "12 KB" },
      ],
    },
    ...(demo ? [demoFile(11, "기획서.pdf"), demoFile(12, "예산.xlsx"), demoFile(13, "자료 조사.docx"), demoFile(14, "발표.pptx")] : [])
  ]);

  const bytes = useRef(new Map<number, Blob>([
    [2, new Blob([png])],
    [3, new Blob([png])],
    [4, new Blob([png])],
    [20, new Blob([docBytesV1], { type: "application/x-talju-rtdoc" })],
    [21, new Blob([docBytesV2], { type: "application/x-talju-rtdoc" })],
  ]));
  const counter = useRef(25);
  function guard() { if (errorMode) throw new Error("테스트: 저장소 연결 실패"); if (done) throw new Error("종료된 프로젝트"); }
  return <Context.Provider value={{
    project: { id: "fixture", name: "파일 버전관리 검증", status: done ? "done" : "active" }, files, folders, team: { members: [{name:"테스트 팀원",color:"#2563eb"}] },
    currentMember: { id: "fixture-user", userId: "fixture-user", name: "테스트 팀원" }, isLeader: true, isManager: true,
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
