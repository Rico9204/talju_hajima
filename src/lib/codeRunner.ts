// 간단한 코드 실행: 파일을 만들거나 설치하지 않고, 코드를 돌려 출력(stdout·stderr)만 바로 보여 준다.
// JavaScript·Python은 코드를 서버나 외부 서비스로 보내지 않고 "내 브라우저 안"에서 실행한다.
// C·Java는 브라우저에서 컴파일할 수 없어서 이 앱의 서버(네트워크가 막힌 일회용 Docker 컨테이너)에서 실행한다(server/src/coderun.ts).
//  - sandbox="allow-scripts" iframe: 고유(opaque) 출처라서 이 사이트의 쿠키·저장소·로그인 정보에 닿을 수 없다.
//  - 그 안의 Web Worker에서 실행: 무한 루프·시간 초과는 iframe을 통째로 없애 끊는다(화면은 멈추지 않는다).
//  - JavaScript는 네트워크 API를 막는다. Python(Pyodide, WebAssembly)은 처음 실행할 때만 CDN에서 받아 오므로 네트워크가 필요하다.
// 지원: JavaScript(.js .mjs .cjs, top-level await 가능, import/export 불가), Python(.py, 표준 라이브러리), C(.c), Java(.java). 입력은 지원하지 않음.

import { cancelRemoteRun, runRemoteCode } from "../api/rest/codeRun";

export type RunLanguage = "javascript" | "python" | "c" | "java";
export const isRemoteLanguage = (language: RunLanguage): language is "c" | "java" => language === "c" || language === "java";
export type RunStream = "stdout" | "stderr";

export const RUN_TIMEOUT_MS: Record<RunLanguage, number> = { javascript: 10_000, python: 20_000, c: 10_000, java: 10_000 }; // C·Java는 컴파일을 뺀 프로그램 실행 시간
const LOAD_TIMEOUT_MS = 90_000; // Pyodide 내려받기
const MAX_OUTPUT_CHARS = 200_000;
const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

const RUNNABLE_BY_EXT: Record<string, RunLanguage> = { js: "javascript", mjs: "javascript", cjs: "javascript", py: "python", c: "c", java: "java" };
export function runnableLanguage(name: string): RunLanguage | null {
  return RUNNABLE_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}
export const LANGUAGE_LABEL: Record<RunLanguage, string> = { javascript: "JavaScript", python: "Python", c: "C", java: "Java" };

export interface RunResult { ok: boolean; timedOut: boolean; cancelled: boolean; durationMs: number; compileError?: boolean }
export interface RunHandlers {
  onStatus?: (status: "loading" | "running") => void;
  onOutput: (stream: RunStream, text: string) => void;
}

// ── 아래 세 함수는 문자열로 바뀌어 iframe/Worker 안에서 실행된다: 바깥 변수를 쓰면 안 된다(자기 완결). ──

// Worker(JavaScript): console 출력을 모으고 코드를 async 함수로 실행한다.
function jsWorkerMain() {
  const post = (stream: string, text: string) => (self as unknown as Worker).postMessage({ type: "out", stream, text });
  const show = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
    if (typeof value === "object" && value !== null) { try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
    return String(value);
  };
  const scope = self as unknown as Record<string, unknown>;
  const consoleLike = (stream: string) => (...args: unknown[]) => post(stream, args.map(show).join(" ") + "\n");
  const fake = { log: consoleLike("stdout"), info: consoleLike("stdout"), debug: consoleLike("stdout"), warn: consoleLike("stderr"), error: consoleLike("stderr") };
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "Worker", "SharedWorker"]) {
    try { Object.defineProperty(scope, name, { value: undefined, configurable: false }); } catch { /* 이미 없으면 무시 */ }
  }
  self.onmessage = async (event: MessageEvent<{ code: string }>) => {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (console: unknown) => Promise<unknown>;
    (scope as { console: unknown }).console = fake;
    (self as unknown as Worker).postMessage({ type: "started" });
    try {
      await new AsyncFunction("console", event.data.code)(fake);
      (self as unknown as Worker).postMessage({ type: "done", ok: true });
    } catch (error) {
      post("stderr", show(error) + "\n");
      (self as unknown as Worker).postMessage({ type: "done", ok: false });
    }
  };
}

