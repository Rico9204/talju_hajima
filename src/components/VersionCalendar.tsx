import { useMemo, useState } from "react";
import type { FileVersion, WorkspaceFile } from "../api/types";

// 버전 이력 달력(Temporary_Merge의 "업로드 달력" 이식): 이 파일(또는 워크스페이스 전체)의 버전이
// 언제 올라왔는지 날짜별 점으로 보여 준다. 화면이 이미 받은 파일·버전 목록으로 만들어 서버 조회가 없다.
// 날짜는 한국 시간 기준(업로드 시각이 없는 옛 기록은 저장된 날짜 문자열).

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const kstParts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

interface Entry { file: WorkspaceFile; version: FileVersion; day: string; time: string }

function entryDay(v: FileVersion): { day: string; time: string } | null {
  if (v.uploadedAt && !Number.isNaN(Date.parse(v.uploadedAt))) {
    const [day, time] = kstParts.format(new Date(v.uploadedAt)).split(" ");
    return { day, time: time ?? "" };
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? { day: v.date, time: "" } : null;
}

const monthKey = (day: string) => day.slice(0, 7);
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
// 그 달을 포함하는 일~토 6주(42칸)의 날짜 문자열.
function monthGrid(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first.getTime() - first.getUTCDay() * 86_400_000);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

export default function VersionCalendar({ file, files, onSelectFile }: {
  file: WorkspaceFile;
  files: WorkspaceFile[];
  onSelectFile?: (fileId: number) => void;
}) {
  const [scope, setScope] = useState<"file" | "all">("file");
  const entries = useMemo(() => {
    const list: Entry[] = [];
    for (const f of scope === "file" ? [file] : files) {
      for (const v of f.versions) {
        const when = entryDay(v);
        if (when) list.push({ file: f, version: v, ...when });
      }
    }
    return list.sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
  }, [scope, file, files]);
  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) map.set(e.day, [...(map.get(e.day) ?? []), e]);
    return map;
  }, [entries]);

  const today = kstParts.format(new Date()).slice(0, 10);
  const latest = entries.at(-1)?.day ?? today;
  const [month, setMonth] = useState(monthKey(latest));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const dayEntries = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const monthCount = entries.filter((e) => monthKey(e.day) === month).length;

  return (
    <div aria-label="버전 이력 달력">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {scope === "file" ? "이 파일" : "워크스페이스 전체"} · 이번 달 {monthCount}건
        </div>
        <button
          onClick={() => { setScope((s) => (s === "file" ? "all" : "file")); setSelectedDay(null); }}
          className="text-xs font-600 px-3 py-1.5 rounded-full"
          style={{ background: "var(--muted)", color: scope === "all" ? "var(--primary)" : "var(--foreground)" }}
        >
          {scope === "file" ? "전체 보기" : "이 파일만"}
        </button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="이전 달" className="w-7 h-7 flex items-center justify-center text-sm font-700 rounded-full" style={{ background: "var(--muted)" }}>‹</button>
        <div className="text-sm font-700">{Number(month.slice(0, 4))}년 {Number(month.slice(5, 7))}월</div>
        <button onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="다음 달" className="w-7 h-7 flex items-center justify-center text-sm font-700 rounded-full" style={{ background: "var(--muted)" }}>›</button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w) => <div key={w} className="text-xs font-600 text-center py-1" style={{ color: "var(--muted-foreground)" }}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 mb-3">
        {monthGrid(month).map((day) => {
          const count = byDay.get(day)?.length ?? 0;
          const selected = day === selectedDay;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(selected ? null : day)}
              disabled={count === 0}
              aria-label={`${day} 버전 ${count}개`}
              className="flex flex-col items-center justify-center py-1.5 rounded-lg"
              style={{ background: selected ? "var(--primary)" : day === today ? "var(--secondary)" : "transparent", opacity: monthKey(day) === month ? 1 : 0.3, cursor: count ? "pointer" : "default" }}
            >
              <span className="text-xs font-600" style={{ color: selected ? "#fff" : "var(--foreground)" }}>{Number(day.slice(8))}</span>
              <span className="text-[10px] leading-none mt-0.5 h-2.5" style={{ color: selected ? "#fff" : "var(--primary)" }}>{count > 1 ? count : count === 1 ? "•" : ""}</span>
            </button>
          );
        })}
      </div>

      {selectedDay ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>{selectedDay}에 올라온 버전</div>
          {dayEntries.map(({ file: f, version: v, time }) => {
            const other = f.id !== file.id;
            return (
              <button
                key={v.id}
                onClick={() => { if (other) onSelectFile?.(f.id); }}
                disabled={!other || !onSelectFile}
                className="flex items-center justify-between gap-2 p-2.5 text-left rounded-xl"
                style={{ background: "var(--muted)", cursor: other && onSelectFile ? "pointer" : "default" }}
                title={other ? "이 파일로 이동" : undefined}
              >
                <div className="min-w-0">
                  <div className="text-xs font-700 truncate">{scope === "all" ? `${f.name} · ` : ""}{v.version}{v.current ? " · 현재" : ""}</div>
                  <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{v.uploadedBy}{time ? ` · ${time}` : ""}{v.note ? ` · ${v.note}` : ""}</div>
                </div>
                {other && onSelectFile && <span className="text-xs shrink-0" style={{ color: "var(--primary)" }}>열기 ›</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>
          {entries.length ? "표시가 있는 날짜를 눌러 보세요." : "아직 올라온 버전이 없어요."}
        </p>
      )}
    </div>
  );
}
