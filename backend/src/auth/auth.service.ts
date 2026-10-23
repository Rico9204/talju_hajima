import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('이미 등록된 이메일입니다.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
    });

    return this.buildTokenResponse(user.id, user.email, user.name);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`로그인 시도 횟수를 초과해 잠겼습니다. ${minutesLeft}분 뒤 다시 시도해주세요.`);
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      await this.usersService.registerFailedLogin(user.id);
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    await this.usersService.clearFailedLogins(user.id);
    return this.buildTokenResponse(user.id, user.email, user.name);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('로그인이 필요합니다.');
    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다.');
    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.usersService.updatePasswordHash(userId, passwordHash);
    return this.buildTokenResponse(user.id, user.email, user.name);
  }

  private buildTokenResponse(userId: string, email: string, name: string) {
    const accessToken = this.jwtService.sign({ sub: userId, email });
    return { accessToken, user: { id: userId, email, user_metadata: { display_name: name } } };
  }
}