// Worker(Python): Pyodide를 처음 한 번만 불러오고 실행마다 새 전역 공간에서 돌린다.
function pyWorkerMain() {
  const w = self as unknown as { postMessage(m: unknown): void; importScripts(url: string): void; loadPyodide(o: { indexURL: string }): Promise<any> };
  let loading: Promise<any> | null = null;
  const post = (stream: string, text: string) => w.postMessage({ type: "out", stream, text });
  self.onmessage = async (event: MessageEvent<{ code: string; indexURL: string }>) => {
    try {
      if (!loading) {
        w.postMessage({ type: "loading" });
        w.importScripts(event.data.indexURL + "pyodide.js");
        loading = w.loadPyodide({ indexURL: event.data.indexURL });
      }
      const py = await loading;
      w.postMessage({ type: "started" });
      py.setStdout({ batched: (line: string) => post("stdout", line + "\n") });
      py.setStderr({ batched: (line: string) => post("stderr", line + "\n") });
      py.setStdin({ stdin: () => undefined }); // 입력은 지원하지 않는다(input()은 바로 EOF 오류)
      const globals = py.globals.get("dict")();
      try { await py.runPythonAsync(event.data.code, { globals }); w.postMessage({ type: "done", ok: true }); }
      finally { globals.destroy(); }
    } catch (error) {
      post("stderr", String((error as Error)?.message ?? error) + "\n");
      w.postMessage({ type: "done", ok: false });
    }
  };
}

// iframe: 부모의 "run"을 받아 언어별 Worker를 만들고 메시지를 그대로 부모에게 전달한다(Python Worker는 재사용).
function sandboxMain() {
  const parentWindow = window.parent;
  let pyWorker: Worker | null = null;
  const toUrl = (source: string) => URL.createObjectURL(new Blob([`(${source})()`], { type: "text/javascript" }));
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== parentWindow) return;
    const { type, id, lang, code, sources, indexURL } = event.data ?? {};
    if (type !== "run") return;
    const forward = (e: MessageEvent) => {
      parentWindow.postMessage({ ...e.data, id }, "*");
      if (e.data?.type === "done" && lang !== "python") worker.terminate(); // JavaScript Worker는 실행마다 새로 만들고 끝나면 없앤다
    };
    let worker: Worker;
    if (lang === "python") {
      pyWorker ??= new Worker(toUrl(sources.py));
      worker = pyWorker;
    } else {
      worker = new Worker(toUrl(sources.js));
    }
    worker.onmessage = forward;
    worker.onerror = (e) => { parentWindow.postMessage({ type: "out", id, stream: "stderr", text: String(e.message || "실행 오류") + "\n" }, "*"); parentWindow.postMessage({ type: "done", id, ok: false }, "*"); };
    worker.postMessage({ code, indexURL });
  });
  parentWindow.postMessage({ type: "ready" }, "*");
}

// ── 바깥(화면 쪽) ──
interface Sandbox { frame: HTMLIFrameElement; ready: Promise<void> }
let sandbox: Sandbox | null = null;

function destroySandbox() {
  sandbox?.frame.remove();
  sandbox = null;
}

