import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { OptionalSessionGuard } from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../common/session';

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
}
