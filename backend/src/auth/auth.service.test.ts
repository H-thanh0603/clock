import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { verifySessionToken } from '../common/session';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Test AuthService — cổng bảo mật quan trọng nhất, trước đây 0 test
 * (audit TEST-001). Fake Prisma bằng map in-memory; bcryptjs chạy thật
 * (cost 10, mỗi hash ~80ms — chấp nhận được trong test).
 */

type FakeUser = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  role: string;
  tokenVersion: number;
};

function makePrisma(seed: FakeUser[] = []) {
  const users = new Map(seed.map((u) => [u.email, { ...u }]));
  const prisma = {
    user: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: { where: { id?: string; email?: string } }) =>
          where.id
            ? [...users.values()].find((u) => u.id === where.id) ?? null
            : users.get(where.email!) ?? null,
        ),
      create: vi.fn().mockImplementation(({ data }: { data: Partial<FakeUser> }) => {
        const u: FakeUser = {
          id: 'new-id',
          email: data.email!,
          name: data.name ?? null,
          passwordHash: data.passwordHash ?? null,
          role: data.role ?? 'CUSTOMER',
          tokenVersion: 0,
        };
        users.set(u.email, u);
        return u;
      }),
      update: vi
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id?: string; email?: string };
            data: Partial<FakeUser> & { tokenVersion?: { increment: number } };
          }) => {
            const u = where.id
              ? [...users.values()].find((x) => x.id === where.id)
              : users.get(where.email!);
            if (!u) throw new Error('not found');
            const tv = data.tokenVersion as { increment: number } | number | undefined;
            Object.assign(u, {
              ...data,
              tokenVersion:
                typeof tv === 'object'
                  ? u.tokenVersion + tv.increment
                  : (tv as number | undefined) ?? u.tokenVersion,
            });
            return u;
          },
        ),
    },
  };
  return prisma as unknown as PrismaService;
}

const REAL_HASH = bcrypt.hashSync('CorrectHorse1', 10);

let seq = 0;
beforeAll(() => {
  // signSession cần JWT_SECRET — mỗi run một secret riêng.
  process.env.JWT_SECRET = `TEST_AUTH_SECRET_${Date.now()}_${seq++}`;
});

