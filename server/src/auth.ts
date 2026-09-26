import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, HttpCode, HttpException, Injectable, Ip,
  Logger, Patch, Post, UnauthorizedException, UseGuards, createParamDecorator,
} from "@nestjs/common";
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { Db, selectOneJson, type Query } from "./db.js";
import { Mailer, mailTemplates, type MailMessage } from "./mail.js";

// 로그인은 이 서버가 직접 한다(Supabase Auth 대체). 공유 브랜치(Temporary_Merge)의
// bcrypt 가입·로그인, JwtAuthGuard·@CurrentUser 구조를 옮기되 약점을 고쳤다:
//  - 서명 키는 필수 환경변수(기본값 없음), 액세스 토큰은 1시간 + 리프레시 토큰(해시 저장·1회용)
//  - 계정 자체를 잠그지 않고 "IP+이메일" 단위로 실패 횟수를 제한(남의 계정을 일부러 잠그는 공격 방지)
//  - 없는 이메일도 같은 시간이 걸리게 비교해 가입 여부가 응답 시간으로 드러나지 않게
const ISSUER = "talju-server";
const AUDIENCE = "talju-app";
const ACCESS_TTL = "1h";
const REFRESH_TTL_DAYS = 30;
const BCRYPT_COST = 10; // Supabase와 같은 비용 — 옮겨 온 기존 해시와 새 해시가 같은 형식
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer", BCRYPT_COST);

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  signAccess(userId: string): Promise<string> {
    return new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(userId)
      .setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(ACCESS_TTL).sign(this.key);
  }

  async verifyAccess(token: string): Promise<string> {
    return (await this.verifyClaims(token)).userId;
  }

  // 사용자 id + 만료 시각(초). 실시간 연결은 토큰이 만료되는 순간 닫는다.
  async verifyClaims(token: string): Promise<{ userId: string; expiresAt: number }> {
    const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) throw new Error("토큰에 사용자 id가 없습니다.");
    if (typeof payload.exp !== "number") throw new Error("토큰에 만료 시각이 없습니다.");
    return { userId: payload.sub, expiresAt: payload.exp };
  }
}

// 키별로 일정 시간 동안의 횟수를 센다.
// ponytail: 서버 한 대의 메모리 기준. 서버를 여러 대로 늘리면 Redis·DB로 옮긴다. 근본 대책(CAPTCHA)은 별도 과제.
export class RateLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  isBlocked(key: string): boolean {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (entry.resetAt <= Date.now()) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.max;
  }

  hit(key: string): void {
    const now = Date.now();
    if (this.failures.size > 10_000) for (const [k, v] of this.failures) if (v.resetAt <= now) this.failures.delete(k);
    const entry = this.failures.get(key);
    if (!entry || entry.resetAt <= now) this.failures.set(key, { count: 1, resetAt: now + this.windowMs });
    else entry.count += 1;
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}

// 로그인·가입 남용 제한. 계정 자체는 잠그지 않는다(남이 일부러 잠글 수 있으므로).
//  - loginPair: 같은 IP·같은 이메일 실패 → 그 조합만 막음(비밀번호 대입)
//  - loginIp:   같은 IP의 실패 전체 → 이메일을 바꿔 가며 대입하거나 bcrypt 계산으로 CPU를 소모시키는 공격
//  - signupIp:  같은 IP의 가입 시도 → 계정 대량 생성·bcrypt 소모
export class AuthLimits {
  constructor(
    readonly loginPair = new RateLimiter(5, 15 * 60_000),
    readonly loginIp = new RateLimiter(30, 15 * 60_000),
    readonly signupIp = new RateLimiter(10, 60 * 60_000),
    // 확인 메일 다시 받기·비밀번호 재설정 요청(메일 폭탄 방지)
    readonly mailIp = new RateLimiter(10, 60 * 60_000),
  ) {}
}

// 메일 링크가 가리킬 화면 주소(예: https://taljuhajima.vercel.app).
export class MailSettings {
  constructor(readonly appUrl: string) {}
}

// 가입·재설정 요청의 응답은 이메일이 있든 없든 항상 같다(가입 여부가 드러나지 않게).
const CHECK_EMAIL = { status: "check_email", message: "메일을 보냈습니다. 메일의 링크를 눌러 계속해 주세요." };
const passwordFingerprint = (hash: string) => createHash("sha256").update(hash).digest("hex");

// bcrypt는 앞 72바이트만 쓴다 — 글자 수가 아니라 바이트로 검사해야 한글 비밀번호 뒷부분이 조용히 무시되지 않는다.
const BCRYPT_MAX_BYTES = 72;
const tooLongForBcrypt = (password: string) => Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES;

