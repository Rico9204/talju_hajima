import { useState, useRef, useEffect } from "react";
import { useProject, type WorkspaceFile } from "../context/ProjectContext";

interface FileRef {
  id: number;
  name: string;
  type: string;
  folderId: number | null;
  folderName: string;
}

interface Message {
  id: number;
  from: string;
  text: string;
  time: string;
  mine?: boolean;
  fileRef?: FileRef;
}

const fileTypeLabel: Record<string, string> = {
  pdf: "PDF", doc: "DOC", ppt: "PPT", xls: "XLS", zip: "ZIP", img: "IMG",
};

interface Channel {
  id: string;
  type: "group" | "dm";
  name: string;
  avatar: string;
  color: string;
  online?: boolean;
  role?: string;
  unread: number;
}

interface ProjectChatData {
  channels: Channel[];
  messages: Record<string, Message[]>;
}

const chatByProject: Record<string, ProjectChatData> = {
  heritage: {
    channels: [
      { id: "all", type: "group", name: "팀 전체", avatar: "⬡", color: "#2563eb", unread: 0 },
      { id: "박민준", type: "dm", name: "박민준", avatar: "박", color: "#f59e0b", online: true, role: "기록 담당", unread: 2 },
      { id: "이서연", type: "dm", name: "이서연", avatar: "이", color: "#22c55e", online: false, role: "디자인 담당", unread: 0 },
      { id: "정하늘", type: "dm", name: "정하늘", avatar: "정", color: "#8b5cf6", online: false, role: "조사 담당", unread: 0 },
      { id: "최현우", type: "dm", name: "최현우", avatar: "최", color: "#ef4444", online: true, role: "편집 담당", unread: 0 },
    ],
    messages: {
      all: [
        { id: 1, from: "정하늘", text: "강화도 현장 답사 사진 zip으로 올렸어요! 워크스페이스 확인 부탁드려요.", time: "오전 9:12" },
        { id: 2, from: "이서연", text: "확인했습니다. 아카이브 설계에 바로 반영할게요.", time: "오전 9:20" },
        { id: 3, from: "김지수", text: "다들 고생 많으세요. 중간발표 자료는 이번 주 금요일까지 초안 부탁드려요.", time: "오전 9:25", mine: true },
        { id: 4, from: "박민준", text: "문헌 조사 파트 오늘 중 정리해서 공유드릴게요.", time: "오전 9:31" },
        { id: 5, from: "최현우", text: "사진 편집은 내일 오전까지 끝낼 수 있을 것 같습니다.", time: "오전 9:40" },
      ],
      박민준: [
        { id: 1, from: "박민준", text: "지수님, 인터뷰 녹취 정리하다가 하나 여쭤볼게 있어요.", time: "오전 8:50" },
        { id: 2, from: "박민준", text: "3번 화자 발언 부분 출처 표기 어떻게 할까요?", time: "오전 8:51" },
      ],
      이서연: [{ id: 1, from: "이서연", text: "웹 전시 페이지 초안 레이아웃 시안 보내드렸어요~", time: "어제" }],
      정하늘: [{ id: 1, from: "정하늘", text: "네 알겠습니다!", time: "어제" }],
      최현우: [
        { id: 1, from: "최현우", text: "편집본 링크 공유드려요.", time: "3일 전" },
        { id: 2, from: "최현우", text: "확인 부탁드립니다 :)", time: "3일 전" },
      ],
    },
  },
  dialect: {
    channels: [
      { id: "all", type: "group", name: "팀 전체", avatar: "⬡", color: "#16a34a", unread: 0 },
      { id: "박민준", type: "dm", name: "박민준", avatar: "박", color: "#f59e0b", online: true, role: "조사 총괄", unread: 0 },
      { id: "오유진", type: "dm", name: "오유진", avatar: "오", color: "#2563eb", online: false, role: "분석 담당", unread: 0 },
      { id: "한소민", type: "dm", name: "한소민", avatar: "한", color: "#8b5cf6", online: false, role: "촬영·기록 담당", unread: 0 },
    ],
    messages: {
      all: [
        { id: 1, from: "박민준", text: "다들 수고 많으셨습니다. 오늘부로 프로젝트 공식 종료됐어요!", time: "2026-06-21" },
        { id: 2, from: "오유진", text: "최종 보고서 업로드했습니다. 확인 부탁드려요 :)", time: "2026-06-21" },
        { id: 3, from: "김지수", text: "다들 정말 고생하셨어요! 종료 평가도 오늘 안에 제출할게요.", time: "2026-06-21", mine: true },
      ],
      박민준: [{ id: 1, from: "박민준", text: "섭외 관련 자료는 워크스페이스에 정리해뒀어요.", time: "2026-05-30" }],
      오유진: [{ id: 1, from: "오유진", text: "분류 기준표 공유드립니다.", time: "2026-05-14" }],
      한소민: [{ id: 1, from: "한소민", text: "촬영본 업로드 완료했어요!", time: "2026-04-22" }],
    },
  },
};

