import pg from "pg";

export type Query = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

// DB 접근은 전부 "요청한 사용자로서" 한다. 한 트랜잭션 안에서 역할을 authenticated로 바꾸고
// auth.uid()가 읽는 JWT 클레임을 채우므로, Supabase에서 쓰던 권한 규칙(RLS)과 DB 함수의 검사가
// 서버에서도 그대로 적용된다 — 서버 코드에서 권한 검사를 다시 구현하지 않는다.
// (Nest 의존성 주입 토큰으로 쓰려고 추상 클래스로 둔다. 테스트는 PGlite 구현으로 바꿔 끼운다.)
export abstract class Db {
  abstract asUser<T>(userId: string, fn: (query: Query) => Promise<T>): Promise<T>;
  // 사용자 권한 없이(서버 자신의 DB 계정으로) 실행. 앱 역할이 읽을 수 없는 계정 표(auth.*)를 다루는
  // 로그인·가입·토큰 갱신에서만 쓴다 — 그 밖의 기능은 반드시 asUser.
  abstract asSystem<T>(fn: (query: Query) => Promise<T>): Promise<T>;
  // pg_notify 알림 받기(실시간 기능). 돌려준 함수를 부르면 그만 받는다.
  abstract listen(channel: string, onMessage: (payload: string) => void): Promise<() => Promise<void>>;
}

// 결과는 DB 안에서 JSON(to_jsonb)으로 만들어 받는다. 그래야 bigint id·numeric이 숫자로, date가 "YYYY-MM-DD"로,
// 시각이 PostgREST와 같은 문자열로 온다 — 드라이버(pg·PGlite)마다 다른 타입 변환에 기대지 않는다.
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function selectJson<T = any>(query: Query, sql: string, params?: unknown[]): Promise<T[]> {
  return (await query<{ j: T }>(`select to_jsonb(q) as j from (${sql}) q`, params)).map((row) => row.j);
}
export async function selectOneJson<T = any>(query: Query, sql: string, params?: unknown[]): Promise<T | null> {
  return (await selectJson<T>(query, sql, params))[0] ?? null;
}
// 값 하나(DB 함수의 json·boolean·uuid 반환값 등)를 JSON으로.
export async function scalarJson<T = any>(query: Query, expression: string, params?: unknown[]): Promise<T> {
  return (await query<{ j: T }>(`select to_jsonb(${expression}) as j`, params))[0]?.j as T;
}

// 트랜잭션 안에서만 유효한(set local / is_local=true) 설정이라 연결이 풀로 돌아가도 남지 않는다.
export const AS_USER_SQL = [
  "set local role authenticated",
  "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)",
] as const;
export const claimsFor = (userId: string) => JSON.stringify({ sub: userId, role: "authenticated" });

export class PgDb extends Db {
  private readonly pool: pg.Pool;

  constructor(private readonly connectionString: string) {
    super();
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  asUser<T>(userId: string, fn: (query: Query) => Promise<T>): Promise<T> {
    return this.transaction(async (query) => {
      await query(AS_USER_SQL[0]);
      await query(AS_USER_SQL[1], [userId, claimsFor(userId)]);
      return fn(query);
    });
  }

  asSystem<T>(fn: (query: Query) => Promise<T>): Promise<T> {
    return this.transaction(fn);
  }

  // 알림 전용 연결 하나를 계속 붙잡아 둔다(LISTEN은 풀 연결로 할 수 없다). 끊기면 5초 뒤 다시 붙는다.
  // ponytail: 끊겨 있던 동안의 알림은 잃는다(화면은 다음 조회 때 맞춰진다). 놓치면 안 되면 변경 기록 표로 바꾼다.
  async listen(channel: string, onMessage: (payload: string) => void): Promise<() => Promise<void>> {
    if (!/^[a-z_]+$/.test(channel)) throw new Error("잘못된 알림 채널 이름");
    let client: pg.Client | null = null;
    let stopped = false;
    const connect = async () => {
      if (stopped) return;
      const next = new pg.Client({ connectionString: this.connectionString });
      next.on("notification", (msg) => { if (msg.channel === channel && msg.payload) onMessage(msg.payload); });
      next.on("error", () => { void next.end().catch(() => {}); client = null; setTimeout(() => void connect().catch(() => {}), 5000); });
      await next.connect();
      await next.query(`listen ${channel}`);
      client = next;
    };
    await connect();
    return async () => { stopped = true; await client?.end().catch(() => {}); };
  }

  private async transaction<T>(fn: (query: Query) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await fn(async (sql, params) => (await client.query(sql, params)).rows);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}
