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
}

// 트랜잭션 안에서만 유효한(set local / is_local=true) 설정이라 연결이 풀로 돌아가도 남지 않는다.
export const AS_USER_SQL = [
  "set local role authenticated",
  "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)",
] as const;
export const claimsFor = (userId: string) => JSON.stringify({ sub: userId, role: "authenticated" });

export class PgDb extends Db {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
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
