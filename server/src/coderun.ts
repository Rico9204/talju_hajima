import { spawn as nodeSpawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Body, Controller, Get, HttpCode, HttpException, Injectable, Post, Res, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { IsIn, IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import { AuthGuard, UserId } from "./auth.js";

// C·C++·Java 코드 실행. 브라우저 안에서는 컴파일할 수 없어서 서버에서 "일회용 Docker 컨테이너"로 돌린다.
// 임의의 코드를 실행하는 기능이라 방어를 겹겹이 한다:
//  - 컨테이너: 네트워크 없음, 메모리·프로세스 수·파일 크기·CPU 제한, 읽기 전용 파일시스템(작업 폴더만 쓰기), 모든 권한 제거,
//    일반(비루트) 사용자, 끝나면 컨테이너 삭제. 이미지는 내려받지 않는다(--pull never).
//  - 코드는 명령줄이 아니라 표준입력으로만 넘긴다(셸에 끼어들 수 없다). 클래스 이름은 검증된 식별자만 환경변수로 넘긴다.
//  - 로그인한 사용자만, 사용자당 동시 1개·분당 20번, 서버 전체 동시 3개. 시간 초과·연결 끊김이면 컨테이너를 강제 종료한다.
//  - 기본은 꺼져 있다(CODE_RUNNER=docker 로 켠다).
export type CodeLanguage = "c" | "cpp" | "java";

export interface CodeRunnerSettings {
  enabled: boolean;
  docker?: string; // docker 실행 파일
  images?: Partial<Record<CodeLanguage, string>>;
  runSeconds?: number; // 프로그램 실행 시간 제한(기본 10초)
  spawn?: typeof nodeSpawn; // 테스트에서 실제 Docker 대신
}

export interface CodeRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  compileError: boolean;
  truncated: boolean;
  durationMs: number;
}

const MAX_CODE_CHARS = 100_000;
const MAX_OUTPUT_CHARS = 200_000;
const DEFAULT_RUN_SECONDS = 10; // 프로그램 실행 시간(컴파일 제외)
const DEADLINE_MS: Record<CodeLanguage, number> = { c: 25_000, cpp: 35_000, java: 40_000 }; // 컴파일 + 실행 전체(C++는 헤더가 커서 컴파일이 더 오래 걸린다)
const MAX_CONCURRENT = 3;
const MAX_PER_MINUTE = 20;
const DEFAULT_IMAGES: Record<CodeLanguage, string> = { c: "talju-run-native", cpp: "talju-run-native", java: "eclipse-temurin:21-jdk-alpine" }; // C·C++는 gcc·g++가 함께 든 이미지 하나를 쓴다
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

// 파일 이름과 클래스 이름이 같아야 하는 Java: 공개 클래스, 없으면 main이 있는 클래스, 없으면 Main.
export function javaClassName(code: string): string {
  const source = code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const pub = /\bpublic\s+(?:(?:final|abstract|strictfp)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/.exec(source)?.[1];
  if (pub && IDENTIFIER.test(pub)) return pub;
  const main = source.search(/\bstatic\s+void\s+main\s*\(/);
  if (main >= 0) {
    const before = [...source.slice(0, main).matchAll(/\b(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/g)].pop()?.[1];
    if (before && IDENTIFIER.test(before)) return before;
  }
  return "Main";
}

// 컨테이너 안에서 도는 셸 스크립트. 컴파일에 실패하면 표준오류에 컴파일 오류와 "표시(marker)"를 남기고 끝낸다.
// marker는 실행마다 무작위이고 셸 변수로만 들고 있어(환경변수로 내보내지 않아) 실행되는 프로그램이 읽을 수 없다.
// 프로그램이 시작되면 표준오류에 "실행 시작" 표시(run marker)를 한 줄 남긴다. 서버는 이 표시를 본 순간부터 실행 시간을 재고, 넘으면 컨테이너를 종료한다
// (컨테이너 안의 timeout 명령은 이 옵션 조합에서 프로그램을 멈추지 못해서 쓰지 않는다).
const SCRIPTS: Record<CodeLanguage, string> = {
  c: `M="$MARK"; R="$RUNMARK"; unset MARK RUNMARK
cat > /work/main.c && cd /work || exit 1
if ! gcc -std=c17 -O1 -o main main.c -lm 2> compile.txt; then cat compile.txt >&2; echo "$M" >&2; exit 1; fi
echo "$R" >&2
exec ./main`,
  cpp: `M="$MARK"; R="$RUNMARK"; unset MARK RUNMARK
cat > /work/main.cpp && cd /work || exit 1
if ! g++ -std=c++20 -O1 -o main main.cpp -lm 2> compile.txt; then cat compile.txt >&2; echo "$M" >&2; exit 1; fi
echo "$R" >&2
exec ./main`,
  java: `M="$MARK"; R="$RUNMARK"; C="$CLASS"; unset MARK RUNMARK CLASS
cat > "/work/$C.java" && cd /work || exit 1
if ! javac -J-Xmx300m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 -encoding UTF-8 -d /work "$C.java" 2> compile.txt; then cat compile.txt >&2; echo "$M" >&2; exit 1; fi
echo "$R" >&2
exec java -Xmx128m -Xss1m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:-UsePerfData -Dfile.encoding=UTF-8 -cp /work "$C"`,
};

export function dockerArgs(language: CodeLanguage, image: string, name: string, marker: string, runMarker: string, className: string): string[] {
  const java = language === "java";
  const big = java || language === "cpp"; // Java와 C++ 컴파일은 메모리를 더 쓴다
  return [
    "run", "--rm", "-i", "--name", name, "--pull", "never",
    "--network", "none",
    "--memory", big ? "512m" : "128m", "--memory-swap", big ? "512m" : "128m",
    "--cpus", big ? "2" : "1", "--pids-limit", java ? "256" : big ? "128" : "64",
    "--read-only", "--tmpfs", "/work:rw,exec,nosuid,nodev,size=48m,mode=1777", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65534:65534",
    "--ulimit", "nofile=256:256", "--ulimit", "fsize=33554432",
    "-e", `MARK=${marker}`, "-e", `RUNMARK=${runMarker}`, ...(java ? ["-e", `CLASS=${className}`] : []),
    "-w", "/work", image, "sh", "-c", SCRIPTS[language],
  ];
}

@Injectable()
export class CodeRunService {
  private readonly spawn: typeof nodeSpawn;
  private readonly docker: string;
  private readonly busyUsers = new Set<string>();
  private readonly running = new Map<string, () => void>(); // 사용자 → 지금 실행 중인 컨테이너를 종료하는 함수
  private readonly recent = new Map<string, number[]>();
  private active = 0;

  constructor(private readonly settings: CodeRunnerSettings = { enabled: false }) {
    this.spawn = settings.spawn ?? nodeSpawn;
    this.docker = settings.docker ?? "docker";
  }

  status() { return { enabled: this.settings.enabled, languages: this.settings.enabled ? (["c", "cpp", "java"] as CodeLanguage[]) : [] }; }

  private admit(userId: string): void {
    if (!this.settings.enabled) throw new ServiceUnavailableException("이 서버에서는 C·C++·Java 실행이 꺼져 있어요. 운영자가 서버 설정(CODE_RUNNER=docker)을 켜야 해요.");
    if (this.busyUsers.has(userId)) throw new HttpException("이미 실행 중인 코드가 있어요. 끝나거나 중지한 뒤 다시 실행해 주세요.", 429);
    if (this.active >= MAX_CONCURRENT) throw new HttpException("지금 실행 중인 코드가 많아요. 잠시 후 다시 시도해 주세요.", 429);
    const now = Date.now();
    const times = (this.recent.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (times.length >= MAX_PER_MINUTE) throw new HttpException("코드를 너무 자주 실행했어요. 잠시 후 다시 시도해 주세요.", 429);
    times.push(now);
    this.recent.set(userId, times);
  }

  // 중지 버튼: 이 사용자가 실행 중인 컨테이너를 바로 종료한다. 연결이 끊긴 것을 중간(프록시)이 전달하지 않아도 동작한다.
  cancel(userId: string): void { this.running.get(userId)?.(); }

  async run(userId: string, language: CodeLanguage, code: string, aborted: { onAbort(listener: () => void): void }): Promise<CodeRunResult> {
    this.admit(userId);
    this.busyUsers.add(userId);
    this.active++;
    const started = Date.now();
    const name = `talju-run-${randomBytes(8).toString("hex")}`;
    const marker = randomBytes(16).toString("hex");
    const runMarker = randomBytes(16).toString("hex");
    const runMs = (this.settings.runSeconds ?? DEFAULT_RUN_SECONDS) * 1000 + 500; // 시작 신호 이후 이 시간이 지나면 종료
    const image = this.settings.images?.[language] ?? DEFAULT_IMAGES[language];
    try {
      return await new Promise<CodeRunResult>((resolve) => {
        const child = this.spawn(this.docker, dockerArgs(language, image, name, marker, runMarker, language === "java" ? javaClassName(code) : ""), { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        let stdout = ""; let stderr = ""; let printed = 0;
        let truncated = false; let timedOut = false; let settled = false;
        let runTimer: NodeJS.Timeout | undefined;
        const killContainer = () => { try { this.spawn(this.docker, ["kill", name], { stdio: "ignore", windowsHide: true }).on("error", () => {}); } catch { /* 이미 끝났을 수 있다 */ } try { child.kill(); } catch { /* 같은 이유 */ } };
        const deadline = setTimeout(() => { timedOut = true; killContainer(); }, DEADLINE_MS[language]);
        this.running.set(userId, () => { if (!settled) killContainer(); });
        aborted.onAbort(() => { if (!settled) killContainer(); }); // 요청자가 연결을 끊거나 중지하면 바로 종료
        const take = (stream: "out" | "err") => (chunk: Buffer) => {
          if (truncated) return;
          let text = chunk.toString("utf8");
          printed += text.length;
          if (printed > MAX_OUTPUT_CHARS) { truncated = true; text = text.slice(0, Math.max(0, text.length - (printed - MAX_OUTPUT_CHARS))); killContainer(); }
          if (stream === "out") stdout += text; else stderr += text;
          // 컴파일이 끝나 프로그램이 시작되면 그때부터 실행 시간을 잰다.
          if (!runTimer && stream === "err" && stderr.includes(runMarker)) runTimer = setTimeout(() => { timedOut = true; killContainer(); }, runMs);
        };
        child.stdout?.on("data", take("out"));
        child.stderr?.on("data", take("err"));
        child.stdin?.on("error", () => {}); // 컨테이너가 먼저 끝나 입력을 못 받아도 괜찮다
        child.stdin?.end(code);
        const finish = (exitCode: number | null, extra = "") => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          clearTimeout(runTimer);
          const compileError = stderr.includes(marker);
          // 표시(marker)는 한 줄로 들어오므로 줄바꿈까지 함께 지운다.
          stderr = (stderr.split(`${runMarker}\n`).join("").split(runMarker).join("").split(`${marker}\n`).join("").split(marker).join("") + extra).replace(/\n{3,}$/, "\n");
          // 시간 제한(서버가 강제 종료)과 메모리 초과(137)는 모두 "한도 초과"로 안내한다.
          const limit = !compileError && (timedOut || exitCode === 137);
          resolve({ ok: !compileError && !limit && !truncated && exitCode === 0, stdout, stderr, exitCode, timedOut: limit, compileError, truncated, durationMs: Date.now() - started });
        };
        child.on("error", (error) => finish(null, `실행 환경을 시작하지 못했어요: ${error.message}\n`));
        child.on("close", (code) => finish(code));
      });
    } finally {
      this.busyUsers.delete(userId);
      this.running.delete(userId);
      this.active--;
    }
  }
}

class RunDto {
  @IsIn(["c", "cpp", "java"]) language!: CodeLanguage;
  @IsString() @MaxLength(MAX_CODE_CHARS) code!: string;
}

@Controller("code")
@UseGuards(AuthGuard)
export class CodeRunController {
  constructor(private readonly runner: CodeRunService) {}

  @Get("status")
  status() { return this.runner.status(); }

  @Post("cancel")
  @HttpCode(204)
  cancel(@UserId() userId: string) { this.runner.cancel(userId); }

  @Post("run")
  @HttpCode(200)
  run(@UserId() userId: string, @Body() body: RunDto, @Res({ passthrough: true }) res: Response) {
    // 응답을 다 보내기 전에 연결이 끊기면(중지 버튼·창 닫기) 실행 중인 컨테이너를 바로 종료한다. (요청의 close는 본문을 다 읽으면 바로 발생하므로 쓰지 않는다)
    return this.runner.run(userId, body.language, body.code, { onAbort: (listener) => { res.on("close", () => { if (!res.writableFinished) listener(); }); } });
  }
}
