import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UnauthorizedException, UseGuards, HttpException } from "@nestjs/common";
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

@Controller()
export class AccountController {
  constructor(
    private readonly db: Db, private readonly limits: AuthLimits, private readonly address: ClientAddress,
    private readonly cookie: SessionCookie, private readonly withdrawn: WithdrawnAccounts, private readonly store: FileStore,
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
  // 탈퇴 신청 목록(복구를 신청하지 않은 계정)과 복구 신청 목록(복구를 신청한 계정). 복구를 신청하면 앞의 목록에서 빠진다.
  @Get("admin/account-withdrawals")
  @UseGuards(AuthGuard)
  async list(@UserId() userId: string) {
    await this.assertOperator(userId);
    const rows = await this.db.asUser(userId, (query) => selectJson(query, `
      select user_id, email, display_name, reason, requested_at, recovery_requested_at, recovery_rejected_at,
        requested_at + interval '14 days' as purge_at, requested_at + interval '14 days' <= now() as purgeable
      from public.account_withdrawals order by requested_at, user_id`));
    const mapped = rows.map((r) => ({
      userId: r.user_id, email: r.email, displayName: r.display_name, reason: r.reason, requestedAt: r.requested_at,
      recoveryRequestedAt: r.recovery_requested_at, recoveryRejected: !!r.recovery_rejected_at, purgeAt: r.purge_at, purgeable: r.purgeable === true,
    }));
    return {
      withdrawals: mapped.filter((r) => !r.recoveryRequestedAt),
      recoveries: mapped.filter((r) => !!r.recoveryRequestedAt).sort((a, b) => String(a.recoveryRequestedAt).localeCompare(String(b.recoveryRequestedAt))),
    };
  }

  // 탈퇴 승인 = 계정 정보 삭제(14일이 지난 계정만). 프로필 사진 파일도 함께 지운다.
  // 다른 사람이 보는 자료(프로젝트 파일·게시판 첨부)는 지우지 않는다 — 작성자 표시만 사라진다.
  @Post("admin/account-withdrawals/:userId/approve")
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async approveWithdrawal(@UserId() operatorId: string, @Param("userId", ParseUUIDPipe) targetId: string) {
    const files = await this.db.asSystem((query) => query<{ name: string }>(
      "select name from storage.objects where bucket_id = 'avatars' and name like $1", [`${targetId}/%`]));
    await this.db.asUser(operatorId, (query) => query("select public.approve_account_withdrawal($1::uuid)", [targetId]));
    this.withdrawn.remove(targetId);
    for (const file of files) await this.store.remove(`avatars/${file.name}`).catch(() => {});
    await this.db.asSystem((query) => query("delete from storage.objects where bucket_id = 'avatars' and name like $1", [`${targetId}/%`]));
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