describe('AuthService.login', () => {
  it('đúng email + mật khẩu → user public + token verify được', async () => {
    const svc = new AuthService(makePrisma([
      { id: 'u1', email: 'a@aurel.local', name: 'A', passwordHash: REAL_HASH, role: 'CUSTOMER', tokenVersion: 0 },
    ]));
    const { user, token } = await svc.login('a@aurel.local', 'CorrectHorse1');
    expect(user).toMatchObject({ id: 'u1', email: 'a@aurel.local', role: 'CUSTOMER' });
    // Không lộ passwordHash ra payload public.
    expect(user).not.toHaveProperty('passwordHash');
    const session = await verifySessionToken(token);
    expect(session).toMatchObject({ id: 'u1', email: 'a@aurel.local', role: 'CUSTOMER' });
  });

  it('sai mật khẩu → 401 Unauthorized', async () => {
    const svc = new AuthService(makePrisma([
      { id: 'u1', email: 'a@aurel.local', name: 'A', passwordHash: REAL_HASH, role: 'CUSTOMER', tokenVersion: 0 },
    ]));
    await expect(svc.login('a@aurel.local', 'WrongPass1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('user không tồn tại → 401 (không leak email nào tồn tại)', async () => {
    const svc = new AuthService(makePrisma());
    await expect(svc.login('ghost@aurel.local', 'Whatever1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('email normalize + trim (A@AUREL.LOCAL ≡ a@aurel.local)', async () => {
    const svc = new AuthService(makePrisma([
      { id: 'u1', email: 'a@aurel.local', name: 'A', passwordHash: REAL_HASH, role: 'CUSTOMER', tokenVersion: 0 },
    ]));
    const { user } = await svc.login('  A@AUREL.LOCAL ', 'CorrectHorse1');
    expect(user.id).toBe('u1');
  });
});

describe('AuthService.register', () => {
  it('email mới + pass hợp lệ → user + token', async () => {
    const svc = new AuthService(makePrisma());
    const { user, token } = await svc.register('new@x.com', 'Secret1', ' New ');
    expect(user).toMatchObject({ email: 'new@x.com', name: 'New', role: 'CUSTOMER' });
    const session = await verifySessionToken(token!);
    expect(session?.id).toBe('new-id');
  });

  it('email đã tồn tại → { user: null } KHÔNG throw (chống enumeration)', async () => {
    const svc = new AuthService(makePrisma([
      { id: 'u1', email: 'dup@x.com', name: null, passwordHash: REAL_HASH, role: 'CUSTOMER', tokenVersion: 0 },
    ]));
    // Quan trọng: không reject — response giống user mới ngoài flow client.
    const r = await svc.register('dup@x.com', 'AnyPass1');
    expect(r.user).toBeNull();
    expect(r.token).toBeNull();
  });

  it('email rác → 400', async () => {
    const svc = new AuthService(makePrisma());
    await expect(svc.register('not-an-email', 'Secret1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mật khẩu ngắn hơn 6 → 400', async () => {
    const svc = new AuthService(makePrisma());
    await expect(svc.register('ok@x.com', 'abc')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mật khẩu dài quá 72 byte (bcrypt cap) → 400 chống CPU-DoS', async () => {
    const svc = new AuthService(makePrisma());
    const longPw = 'x'.repeat(80);
    await expect(svc.register('ok@x.com', longPw)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuthService.revokeSessions / changePassword (tokenVersion)', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = `TEST_AUTH_SECRET_${Date.now()}_${seq++}`;
  });

  it('revokeSessions tăng tokenVersion → token cũ verify thất bại (logout thật)', async () => {
    const prisma = makePrisma([
      { id: 'u1', email: 'a@x.com', name: 'A', passwordHash: REAL_HASH, role: 'CUSTOMER', tokenVersion: 0 },
    ]);
    const svc = new AuthService(prisma);
    const { token } = await svc.login('a@x.com', 'CorrectHorse1');
    expect(await verifySessionToken(token)).not.toBeNull();
    await svc.revokeSessions('u1');
    // Token подпись vẫn hợp lệ nhưng v=0 ≠ tokenVersion=1 — guard sẽ chặn.
    const session = await verifySessionToken(token);
    expect(session?.v).toBe(0);
    // Đăng nhập lại nhận token v mới.
    const again = await svc.login('a@x.com', 'CorrectHorse1');
    expect((await verifySessionToken(again.token))?.v).toBe(1);
  });

  it('changePassword: sai pass hiện tại → 401, không đổi gì', async () => {
    const prisma = makePrisma([
      { id: 'u1', email: 'a@x.com', name: 'A', passwordHash: REAL_HASH, role: 'CUSTOMER', tokenVersion: 0 },
    ]);
    const svc = new AuthService(prisma);
    await expect(
      svc.changePassword('u1', 'WrongCurrent1', 'NewSecret1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('changePassword đúng → hash mới + tokenVersion tăng (mọi phiên cũ chết)', async () => {
    const prisma = makePrisma([
      { id: 'u1', email: 'a@x.com', name: 'A', passwordHash: REAL_HASH, role: 'CUSTOMER', tokenVersion: 0 },
    ]);
    const svc = new AuthService(prisma);
    await svc.changePassword('u1', 'CorrectHorse1', 'NewSecret1');
    // Login bằng pass cũ fail, pass mới thành công.
    await expect(svc.login('a@x.com', 'CorrectHorse1')).rejects.toBeInstanceOf(UnauthorizedException);
    const r = await svc.login('a@x.com', 'NewSecret1');
    expect((await verifySessionToken(r.token))?.v).toBe(1);
  });

  it('user không có passwordHash (OAuth-only tương lai) → 401 khi changePassword', async () => {
    const svc = new AuthService(makePrisma([
      { id: 'u1', email: 'a@x.com', name: 'A', passwordHash: null, role: 'CUSTOMER', tokenVersion: 0 },
    ]));
    await expect(
      svc.changePassword('u1', 'Any1', 'NewSecret1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