const emptyChatData: ProjectChatData = {
  channels: [{ id: "all", type: "group", name: "팀 전체", avatar: "⬡", color: "#2563eb", unread: 0 }],
  messages: { all: [] },
};

export default function TeamChat({
  initialChannel, onOpenFile,
}: { initialChannel?: string; onOpenFile?: (fileId: number, folderId: number | null) => void }) {
  const { project, files, folders } = useProject();
  const data = chatByProject[project.id] || emptyChatData;
  const [active, setActive] = useState<string>(initialChannel || "all");
  const [messagesByProject, setMessagesByProject] = useState<Record<string, Record<string, Message[]>>>(
    Object.fromEntries(Object.entries(chatByProject).map(([k, v]) => [k, v.messages]))
  );
  const [input, setInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<FileRef | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  function folderNameOf(folderId: number | null) {
    return folderId === null ? "루트" : folders.find((f) => f.id === folderId)?.name || "폴더";
  }

  function pickFile(f: WorkspaceFile) {
    setPendingFile({ id: f.id, name: f.name, type: f.type, folderId: f.folderId, folderName: folderNameOf(f.folderId) });
    setPickerOpen(false);
  }

  useEffect(() => {
    const exists = data.channels.some((c) => c.id === initialChannel);
    setActive(exists && initialChannel ? initialChannel : "all");
    setPendingFile(null);
    setPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, initialChannel]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messagesByProject, active]);

  const chan = data.channels.find((c) => c.id === active) || data.channels[0];
  const thread = messagesByProject[project.id]?.[active] || [];

  function send() {
    if (!input.trim() && !pendingFile) return;
    setMessagesByProject((p) => ({
      ...p,
      [project.id]: {
        ...p[project.id],
        [active]: [
          ...(p[project.id]?.[active] || []),
          { id: Date.now(), from: "김지수", text: input.trim(), time: "방금", mine: true, fileRef: pendingFile || undefined },
        ],
      },
    }));
    setInput("");
    setPendingFile(null);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <div className="text-xs font-600 uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>
          팀 채팅
        </div>
        <h1 className="text-2xl font-700">Team Chat</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          {project.name} · 팀 전체 채널과 1:1 대화{project.status === "done" && " · 종료된 프로젝트 대화 기록"}
        </p>
      </div>

      <div className="grid grid-cols-5 gap-0 overflow-hidden" style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-card)", height: 560 }}>
        {/* Channel list */}
        <div className="col-span-2 min-h-0 flex flex-col" style={{ borderRight: "1px solid var(--border)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="text-xs font-600 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>채널</div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            {data.channels.map((c) => {
              const isActive = active === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                  style={{ background: isActive ? "var(--secondary)" : "transparent", borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent" }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-700 shrink-0 relative" style={{ background: `${c.color}18`, color: c.color }}>
                    {c.avatar}
                    {c.type === "dm" && c.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: "#22c55e", border: "2px solid var(--card)" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-700 truncate" style={{ color: isActive ? "var(--primary)" : "var(--foreground)" }}>{c.name}</div>
                    <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                      {c.type === "group" ? `전체 ${data.channels.filter((x) => x.type === "dm").length + 1}명` : c.role}
                    </div>
                  </div>
                  {c.unread > 0 && (
                    <span className="text-xs font-700 min-w-5 h-5 px-1 flex items-center justify-center shrink-0" style={{ background: "var(--accent)", color: "#fff", borderRadius: "20px" }}>
                      {c.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        <div className="col-span-3 min-h-0 flex flex-col">
          <div className="flex items-center gap-2.5 px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700" style={{ background: `${chan.color}18`, color: chan.color }}>
              {chan.avatar}
            </div>
            <div>
              <div className="text-sm font-700">{chan.name}</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {chan.type === "group" ? "팀 전체 채널" : chan.online ? "온라인" : "오프라인"}
              </div>
            </div>
          </div>

          <div ref={threadRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
            {thread.map((m) => (
              <div key={m.id} className="flex flex-col" style={{ alignItems: m.mine ? "flex-end" : "flex-start" }}>
                {!m.mine && (
                  <span className="text-xs font-600 mb-1 px-1" style={{ color: "var(--muted-foreground)" }}>{m.from}</span>
                )}
                {m.text && (
                  <div
                    className="px-3.5 py-2.5 text-sm max-w-[75%] leading-relaxed"
                    style={{
                      background: m.mine ? "var(--primary)" : "var(--muted)",
                      color: m.mine ? "#fff" : "var(--foreground)",
                      borderRadius: m.mine ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                    }}
                  >
                    {m.text}
                  </div>
                )}
                {m.fileRef && (
                  <button
                    onClick={() => onOpenFile?.(m.fileRef!.id, m.fileRef!.folderId)}
                    className="flex items-center gap-2.5 px-3 py-2.5 max-w-[75%] text-left transition-all"
                    style={{
                      background: "var(--card)",
                      border: "1.5px solid var(--border)",
                      borderRadius: "12px",
                      marginTop: m.text ? 6 : 0,
                    }}
                  >
                    <span
                      className="text-xs font-700 px-2 py-1 shrink-0"
                      style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "6px" }}
                    >
                      {fileTypeLabel[m.fileRef.type] || "FILE"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-700 truncate" style={{ color: "var(--foreground)" }}>{m.fileRef.name}</div>
                      <div className="text-xs" style={{ color: "var(--primary)" }}>{m.fileRef.folderName} · 워크스페이스에서 보기 →</div>
                    </div>
                  </button>
                )}
                <span className="text-xs mt-1 px-1" style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-jetbrains)" }}>{m.time}</span>
              </div>
            ))}
            {thread.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "var(--muted-foreground)" }}>아직 대화가 없어요</div>
            )}
          </div>

          <div className="shrink-0 relative" style={{ borderTop: "1px solid var(--border)" }}>
            {pickerOpen && (
              <div
                className="absolute bottom-full left-4 right-4 mb-2 max-h-64 overflow-y-auto p-1.5 z-20"
                style={{ background: "var(--card)", borderRadius: "12px", boxShadow: "0 16px 40px rgba(15,18,53,0.18)" }}
              >
                <div className="text-xs font-600 uppercase tracking-widest px-2.5 pt-1.5 pb-2" style={{ color: "var(--muted-foreground)" }}>
                  워크스페이스 파일 언급하기
                </div>
                {files.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => pickFile(f)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-all"
                    style={{ borderRadius: "8px" }}
                  >
                    <span
                      className="text-xs font-700 px-2 py-1 shrink-0"
                      style={{ background: "var(--secondary)", color: "var(--primary)", borderRadius: "6px" }}
                    >
                      {fileTypeLabel[f.type] || "FILE"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-700 truncate">{f.name}</div>
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{folderNameOf(f.folderId)}</div>
                    </div>
                  </button>
                ))}
                {files.length === 0 && (
                  <div className="text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>워크스페이스에 업로드된 파일이 없어요</div>
                )}
              </div>
            )}

            {pendingFile && (
              <div className="flex items-center gap-2.5 mx-4 mt-3 px-3 py-2" style={{ background: "var(--muted)", borderRadius: "10px" }}>
                <span
                  className="text-xs font-700 px-2 py-1 shrink-0"
                  style={{ background: "var(--card)", color: "var(--primary)", borderRadius: "6px" }}
                >
                  {fileTypeLabel[pendingFile.type] || "FILE"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-700 truncate">{pendingFile.name}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{pendingFile.folderName}에서 공유</div>
                </div>
                <button onClick={() => setPendingFile(null)} className="text-xs font-700 px-2 shrink-0" style={{ color: "var(--muted-foreground)" }}>
                  ✕
                </button>
              </div>
            )}

            <div className="px-4 py-3 flex items-center gap-2">
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="w-9 h-9 flex items-center justify-center text-sm shrink-0 transition-all"
                style={{ background: pickerOpen ? "var(--primary)" : "var(--muted)", color: pickerOpen ? "#fff" : "var(--muted-foreground)", borderRadius: "50%" }}
                title="워크스페이스 파일 언급"
              >
                📎
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={pendingFile ? "메시지 추가 (선택)..." : `${chan.name}에게 메시지 보내기...`}
                className="flex-1 text-sm px-3.5 py-2.5 outline-none"
                style={{ background: "var(--muted)", borderRadius: "20px", fontFamily: "var(--font-outfit)" }}
              />
              <button
                onClick={send}
                className="w-9 h-9 flex items-center justify-center text-sm font-700 shrink-0 transition-all"
                style={{
                  background: input.trim() || pendingFile ? "var(--primary)" : "var(--muted)",
                  color: input.trim() || pendingFile ? "#fff" : "var(--muted-foreground)",
                  borderRadius: "50%",
                }}
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
