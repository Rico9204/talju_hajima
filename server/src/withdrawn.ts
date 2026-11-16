import { Injectable } from "@nestjs/common";
import { Db } from "./db.js";

// 탈퇴 신청된 계정(public.account_withdrawals 행이 있는 계정). 로그인·토큰 갱신은 DB로 바로 확인하고,
// 이미 발급된 액세스 토큰(최대 1시간)은 요청마다 DB를 읽지 않도록 메모리 목록으로 막는다.
// 신청·복구·삭제는 서버가 바로 반영하고, 그 밖의 변경(DB에서 직접 고친 경우)은 1분 안에 따라잡는다.
const REFRESH_MS = 60_000;

@Injectable()
export class WithdrawnAccounts {
  private ids = new Set<string>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(private readonly db: Db) {}

  private reload(): Promise<void> {
    this.loading ??= this.db.asSystem((query) => query<{ user_id: string }>("select user_id from public.account_withdrawals"))
      .then((rows) => { this.ids = new Set(rows.map((r) => r.user_id)); this.loadedAt = Date.now(); })
      .catch(() => { /* 읽지 못하면 이전 목록을 그대로 쓰고 다음에 다시 시도 */ })
      .finally(() => { this.loading = null; });
    return this.loading;
  }

  async has(userId: string): Promise<boolean> {
    if (Date.now() - this.loadedAt > REFRESH_MS) await this.reload();
    return this.ids.has(userId);
  }

  add(userId: string): void { this.ids.add(userId); }
  remove(userId: string): void { this.ids.delete(userId); }
}

// 로그인 응답(403)과 복구 신청 응답에 담는 탈퇴 상태. 화면이 "복구 신청" 버튼을 보일지 정한다.
export const WITHDRAWAL_STATUS_SQL = `
  select requested_at, recovery_requested_at, recovery_rejected_at,
    requested_at + interval '14 days' as deadline,
    requested_at + interval '14 days' > now() as within
  from public.account_withdrawals where user_id = $1`;

export interface WithdrawalRow {
  requested_at: Date | string; recovery_requested_at: Date | string | null; recovery_rejected_at: Date | string | null;
  deadline: Date | string; within: boolean;
}

export function withdrawalInfo(row: WithdrawalRow) {
  return {
    requestedAt: row.requested_at,
    recoveryDeadline: row.deadline,
    canRecover: row.within && !row.recovery_requested_at && !row.recovery_rejected_at,
    recoveryRequested: !!row.recovery_requested_at,
    recoveryRejected: !!row.recovery_rejected_at,
  };
}