type AuthedRequest = Request & { userId?: string };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (request.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException("로그인이 필요합니다.");
    try {
      request.userId = await this.tokens.verifyAccess(token);
    } catch {
      throw new UnauthorizedException("로그인이 만료되었습니다. 다시 로그인해 주세요.");
    }
    return true;
  }
}

export const UserId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const userId = context.switchToHttp().getRequest<AuthedRequest>().userId;
  if (!userId) throw new UnauthorizedException("로그인이 필요합니다.");
  return userId;
});

class SignupDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(8, 72) password!: string; // bcrypt는 72바이트까지만 쓴다
  @IsString() @Length(1, 30) displayName!: string;
  @IsOptional() @IsString() @MaxLength(100) org?: string;
  @IsOptional() @IsIn(["admin"]) signupType?: "admin";
}

class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(1, 72) password!: string;
}

class RefreshDto {
  @IsString() @Length(20, 200) refreshToken!: string;
}

class EmailDto {
  @IsEmail() @MaxLength(254) email!: string;
}

class OneTimeTokenDto {
  @IsString() @Length(20, 200) token!: string;
}

class ResetPasswordDto {
  @IsString() @Length(20, 200) token!: string;
  @IsString() @Length(8, 72) password!: string;
}

class ChangePasswordDto {
  @IsString() @Length(1, 72) currentPassword!: string;
  @IsString() @Length(8, 72) newPassword!: string;
}

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger("Auth");

  constructor(
    private readonly db: Db, private readonly tokens: TokenService, private readonly limits: AuthLimits,
    private readonly mailer: Mailer, private readonly mail: MailSettings,
  ) {}

  // 메일 링크용 1회용 토큰. 같은 목적의 이전 토큰은 지운다(가장 최근 링크만 유효).
  private async oneTimeToken(query: Query, userId: string, purpose: "confirm" | "reset", hours: number, fingerprint: string | null = null) {
    const token = randomBytes(32).toString("base64url");
    await query("delete from auth.one_time_tokens where user_id = $1 and purpose = $2", [userId, purpose]);
    await query(
      "insert into auth.one_time_tokens(token_hash, user_id, purpose, password_fingerprint, expires_at) values ($1, $2, $3, $4, now() + make_interval(hours => $5))",
      [hashToken(token), userId, purpose, fingerprint, hours]);
    return token;
  }

  // 응답을 기다리지 않고 보낸다 — 이메일이 있든 없든 응답 시간이 같게(가입 여부 노출 방지). 실패는 서버 로그에.
  private deliver(message: MailMessage | null): void {
    if (message) void this.mailer.send(message).catch((error) => this.logger.error(`메일을 보내지 못했습니다: ${error instanceof Error ? error.message : error}`));
  }

  // 액세스 토큰 + 새 리프레시 토큰. 만료된 토큰은 이때 함께 치운다.
  private async issue(query: Query, userId: string) {
    const refreshToken = randomBytes(32).toString("base64url");
    await query("delete from auth.refresh_tokens where user_id = $1 and expires_at <= now()", [userId]);
    await query("insert into auth.refresh_tokens(token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))",
      [hashToken(refreshToken), userId, REFRESH_TTL_DAYS]);
    return { accessToken: await this.tokens.signAccess(userId), refreshToken };
  }

  // 가입: 항상 같은 응답("메일을 보냈다"). 가입하면 schema.sql의 트리거(handle_new_user)가 프로필을 만든다.
  //  - 새 이메일: 계정(미인증) + 확인 메일(24시간)
  //  - 인증된 기존 이메일: 화면에는 똑같이, 메일로 "이미 가입됨 + 비밀번호 재설정 링크"
  //  - 미인증 기존 이메일: 이번 가입 정보로 덮어쓰고 확인 메일 다시(남이 먼저 만들어 둔 미인증 계정을 가로챌 수 없게)
  @Post("signup")
  @HttpCode(202)
  async signup(@Body() body: SignupDto, @Ip() ip: string) {
    if (tooLongForBcrypt(body.password)) throw new BadRequestException("비밀번호가 너무 깁니다(72바이트, 한글은 약 24자까지).");
    if (this.limits.signupIp.isBlocked(ip)) throw new HttpException("가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    this.limits.signupIp.hit(ip);
    const email = body.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
    const meta = JSON.stringify({ display_name: body.displayName.trim(), org: body.org?.trim() ?? "", ...(body.signupType ? { signup_type: body.signupType } : {}) });
    const message = await this.db.asSystem(async (query) => {
      const [created] = await query<{ id: string }>(
        "insert into auth.users(email, encrypted_password, raw_user_meta_data) values ($1, $2, $3) on conflict (email) do nothing returning id",
        [email, passwordHash, meta]);
      if (created) {
        return { to: email, ...mailTemplates.confirm(this.mail.appUrl, await this.oneTimeToken(query, created.id, "confirm", 24, passwordFingerprint(passwordHash))) };
      }
      const existing = (await selectOneJson(query, "select id, email_confirmed_at from auth.users where email = $1", [email]))!;
      if (existing.email_confirmed_at) {
        return { to: email, ...mailTemplates.alreadyRegistered(this.mail.appUrl, await this.oneTimeToken(query, existing.id, "reset", 1)) };
      }
      await query("update auth.users set encrypted_password = $2, raw_user_meta_data = $3 where id = $1", [existing.id, passwordHash, meta]);
      await query("update public.profiles set display_name = $2, avatar_initial = left($2, 1) where id = $1", [existing.id, body.displayName.trim()]);
      return { to: email, ...mailTemplates.confirm(this.mail.appUrl, await this.oneTimeToken(query, existing.id, "confirm", 24, passwordFingerprint(passwordHash))) };
    });
    this.deliver(message);
    return CHECK_EMAIL;
  }

  // 메일의 확인 링크 → 인증 완료 + 바로 로그인. 링크를 만든 뒤 비밀번호가 바뀌었으면(다른 가입으로 덮어씀) 무효.
  @Post("confirm")
  @HttpCode(200)
  confirm(@Body() body: OneTimeTokenDto) {
    return this.db.asSystem(async (query) => {
      const [row] = await query<{ user_id: string; password_fingerprint: string | null }>(
        "delete from auth.one_time_tokens where token_hash = $1 and purpose = 'confirm' and expires_at > now() returning user_id, password_fingerprint",
        [hashToken(body.token)]);
      const user = row ? await selectOneJson(query, "select id, email, encrypted_password, raw_user_meta_data from auth.users where id = $1", [row.user_id]) : null;
      if (!row || !user || row.password_fingerprint !== passwordFingerprint(user.encrypted_password)) {
        throw new BadRequestException("링크가 만료되었거나 이미 사용되었습니다. 확인 메일을 다시 받아 주세요.");
      }
      await query("update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()), last_sign_in_at = now() where id = $1", [user.id]);
      return { user: { id: user.id, email: user.email, user_metadata: user.raw_user_meta_data ?? {} }, ...(await this.issue(query, user.id)) };
    });
  }

  @Post("resend-confirmation")
  @HttpCode(202)
  async resendConfirmation(@Body() body: EmailDto, @Ip() ip: string) {
    if (this.limits.mailIp.isBlocked(ip)) throw new HttpException("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    this.limits.mailIp.hit(ip);
    const email = body.email.trim().toLowerCase();
    const message = await this.db.asSystem(async (query) => {
      const user = await selectOneJson(query, "select id, encrypted_password from auth.users where email = $1 and email_confirmed_at is null", [email]);
      if (!user) return null;
      return { to: email, ...mailTemplates.confirm(this.mail.appUrl, await this.oneTimeToken(query, user.id, "confirm", 24, passwordFingerprint(user.encrypted_password))) };
    });
    this.deliver(message);
    return CHECK_EMAIL;
  }

  // 비밀번호 재설정 요청: 항상 같은 응답. 계정이 있으면 1시간짜리 링크를 보낸다.
  @Post("password-reset/request")
  @HttpCode(202)
  async requestPasswordReset(@Body() body: EmailDto, @Ip() ip: string) {
    if (this.limits.mailIp.isBlocked(ip)) throw new HttpException("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    this.limits.mailIp.hit(ip);
    const email = body.email.trim().toLowerCase();
    const message = await this.db.asSystem(async (query) => {
      const user = await selectOneJson(query, "select id from auth.users where email = $1", [email]);
      return user ? { to: email, ...mailTemplates.reset(this.mail.appUrl, await this.oneTimeToken(query, user.id, "reset", 1)) } : null;
    });
    this.deliver(message);
    return CHECK_EMAIL;
  }

  // 새 비밀번호 정하기: 링크는 한 번만, 모든 기기에서 로그아웃(리프레시 토큰 전부 폐기). 메일을 받았으니 이메일도 인증된 것으로 본다.
  @Post("password-reset/confirm")
  @HttpCode(204)
  async confirmPasswordReset(@Body() body: ResetPasswordDto) {
    if (tooLongForBcrypt(body.password)) throw new BadRequestException("비밀번호가 너무 깁니다(72바이트, 한글은 약 24자까지).");
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
    await this.db.asSystem(async (query) => {
      const [row] = await query<{ user_id: string }>(
        "delete from auth.one_time_tokens where token_hash = $1 and purpose = 'reset' and expires_at > now() returning user_id", [hashToken(body.token)]);
      if (!row) throw new BadRequestException("링크가 만료되었거나 이미 사용되었습니다. 비밀번호 재설정을 다시 요청해 주세요.");
      await query("update auth.users set encrypted_password = $2, email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1", [row.user_id, passwordHash]);
      await query("delete from auth.refresh_tokens where user_id = $1", [row.user_id]);
      await query("delete from auth.one_time_tokens where user_id = $1", [row.user_id]);
    });
  }

  // 로그인한 상태에서 비밀번호 바꾸기(현재 비밀번호 확인). 다른 기기는 로그아웃되고 이 기기에는 새 토큰을 준다.
  @Patch("password")
  @UseGuards(AuthGuard)
  async changePassword(@UserId() userId: string, @Body() body: ChangePasswordDto) {
    if (tooLongForBcrypt(body.newPassword)) throw new BadRequestException("비밀번호가 너무 깁니다(72바이트, 한글은 약 24자까지).");
    const user = await this.db.asSystem((query) => selectOneJson(query, "select encrypted_password from auth.users where id = $1", [userId]));
    if (!user || tooLongForBcrypt(body.currentPassword) || !(await bcrypt.compare(body.currentPassword, user.encrypted_password))) {
      throw new BadRequestException("현재 비밀번호가 올바르지 않습니다.");
    }
    const passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_COST);
    return this.db.asSystem(async (query) => {
      await query("update auth.users set encrypted_password = $2 where id = $1", [userId, passwordHash]);
      await query("delete from auth.refresh_tokens where user_id = $1", [userId]);
      return this.issue(query, userId);
    });
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Ip() ip: string) {
    const email = body.email.trim().toLowerCase();
    const key = `${ip}|${email}`;
    if (this.limits.loginIp.isBlocked(ip) || this.limits.loginPair.isBlocked(key)) {
      throw new HttpException("로그인 시도가 너무 많습니다. 15분 뒤 다시 시도해 주세요.", 429);
    }
    const [user] = await this.db.asSystem((query) =>
      query<{ id: string; encrypted_password: string; confirmed: boolean; raw_user_meta_data: Record<string, unknown> }>(
        "select id, encrypted_password, email_confirmed_at is not null as confirmed, raw_user_meta_data from auth.users where email = $1", [email]));
    // 72바이트를 넘는 비밀번호는 bcrypt가 앞부분만 비교하므로 맞았다고 보지 않는다(그런 비밀번호로는 가입할 수 없다).
    const matches = !tooLongForBcrypt(body.password) && await bcrypt.compare(body.password, user?.encrypted_password ?? DUMMY_HASH);
    if (!user || !matches) {
      this.limits.loginPair.hit(key);
      this.limits.loginIp.hit(ip);
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
    // 성공하면 이 이메일의 실패만 지운다. IP 단위 실패는 남긴다(공격자가 자기 계정으로 한 번 성공해 초기화하지 못하게).
    this.limits.loginPair.clear(key);
    // 비밀번호가 맞은 사람에게만 알리므로 가입 여부가 새지 않는다.
    if (!user.confirmed) throw new ForbiddenException("이메일 인증을 완료해 주세요. 가입할 때 받은 메일의 링크를 눌러 주세요.");
    return this.db.asSystem(async (query) => {
      await query("update auth.users set last_sign_in_at = now() where id = $1", [user.id]);
      return { user: { id: user.id, email, user_metadata: user.raw_user_meta_data ?? {} }, ...(await this.issue(query, user.id)) };
    });
  }

  // 리프레시 토큰은 한 번만 쓸 수 있다: 지우면서 새 것을 발급(rotation).
  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() body: RefreshDto) {
    return this.db.asSystem(async (query) => {
      const [row] = await query<{ user_id: string }>(
        "delete from auth.refresh_tokens where token_hash = $1 and expires_at > now() returning user_id", [hashToken(body.refreshToken)]);
      if (!row) throw new UnauthorizedException("로그인이 만료되었습니다. 다시 로그인해 주세요.");
      return this.issue(query, row.user_id);
    });
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Body() body: RefreshDto) {
    await this.db.asSystem((query) => query("delete from auth.refresh_tokens where token_hash = $1", [hashToken(body.refreshToken)]));
  }

  @Get("me")
  @UseGuards(AuthGuard)
  async me(@UserId() userId: string) {
    const [user] = await this.db.asSystem((query) => query<{ id: string; email: string; raw_user_meta_data: Record<string, unknown> }>("select id, email, raw_user_meta_data from auth.users where id = $1", [userId]));
    if (!user) throw new UnauthorizedException("계정을 찾을 수 없습니다.");
    return { ...user, user_metadata: user.raw_user_meta_data ?? {} };
  }
}
