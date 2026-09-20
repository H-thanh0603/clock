import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { SessionOnlyGuard } from './guards';
import {
  signDelegation,
  signSession,
  DELEGATION_COOKIE,
  SESSION_COOKIE,
} from './session';
import type { ExecutionContext } from '@nestjs/common';


const user = { id: 'u1', email: 'a@x', role: 'CUSTOMER', v: 0 };
const prisma = {
  user: { findUnique: vi.fn(async () => ({ ...user, tokenVersion: 0 })) },
} as never;

function ctxWith(cookies: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ cookies }) }),
  } as never;
}

/** NV-1: POST /auth/delegation chỉ nhận session cookie, không nhận delegation. */
describe('SessionOnlyGuard', () => {
  it('session cookie → pass', async () => {
    const token = await signSession(user);
    const guard = new SessionOnlyGuard(prisma);
    const ctx = ctxWith({ [SESSION_COOKIE]: token });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('chỉ delegation cookie → 401 (không tự gia hạn)', async () => {
    const token = await signDelegation(user);
    const guard = new SessionOnlyGuard(prisma);
    const ctx = ctxWith({ [DELEGATION_COOKIE]: token });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
