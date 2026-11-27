import { Body, Controller, ForbiddenException, Get, HttpCode, Injectable, Logger, Param, ParseUUIDPipe, Post, Req, Res, UnauthorizedException, UseGuards, HttpException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, Length, MaxLength } from "class-validator";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { AuthGuard, AuthLimits, ClientAddress, SessionCookie, UserId } from "./auth.js";
import { Db, scalarJson, selectJson } from "./db.js";
import { FileStore } from "./storage.js";
import { WITHDRAWAL_STATUS_SQL, WithdrawnAccounts, withdrawalInfo, type WithdrawalRow } from "./withdrawn.js";

// 계정 탈퇴·복구. 규칙(참여 프로젝트가 있으면 불가, 14일 보관, 승인 조건)은 DB 함수가 검사하고,
// 이 서버는 비밀번호 재확인·로그인 정보 정리·프로필 사진 삭제를 맡는다.
class WithdrawDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(1, 72) password!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class RecoverDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(1, 72) password!: string;
}

const BAD_CREDENTIALS = "아이디 또는 비밀번호가 올바르지 않습니다.";
const SWEEP_EVERY_MS = 60 * 60 * 1000; // 유예 기간이 지난 탈퇴 계정을 1시간마다 정리한다

// 유예 기간(14일)이 지난 탈퇴 계정을 자동으로 삭제한다(서버가 시작할 때, 그 뒤 1시간마다, 운영자가 목록을 열 때).
// 복구 신청이 접수된 계정과 참여한 프로젝트가 있는 계정은 건드리지 않는다(DB 함수 expired_withdrawal_ids가 가린다).
@Injectable()
export class WithdrawalPurger implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("WithdrawalPurger");
  private first?: NodeJS.Timeout;
  private every?: NodeJS.Timeout;
  private running: Promise<number> | null = null;

  constructor(private readonly db: Db, private readonly store: FileStore, private readonly withdrawn: WithdrawnAccounts) {}

  onModuleInit(): void {
    this.first = setTimeout(() => void this.sweep(), 10_000);
    this.every = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.first.unref(); this.every.unref(); // 이 타이머 때문에 서버가 끝나지 못하는 일이 없게
  }

  onModuleDestroy(): void { clearTimeout(this.first); clearInterval(this.every); }

  // 지운 계정 수. 동시에 여러 번 불러도 한 번만 돌린다.
  sweep(): Promise<number> {
    this.running ??= this.sweepOnce().finally(() => { this.running = null; });
    return this.running;
  }

  private async sweepOnce(): Promise<number> {
    try {
      const candidates = await this.db.asSystem((query) => scalarJson<string[]>(query, "public.expired_withdrawal_ids()"));
      if (!candidates?.length) return 0;
      const files = await this.profileImages(candidates); // 지우기 전에 프로필 사진 이름을 모아 둔다
      const deleted = (await this.db.asSystem((query) => scalarJson<string[]>(query, "public.purge_expired_withdrawals()"))) ?? [];
      for (const id of deleted) this.withdrawn.remove(id);
      await this.deleteImages(files.filter((f) => deleted.includes(f.userId)));
      if (deleted.length > 0) this.logger.log(`유예 기간이 지난 탈퇴 계정 ${deleted.length}개를 삭제했습니다.`);
      return deleted.length;
    } catch (error) {
      this.logger.error(`탈퇴 계정 자동 삭제에 실패했습니다: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  }

  // 계정의 프로필 사진 파일(avatars/<계정 id>/…)
  async profileImages(userIds: string[]): Promise<{ userId: string; name: string }[]> {
    const rows = await this.db.asSystem((query) => query<{ name: string }>(
      "select name from storage.objects where bucket_id = 'avatars' and split_part(name, '/', 1) = any ($1::text[])", [userIds]));
    return rows.map((r) => ({ userId: r.name.split("/")[0], name: r.name }));
  }

  async deleteImages(files: { name: string }[]): Promise<void> {
    if (files.length === 0) return;
    for (const file of files) await this.store.remove(`avatars/${file.name}`).catch(() => {});
    await this.db.asSystem((query) => query("delete from storage.objects where bucket_id = 'avatars' and name = any ($1::text[])", [files.map((f) => f.name)]));
  }
}

@Controller()
export class AccountController {
  constructor(
    private readonly db: Db, private readonly limits: AuthLimits, private readonly address: ClientAddress,
    private readonly cookie: SessionCookie, private readonly withdrawn: WithdrawnAccounts, private readonly purger: WithdrawalPurger,
  ) {}

  // 로그인과 같은 실패 횟수 제한을 쓴다(탈퇴·복구 화면으로 비밀번호를 무작위로 대입하지 못하게).
  private async verifyCredentials(req: Request, rawEmail: string, password: string): Promise<{ id: string; email: string }> {
    const email = rawEmail.trim().toLowerCase();
    const { client, hop } = this.address.of(req);
    const key = `${client}|${email}`;
    if (this.limits.loginIp.isBlocked(client) || this.limits.loginPair.isBlocked(key) || this.limits.loginHop.isBlocked(hop)) {
      throw new HttpException("시도가 너무 많습니다. 15분 뒤 다시 시도해 주세요.", 429);
    }
    const [user] = await this.db.asSystem((query) => query<{ id: string; email: string; encrypted_password: string }>(
      "select id, email, encrypted_password from auth.users where email = $1", [email]));
    const tooLong = Buffer.byteLength(password, "utf8") > 72;
    const ok = !!user && !tooLong && await bcrypt.compare(password, user.encrypted_password);
    if (!ok) {
      this.limits.loginPair.hit(key);
      this.limits.loginIp.hit(client);
      this.limits.loginHop.hit(hop);
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    this.limits.loginPair.clear(key);
    return { id: user.id, email: user.email };
  }

  private async assertOperator(userId: string) {
    const ok = await this.db.asUser(userId, (query) => scalarJson<boolean>(query, "public.is_operator()"));
    if (ok !== true) throw new ForbiddenException("운영자만 볼 수 있습니다.");
  }

  // 본인 탈퇴 신청: 로그인한 계정의 아이디(이메일)와 비밀번호를 다시 입력해야 한다. 이 순간부터 로그인할 수 없다.
  @Post("auth/withdraw")
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async withdraw(@UserId() userId: string, @Body() body: WithdrawDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.cookie.assertOrigin(req);
    const checked = await this.verifyCredentials(req, body.email, body.password);
    if (checked.id !== userId) throw new UnauthorizedException(BAD_CREDENTIALS); // 다른 계정의 아이디를 넣은 경우
    await this.db.asUser(userId, (query) => query("select public.withdraw_my_account($1)", [body.reason ?? ""]));
    this.withdrawn.add(userId);
    await this.db.asSystem(async (query) => {
      await query("delete from auth.refresh_tokens where user_id = $1", [userId]);
      await query("delete from auth.one_time_tokens where user_id = $1", [userId]);
      await query("delete from public.push_subscriptions where user_id = $1", [userId]); // 탈퇴 뒤에는 이 기기로 알림을 보내지 않는다
    });
    this.cookie.clear(res);
  }

  // 탈퇴한 본인의 복구 신청(로그인할 수 없으므로 아이디·비밀번호로 확인). 운영자가 승인하면 다시 로그인할 수 있다.
  @Post("auth/recover-request")
  @HttpCode(200)
  async recover(@Body() body: RecoverDto, @Req() req: Request) {
    const user = await this.verifyCredentials(req, body.email, body.password);
    await this.db.asSystem((query) => query("select public.request_account_recovery($1::uuid)", [user.id]));
    const [row] = await this.db.asSystem((query) => query<WithdrawalRow>(WITHDRAWAL_STATUS_SQL, [user.id]));
    return { withdrawal: withdrawalInfo(row) };
  }

  // ── 운영자 ──
  // 탈퇴 신청 목록(유예 기간 안이고 복구를 신청하지 않은 계정)과 복구 신청 목록(복구를 신청한 계정). 복구를 신청하면 앞의 목록에서 빠진다.
  // 유예 기간(14일)이 지난 계정은 자동으로 삭제되므로 목록에 없다(조회할 때도 먼저 정리한다).
  @Get("admin/account-withdrawals")
  @UseGuards(AuthGuard)
  async list(@UserId() userId: string) {
    await this.assertOperator(userId);
    await this.purger.sweep();
    const rows = await this.db.asUser(userId, (query) => selectJson(query, `
      select user_id, email, display_name, reason, requested_at, recovery_requested_at, recovery_rejected_at,
        requested_at + interval '14 days' as purge_at
      from public.account_withdrawals
      where recovery_requested_at is not null or requested_at + interval '14 days' > now()
      order by requested_at, user_id`));
    const mapped = rows.map((r) => ({
      userId: r.user_id, email: r.email, displayName: r.display_name, reason: r.reason, requestedAt: r.requested_at,
      recoveryRequestedAt: r.recovery_requested_at, recoveryRejected: !!r.recovery_rejected_at, purgeAt: r.purge_at, // 자동 삭제 예정 시각
    }));
    return {
      withdrawals: mapped.filter((r) => !r.recoveryRequestedAt),
      recoveries: mapped.filter((r) => !!r.recoveryRequestedAt).sort((a, b) => String(a.recoveryRequestedAt).localeCompare(String(b.recoveryRequestedAt))),
    };
  }

  // 탈퇴 승인 = 계정 정보를 바로 삭제(유예 기간 안이어도). 프로필 사진 파일도 함께 지운다. 복구 신청이 접수된 계정은 먼저 그 신청을 처리해야 한다.
  // 다른 사람이 보는 자료(프로젝트 파일·게시판 첨부)는 지우지 않는다 — 작성자 표시만 사라진다.
  @Post("admin/account-withdrawals/:userId/approve")
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async approveWithdrawal(@UserId() operatorId: string, @Param("userId", ParseUUIDPipe) targetId: string) {
    const files = await this.purger.profileImages([targetId]);
    await this.db.asUser(operatorId, (query) => query("select public.approve_account_withdrawal($1::uuid)", [targetId]));
    this.withdrawn.remove(targetId);
    await this.purger.deleteImages(files);
  }

  @Post("admin/account-recoveries/:userId/approve")
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async approveRecovery(@UserId() operatorId: string, @Param("userId", ParseUUIDPipe) targetId: string) {
    await this.db.asUser(operatorId, (query) => query("select public.approve_account_recovery($1::uuid)", [targetId]));
    this.withdrawn.remove(targetId);
  }

  @Post("admin/account-recoveries/:userId/reject")
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async rejectRecovery(@UserId() operatorId: string, @Param("userId", ParseUUIDPipe) targetId: string) {
    await this.db.asUser(operatorId, (query) => query("select public.reject_account_recovery($1::uuid)", [targetId]));
  }
}

