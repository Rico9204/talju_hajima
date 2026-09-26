// 환경변수 검사. 필수 값이 빠지거나 약하면 서버가 아예 뜨지 않는다 — 기본 비밀키·전체 허용 CORS로 조용히 도는 일이 없도록.
export interface ServerConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string; // 로그인 토큰 서명 키(서버만 안다)
  corsOrigins: string[];
  // 업로드한 파일을 두는 디렉터리(서버 디스크). 여러 대로 늘리면 S3 호환 저장소 구현으로 바꾼다(FileStore).
  storageDir: string;
  // 공개 파일(프로필 사진·게시판 첨부) 주소의 앞부분. 브라우저가 이 서버에 닿는 주소(예: https://api.example.com).
  // 게시판 첨부는 DB 검사(jsonb_urls_ok)가 https와 app_text_settings.storage_host 도메인을 요구한다.
  publicBaseUrl: string;
  // 메일(가입 확인·비밀번호 재설정). console = 서버 로그에 링크를 찍음(개발용), smtp = 실제 발송.
  mail: { transport: "console" } | { transport: "smtp"; smtpUrl: string; from: string };
  // 메일 링크가 가리킬 화면(프론트) 주소.
  appUrl: string;
  odcloudApiKey?: string;
  // 리버스 프록시 뒤에서 실제 접속 IP를 쓰기 위한 Express "trust proxy" 값(예: 1, "loopback").
  // 안 쓰면 모든 요청이 프록시 IP로 보여 로그인 실패 제한이 모든 사용자에게 한꺼번에 걸린다.
  trustProxy?: number | boolean | string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const missing = ["DATABASE_URL", "JWT_SECRET"].filter((key) => !env[key]);
  if (missing.length > 0) throw new Error(`필수 환경변수가 없습니다: ${missing.join(", ")}`);
  if (env.JWT_SECRET!.length < 32) throw new Error("JWT_SECRET은 32자 이상의 임의 문자열이어야 합니다.");
  const corsOrigins = (env.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (env.NODE_ENV === "production" && corsOrigins.length === 0) {
    throw new Error("운영 환경에서는 CORS_ORIGIN(허용할 프론트 주소)을 반드시 지정해야 합니다.");
  }
  const production = env.NODE_ENV === "production";
  const transport = env.MAIL_TRANSPORT || (production ? "smtp" : "console");
  if (transport !== "console" && transport !== "smtp") throw new Error("MAIL_TRANSPORT는 console 또는 smtp 입니다.");
  if (production && transport !== "smtp") throw new Error("운영 환경에서는 MAIL_TRANSPORT=smtp 여야 합니다(가입 확인 메일).");
  if (transport === "smtp" && (!env.SMTP_URL || !env.MAIL_FROM)) throw new Error("smtp 메일에는 SMTP_URL과 MAIL_FROM이 필요합니다.");
  if (production && !env.APP_URL) throw new Error("운영 환경에서는 APP_URL(메일 링크가 가리킬 화면 주소)이 필요합니다.");
  const port = Number(env.PORT ?? 3000);
  return {
    port,
    storageDir: env.STORAGE_DIR || "./storage-data",
    publicBaseUrl: (env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ""),
    databaseUrl: env.DATABASE_URL!,
    jwtSecret: env.JWT_SECRET!,
    corsOrigins: corsOrigins.length > 0 ? corsOrigins : ["http://localhost:5173"],
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    mail: transport === "smtp" ? { transport, smtpUrl: env.SMTP_URL!, from: env.MAIL_FROM! } : { transport },
    appUrl: (env.APP_URL || "http://localhost:5173").replace(/\/+$/, ""),
    odcloudApiKey: env.ODCLOUD_API_KEY,
  };
}

function parseTrustProxy(value: string | undefined): number | boolean | string | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value); // 앞에 있는 프록시 수
  if (value === "true" || value === "false") return value === "true";
  return value; // "loopback", "10.0.0.0/8" 같은 신뢰할 주소
}
