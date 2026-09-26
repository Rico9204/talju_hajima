import {
  BadRequestException, Body, CanActivate, ConflictException, Controller, ExecutionContext, Get, HttpCode, HttpException, Injectable, Ip, Post,
  UnauthorizedException, UseGuards, createParamDecorator,
} from "@nestjs/common";
import { IsEmail, IsOptional, IsString, Length, MaxLength } from "class-validator";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { Db, type Query } from "./db.js";

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
    const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) throw new Error("토큰에 사용자 id가 없습니다.");
    return payload.sub;
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
  ) {}
}

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
}

class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(1, 72) password!: string;
}

class RefreshDto {
  @IsString() @Length(20, 200) refreshToken!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly db: Db, private readonly tokens: TokenService, private readonly limits: AuthLimits) {}

  // 액세스 토큰 + 새 리프레시 토큰. 만료된 토큰은 이때 함께 치운다.
  private async issue(query: Query, userId: string) {
    const refreshToken = randomBytes(32).toString("base64url");
    await query("delete from auth.refresh_tokens where user_id = $1 and expires_at <= now()", [userId]);
    await query("insert into auth.refresh_tokens(token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))",
      [hashToken(refreshToken), userId, REFRESH_TTL_DAYS]);
    return { accessToken: await this.tokens.signAccess(userId), refreshToken };
  }

  // 가입하면 schema.sql의 트리거(handle_new_user)가 프로필을 만든다 — Supabase 때와 같다.
  // TODO(메일 발송 도입 시): 중복 이메일도 같은 응답을 주고 재설정 메일을 보내는 방식으로(가입 여부 노출 방지).
  @Post("signup")
  async signup(@Body() body: SignupDto, @Ip() ip: string) {
    if (tooLongForBcrypt(body.password)) throw new BadRequestException("비밀번호가 너무 깁니다(72바이트, 한글은 약 24자까지).");
    if (this.limits.signupIp.isBlocked(ip)) throw new HttpException("가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    this.limits.signupIp.hit(ip);
    const email = body.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
    return this.db.asSystem(async (query) => {
      const [row] = await query<{ id: string }>(
        "insert into auth.users(email, encrypted_password, raw_user_meta_data) values ($1, $2, $3) on conflict (email) do nothing returning id",
        [email, passwordHash, JSON.stringify({ display_name: body.displayName.trim(), org: body.org?.trim() ?? "" })],
      );
      if (!row) throw new ConflictException("이 이메일로는 가입할 수 없습니다. 이미 가입했다면 로그인해 주세요.");
      return { user: { id: row.id, email }, ...(await this.issue(query, row.id)) };
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
      query<{ id: string; encrypted_password: string }>("select id, encrypted_password from auth.users where email = $1", [email]));
    // 72바이트를 넘는 비밀번호는 bcrypt가 앞부분만 비교하므로 맞았다고 보지 않는다(그런 비밀번호로는 가입할 수 없다).
    const matches = !tooLongForBcrypt(body.password) && await bcrypt.compare(body.password, user?.encrypted_password ?? DUMMY_HASH);
    if (!user || !matches) {
      this.limits.loginPair.hit(key);
      this.limits.loginIp.hit(ip);
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
    // 성공하면 이 이메일의 실패만 지운다. IP 단위 실패는 남긴다(공격자가 자기 계정으로 한 번 성공해 초기화하지 못하게).
    this.limits.loginPair.clear(key);
    return this.db.asSystem(async (query) => {
      await query("update auth.users set last_sign_in_at = now() where id = $1", [user.id]);
      return { user: { id: user.id, email }, ...(await this.issue(query, user.id)) };
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
    const [user] = await this.db.asSystem((query) => query<{ id: string; email: string }>("select id, email from auth.users where id = $1", [userId]));
    if (!user) throw new UnauthorizedException("계정을 찾을 수 없습니다.");
    return user;
  }
}
