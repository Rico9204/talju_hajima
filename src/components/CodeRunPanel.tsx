import { useCallback, useEffect, useRef, useState } from "react";
import { LANGUAGE_LABEL, RUN_TIMEOUT_MS, isRemoteLanguage, runCode, type RunLanguage, type RunResult } from "../lib/codeRunner";

// 코드 파일의 "▶ 실행": 결과(출력)만 바로 아래 패널에 보여 준다. 실행 방식·제한은 lib/codeRunner.ts.
type Chunk = { stream: "stdout" | "stderr"; text: string };
export type RunStatus = "idle" | "loading" | "running" | "done";

export function useCodeRun(language: RunLanguage | null, getCode: () => string) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  // StrictMode(개발)는 효과를 정리했다가 다시 실행하므로, 다시 실행될 때 true로 되돌려 둬야 한다.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelRef.current?.(); }; }, []);

  const run = useCallback(() => {
    if (!language || cancelRef.current) return; // 실행 중이면 무시
    setOpen(true);
    setChunks([]);
    setResult(null);
    const handle = runCode(language, getCode(), {
      onStatus: (s) => { if (mounted.current) setStatus(s); },
      onOutput: (stream, text) => { if (mounted.current) setChunks((prev) => [...prev, { stream, text }]); },
    });
    cancelRef.current = handle.cancel;
    void handle.promise.then((r) => {
      cancelRef.current = null;
      if (!mounted.current) return;
      setResult(r);
      setStatus("done");
    });
  }, [language, getCode]);

  const stop = useCallback(() => { cancelRef.current?.(); }, []);
  const clear = useCallback(() => { setChunks([]); setResult(null); setStatus("idle"); }, []);
  const close = useCallback(() => { cancelRef.current?.(); setOpen(false); }, []);
  return { open, status, chunks, result, run, stop, clear, close, busy: status === "loading" || status === "running" };
}

export default function CodeRunPanel({ language, runner }: { language: RunLanguage; runner: ReturnType<typeof useCodeRun> }) {
  const { status, chunks, result, run, stop, clear, close, busy } = runner;
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "nearest" }); }, [chunks.length]);

  const summary = status === "loading" ? "실행 환경을 준비하는 중… (처음 한 번은 몇 초 걸려요)"
    : status === "running" ? (isRemoteLanguage(language) ? "컴파일하고 실행하는 중…" : "실행 중…")
    : result?.compileError ? "✗ 컴파일 오류"
    : result?.timedOut ? (isRemoteLanguage(language) ? `실행 시간(${RUN_TIMEOUT_MS[language] / 1000}초) 또는 메모리 한도를 넘어 중단했어요` : `시간 초과(${RUN_TIMEOUT_MS[language] / 1000}초)로 중단했어요`)
    : result?.cancelled ? "중단됨"
    : result ? `${result.ok ? "✓ 완료" : "✗ 오류로 끝남"} · ${(result.durationMs / 1000).toFixed(2)}초`
    : "";

  return (
    <section aria-label="실행 결과" className="mx-5 mb-5 -mt-2 flex flex-col shrink-0 border" style={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: 10, maxHeight: "38%" }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs font-700">실행 결과</span>
        <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{LANGUAGE_LABEL[language]}</span>
        <span className="text-[11px] flex-1 min-w-0 truncate" role="status" style={{ color: result && !result.ok ? "#ef4444" : "var(--muted-foreground)" }}>{summary}</span>
        {busy
          ? <button type="button" onClick={stop} className="text-[11px] font-700 px-2.5 py-1" style={{ background: "#ef444418", color: "#ef4444", borderRadius: 20 }}>중지</button>
          : <button type="button" onClick={run} className="text-[11px] font-700 px-2.5 py-1" style={{ background: "var(--primary)", color: "#fff", borderRadius: 20 }}>다시 실행</button>}
        <button type="button" onClick={clear} disabled={busy} className="text-[11px] px-2 py-1 disabled:opacity-40" style={{ color: "var(--muted-foreground)" }}>지우기</button>
        <button type="button" onClick={close} aria-label="실행 결과 닫기" className="text-sm leading-none px-1" style={{ color: "var(--muted-foreground)" }}>×</button>
      </div>
      <pre className="text-xs p-3 overflow-auto min-h-12 whitespace-pre-wrap break-words" style={{ fontFamily: "var(--font-jetbrains)", margin: 0, lineHeight: 1.55 }}>
        {chunks.length === 0 && !busy && !result && <span style={{ color: "var(--muted-foreground)" }}>▶ 실행을 누르면 출력이 여기에 나와요.</span>}
        {chunks.length === 0 && result?.ok && <span style={{ color: "var(--muted-foreground)" }}>(출력 없음)</span>}
        {chunks.map((c, i) => <span key={i} style={c.stream === "stderr" ? { color: "#ef4444" } : undefined}>{c.text}</span>)}
        <div ref={endRef} />
      </pre>
    </section>
  );
}