function getSandbox(): Sandbox {
  if (sandbox) return sandbox;
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts"); // allow-same-origin을 주지 않는다: 이 사이트의 쿠키·저장소에 접근할 수 없다
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><script>(${sandboxMain.toString()})()</script>`;
  const ready = new Promise<void>((resolve) => {
    const onReady = (event: MessageEvent) => {
      if (event.source === frame.contentWindow && event.data?.type === "ready") { window.removeEventListener("message", onReady); resolve(); }
    };
    window.addEventListener("message", onReady);
  });
  document.body.appendChild(frame);
  sandbox = { frame, ready };
  return sandbox;
}

let runCounter = 0;

// C·Java: 서버에 보내 컴파일하고 실행한 결과를 한꺼번에 받는다(실행 중 출력은 실시간이 아니다). 중지하면 연결을 끊어 서버가 컨테이너를 종료한다.
function runRemote(language: "c" | "java", code: string, handlers: RunHandlers): { promise: Promise<RunResult>; cancel: () => void } {
  const controller = new AbortController();
  const started = Date.now();
  handlers.onStatus?.("running");
  const promise = (async (): Promise<RunResult> => {
    try {
      const result = await runRemoteCode(language, code, controller.signal);
      if (result.stdout) handlers.onOutput("stdout", result.stdout);
      if (result.stderr) handlers.onOutput("stderr", result.stderr);
      if (result.truncated) handlers.onOutput("stderr", "\n… 출력이 너무 길어 여기서 줄였어요.\n");
      return { ok: result.ok, timedOut: result.timedOut, cancelled: false, durationMs: result.durationMs, compileError: result.compileError };
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, timedOut: false, cancelled: true, durationMs: Date.now() - started };
      handlers.onOutput("stderr", (error instanceof Error ? error.message : "실행하지 못했어요.") + "\n");
      return { ok: false, timedOut: false, cancelled: false, durationMs: Date.now() - started };
    }
  })();
  return { promise, cancel: () => { controller.abort(); void cancelRemoteRun().catch(() => {}); } };
}

export function runCode(language: RunLanguage, code: string, handlers: RunHandlers): { promise: Promise<RunResult>; cancel: () => void } {
  if (isRemoteLanguage(language)) return runRemote(language, code, handlers);
  const started = Date.now();
  const id = ++runCounter;
  let finish: (result: Omit<RunResult, "durationMs">) => void = () => {};
  let cleanup: () => void = () => {};
  const promise = new Promise<RunResult>((resolve) => {
    let settled = false;
    let timer: number | undefined;
    let printed = 0;
    let truncated = false;
    const box = getSandbox();
    finish = (result) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (result.timedOut || result.cancelled) destroySandbox(); // 도는 코드를 확실히 멈춘다(다음 실행 때 새로 만든다)
      resolve({ ...result, durationMs: Date.now() - started });
    };
    cleanup = () => finish({ ok: false, timedOut: false, cancelled: true });
    const arm = (ms: number) => { window.clearTimeout(timer); timer = window.setTimeout(() => finish({ ok: false, timedOut: true, cancelled: false }), ms); };
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (event.source !== box.frame.contentWindow || !data || data.id !== id) return;
      if (data.type === "loading") { handlers.onStatus?.("loading"); arm(LOAD_TIMEOUT_MS); }
      else if (data.type === "started") { handlers.onStatus?.("running"); arm(RUN_TIMEOUT_MS[language]); }
      else if (data.type === "out") {
        if (truncated) return;
        const text = String(data.text);
        printed += text.length;
        if (printed > MAX_OUTPUT_CHARS) { truncated = true; handlers.onOutput("stderr", "\n… 출력이 너무 길어 여기서 줄였어요.\n"); finish({ ok: false, timedOut: false, cancelled: true }); return; }
        handlers.onOutput(data.stream === "stderr" ? "stderr" : "stdout", text);
      } else if (data.type === "done") finish({ ok: data.ok === true, timedOut: false, cancelled: false });
    }
    window.addEventListener("message", onMessage);
    arm(LOAD_TIMEOUT_MS);
    handlers.onStatus?.(language === "python" ? "loading" : "running");
    void box.ready.then(() => {
      if (settled) return;
      box.frame.contentWindow?.postMessage({
        type: "run", id, lang: language, code, indexURL: PYODIDE_INDEX_URL,
        sources: { js: jsWorkerMain.toString(), py: pyWorkerMain.toString() },
      }, "*");
    });
  });
  return { promise, cancel: () => cleanup() };
}
