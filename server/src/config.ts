// 환경변수 검사. 필수 값이 빠지거나 약하면 서버가 아예 뜨지 않는다 — 기본 비밀키·전체 허용 CORS로 조용히 도는 일이 없도록.
export interface ServerConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string; // 로그인 토큰 서명 키(서버만 안다)
  corsOrigins: string[];
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
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL!,
    jwtSecret: env.JWT_SECRET!,
    corsOrigins: corsOrigins.length > 0 ? corsOrigins : ["http://localhost:5173"],
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  };
}

function parseTrustProxy(value: string | undefined): number | boolean | string | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value); // 앞에 있는 프록시 수
  if (value === "true" || value === "false") return value === "true";
  return value; // "loopback", "10.0.0.0/8" 같은 신뢰할 주소
}
