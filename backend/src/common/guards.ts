import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  SESSION_COOKIE,
  DELEGATION_COOKIE,
  verifySessionToken,
  verifyDelegationToken,
  type SessionUser,
} from './session';

declare module 'express' {
  interface Request {
    sessionUser?: SessionUser | null;
  }
}

/**
 * Session của request: cookie session JWT, HOẶC cookie delegation JWT
 * (AI concierge hành động thay user — aud 'aurel-agent', TTL 30 phút).
 * Hai loại token không lẫn được nhau: verify có check aud/scope.
 */
async function readSession(req: Request): Promise<SessionUser | null> {
  const session = await verifySessionToken(req.cookies?.[SESSION_COOKIE]);
  if (session) return session;
  return verifyDelegationToken(req.cookies?.[DELEGATION_COOKIE]);
}

/**
 * Kiểm tra tokenVersion: logout/đổi pass tăng version → token cũ vô hiệu.
 * Trả về user DB (đã gồm role mới nhất) hoặc null.
 */
async function verifiedUser(
  prisma: PrismaService,
  session: SessionUser | null,
) {
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || user.tokenVersion !== session.v) return null;
  return user;
}

/** Gắn session (hoặc null) vào request, không chặn. */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const session = await readSession(req);
    req.sessionUser =
      session && (await verifiedUser(this.prisma, session)) ? session : null;
    return true;
  }
}

/** Bắt buộc đăng nhập (401 nếu không có session). */
@Injectable()
export class RequiredAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const session = await readSession(req);
    const user = await verifiedUser(this.prisma, session);
    if (!user) throw new UnauthorizedException('Chưa đăng nhập');
    req.sessionUser = session;
    return true;
  }
}

/** Bắt buộc role ADMIN (401 chưa login, 403 không đủ quyền — check role trong DB). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const session = await readSession(req);
    const user = await verifiedUser(this.prisma, session);
    if (!user) throw new UnauthorizedException('Chưa đăng nhập');
    if (user.role !== 'ADMIN') throw new ForbiddenException('Không có quyền');
    req.sessionUser = session;
    return true;
  }
}
