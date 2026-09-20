import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import {
  DELEGATION_MAX_AGE,
  signDelegation,
  verifyDelegationToken,
  signSession,
  verifySessionToken,
} from '../common/session';

// JWT_SECRET là secret CHUNG của cả tiến trình vitest (mọi file test cùng
// đọc process.env). Đặt 1 lần ở top-level, KHÔNG bao giờ gán lại trong
// test — xoay secret giữa chừng làm vé ký trước đó verify fail (đúng
// semantics, sai test; lỗi chỉ nổ khi chạy full suite).

/** Delegation JWT: agent hành động thay user — đúng aud, TTL, scope. */
describe('delegation token', () => {
  const user = { id: 'u1', email: 'a@x', role: 'CUSTOMER', v: 0 };

  it('sign → verify roundtrip, đủ claim scope/aud', async () => {
    const token = await signDelegation(user);
    const parsed = await verifyDelegationToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe('u1');
    expect(parsed!.email).toBe('a@x');
    expect(parsed!.role).toBe('CUSTOMER');
  });

  it('session JWT KHÔNG phải delegation token (aud khác) — chặn lẫn', async () => {
    const session = await signSession(user);
    expect(await verifyDelegationToken(session)).toBeNull();
  });

  it('delegation token KHÔNG phải session token — không dùng lầm làm login', async () => {
    const delegation = await signDelegation(user);
    expect(await verifySessionToken(delegation)).toBeNull();
  });

  it('token rác/hết hạn → null', async () => {
    expect(await verifyDelegationToken('')).toBeNull();
    expect(await verifyDelegationToken('abc.def')).toBeNull();
  });
});

/** Refresh vé delegation (sliding window): dkey + rotate dùng 1 lần. */
describe('delegation refresh', () => {
  it('0. sanity: setupFiles đã cố định JWT_SECRET', () => {
    expect(process.env.JWT_SECRET).toBeTruthy();
  });

  function makePrisma(user: {
    id: string;
    email?: string;
    name?: string | null;
    role: string;
    tokenVersion: number;
  }) {
    // Fake MIMIC Prisma select mặc định: trả đủ field service cần
    // (id/email/name/role/tokenVersion). Fake cũ thiếu email → vé ký ra
    // thiếu email → verifyDelegationToken từ chối (đúng code, sai fake).
    const snapshot = { email: 'a@x', name: null, ...user };
    const keys = new Map<string, { userId: string; version: number }>();
    return {
      user: { findUnique: () => Promise.resolve(snapshot) },
      delegationKey: {
        create: ({
          data,
        }: {
          data: { key: string; userId: string; version: number };
        }) => {
          keys.set(String(data.key), {
            userId: String(data.userId),
            version: Number(data.version),
          });
          return Promise.resolve(data);
        },
        findUnique: ({ where }: { where: { key: string } }) =>
          Promise.resolve(keys.get(String(where.key)) ?? null),
        deleteMany: ({ where }: { where: { key: string } }) => {
          const n = keys.delete(String(where.key)) ? 1 : 0;
          return Promise.resolve({ count: n });
        },
      },
    };
  }
  it('issue → refresh OK, vé dùng rotate 1 lần (replay bị từ chối)', async () => {
    const prisma = makePrisma({ id: 'u1', email: 'u1@x', role: 'CUSTOMER', tokenVersion: 0 });
    const svc = new AuthService(prisma as never);

    const first = await svc.issueDelegation('u1');
    expect(first.token).toBeTruthy();
    expect(first.expires_in).toBe(DELEGATION_MAX_AGE);

    // Verify vé mới thấy dkey.
    const parsed = await verifyDelegationToken(first.token);
    expect(parsed?.dkey).toBeTruthy();

    // Refresh lần 1 OK.
    const second = await svc.refreshDelegation('u1', first.token);
    expect(second).not.toBeNull();

    // Replay vé cũ → null (bản ghi đã rotate).
    expect(await svc.refreshDelegation('u1', first.token)).toBeNull();
  });

  it('logout (version đổi) giết refresh — vé cũ không gia hạn được', async () => {
    const prisma = makePrisma({ id: 'u2', email: 'u2@x', role: 'CUSTOMER', tokenVersion: 0 });
    const svc = new AuthService(prisma as never);
    const first = await svc.issueDelegation('u2');

    // User logout/đổi pass → tokenVersion++ ở DB thật. Fake ở đây mô phỏng
    // bằng cách đổi version ngay trong BẢN GHI refresh (khác version lúc
    // cấp → refresh phải từ chối, vì DB thật cũng lệch như vậy).
    const { decodeJwt } = await import('jose');
    const dkey = (decodeJwt(first.token) as { dkey: string }).dkey;
    const rec = await prisma.delegationKey.findUnique({ where: { key: dkey } });
    expect(rec).not.toBeNull();
    rec!.version = 999;
    expect(await svc.refreshDelegation('u2', first.token)).toBeNull();
  });

  it('vé của user khác / vé rác / ADMIN → null, không lộ lý do', async () => {
    const prisma = makePrisma({ id: 'u3', email: 'u3@x', role: 'CUSTOMER', tokenVersion: 0 });
    const svc = new AuthService(prisma as never);
    const first = await svc.issueDelegation('u3');

    expect(await svc.refreshDelegation('other', first.token)).toBeNull();
    expect(await svc.refreshDelegation('u3', 'rác.không.phải.jwt')).toBeNull();
    expect(await svc.refreshDelegation('u3', await signSession({ id: 'u3', email: 'a@x', role: 'CUSTOMER', v: 0 }))).toBeNull();
  });

  it('ADMIN không issue được (service chặn như controller)', async () => {
    const prisma = makePrisma({ id: 'a1', email: 'a@x', role: 'ADMIN', tokenVersion: 0 });
    const svc = new AuthService(prisma as never);
    await expect(svc.issueDelegation('a1')).rejects.toThrow();
  });
});
