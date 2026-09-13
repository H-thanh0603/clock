import { describe, expect, it } from 'vitest';
import {
  DELEGATION_MAX_AGE,
  signDelegation,
  verifyDelegationToken,
  signSession,
  verifySessionToken,
} from '../common/session';

/** Delegation JWT: agent hành động thay user — đúng aud, TTL, scope. */
describe('delegation token', () => {
  // signSession cần JWT_SECRET — mỗi run một secret riêng.
  process.env.JWT_SECRET = `TEST_DELEGATION_SECRET_${Date.now()}`;

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
