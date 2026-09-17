import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  SESSION_COOKIE,
  cookieOptions,
  clearCookieOptions,
} from '../common/session';
import { OptionalSessionGuard, RequiredAuthGuard, SessionOnlyGuard } from '../common/guards';
import { CSRF_COOKIE, newCsrfToken } from '../common/csrf.middleware';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../common/session';
import { signDelegation } from '../common/session';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(body.email ?? '', body.password ?? '');
    res.cookie(SESSION_COOKIE, token, cookieOptions);
    return { user };
  }

  @Post('register')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() body: { email?: string; password?: string; name?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.register(
      body.email ?? '',
      body.password ?? '',
      body.name,
    );
    if (user && token) {
      res.cookie(SESSION_COOKIE, token, cookieOptions);
      return { user };
    }
    return {
      user: null,
      message: 'Email này có thể đã được đăng ký. Hãy thử đăng nhập.',
    };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(OptionalSessionGuard)
  async logout(
    @CurrentUser() session: SessionUser | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Thu hồi token server-side + xóa cookie client.
    if (session) await this.auth.revokeSessions(session.id);
    res.cookie(SESSION_COOKIE, '', clearCookieOptions);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(OptionalSessionGuard)
  async me(@CurrentUser() session: SessionUser | null) {
    if (!session) return { user: null };
    return { user: await this.auth.me(session.id) };
  }

  /**
   * Delegation: cấp JWT ngắn hạn (30 phút, aud agent) cho AI concierge
   * hành động thay user đã đăng nhập — agentic web "act on behalf of".
   * Chỉ CUSTOMER; token trở về qua FE → agent host (body), không set cookie.
   */
  @Post('delegation')
  @HttpCode(200)
  @UseGuards(SessionOnlyGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async delegation(@CurrentUser() user: SessionUser) {
    // ponytail: vé delegation không tự gia hạn được nữa vì guard chỉ nhận
    // session cookie; nâng cấp khi cần bằng cách bind parent-session jti.
    if (user.role === 'ADMIN') {
      throw new ForbiddenException('Admin không delegate cho agent shopping');
    }
    const token = await signDelegation(user);
    return { token, expires_in: 30 * 60, scope: 'shop-on-behalf' };
  }

  /** Cấp CSRF token (cookie readable + body) cho double-submit. */
  @Get('csrf')
  csrf(@Res({ passthrough: true }) res: Response) {
    const token = newCsrfToken();
    res.cookie(CSRF_COOKIE, token, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    return { csrfToken: token };
  }

  @Patch('me')
  @HttpCode(200)
  @UseGuards(RequiredAuthGuard)
  async updateProfile(
    @CurrentUser() session: SessionUser,
    @Body() body: { name?: string },
  ) {
    return { user: await this.auth.updateProfile(session.id, body.name) };
  }

  @Post('password')
  @HttpCode(200)
  @UseGuards(RequiredAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @CurrentUser() session: SessionUser,
    @Body() body: { current?: string; next?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(
      session.id,
      body.current ?? '',
      body.next ?? '',
    );
    // Đổi pass thu hồi mọi token (kể cả hiện tại) → client đăng nhập lại.
    res.cookie(SESSION_COOKIE, '', clearCookieOptions);
    return { ok: true };
  }
}
