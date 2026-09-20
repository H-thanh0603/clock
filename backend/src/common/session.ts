import { randomUUID } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Lõi phiên JWT (port từ frontend src/lib/session, giữ nguyên semantics).
 * Cookie giờ là cross-site (FE :3000 → BE :4000) nên dùng SameSite=None + Secure
 * (trình duyệt vẫn chấp nhận Secure cookie trên http://localhost).
 */
export const SESSION_COOKIE = 'aurel_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 ngày
/** Delegation token: AI agent hành động thay user — ngắn hạn, aud riêng. */
export const DELEGATION_MAX_AGE = 60 * 30; // 30 phút
/**
 * Cookie mà agent host gắn khi gọi BE thay user. Tên khác session cookie
 * (không bao giờ bị browser FE set — agent host là client server-side).
 */
export const DELEGATION_COOKIE = 'aurel_delegation';

export type SessionUser = {
  id: string;
  email: string;
  role: string;
  /** Phiên bản token — logout/đổi pass tăng version để vô hiệu token cũ. */
  v: number;
  /**
   * True khi request đến từ delegation token (agent hành động thay user),
   * false/undefined khi là phiên browser thật. Dùng để quyết định có tin
   * header `x-aurel-actor` hay không (chống giả danh từ browser).
   */
  viaAgent?: boolean;
  /**
   * Khóa refresh của delegation (payload.dkey). Vé vắng dkey = vé cấp trước
   * đợt nâng cấp này → không refresh được (FE xin vé mới qua /delegation).
   */
  dkey?: string;
};

/**
 * Header do agent host gửi để tự khai danh tính khi hành động thay user.
 * CHỈ được tin khi phiên là delegation (`viaAgent`) — browser không thể
 * set header này để giả danh vì session cookie thật không có `viaAgent`.
 */
export const ACTOR_HEADER = 'x-aurel-actor';

export function sessionSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('Thiếu JWT_SECRET trong .env');
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, v: user.v ?? 0 })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer('aurel-backend')
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(sessionSecret());
}

/**
 * Delegation JWT: AI agent concierge hành động thay user (agentic web —
 * "act on behalf of"). Khác session: aud='aurel-agent' (agent host verify
 * được), TTL 30 phút, và chỉ cấp cho CUSTOMER (admin không delegate cho
 * agent shopping — tách quyền).
 *
 * Refresh không cần mật khẩu: JWT mang `dkey` (delegation key) trỏ vào bản
 * ghi volatile bên BE (`refreshDelegation`, TTL +24h so với vé). FE đưa vé
 * cũ → BE đối chiếu session cookie còn sống (user chưa logout) rồi cấp vé
 * mới. User logout/đổi pass → version đổi → vé cũ lẫn bản ghi đều chết.
 */
export async function signDelegation(
  user: SessionUser,
  dkey?: string,
): Promise<string> {
  return new SignJWT({
    email: user.email,
    role: user.role,
    v: user.v ?? 0,
    scope: 'shop-on-behalf',
    dkey: dkey ?? randomUUID(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer('aurel-backend')
    .setAudience('aurel-agent')
    .setExpirationTime(`${DELEGATION_MAX_AGE}s`)
    .sign(sessionSecret());
}

/** Verify delegation token (aud agent). Sai/hết hạn → null. */
export async function verifyDelegationToken(
  token?: string | null,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ['HS256'],
      issuer: 'aurel-backend',
      audience: 'aurel-agent',
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string')
      return null;
    if (payload.scope !== 'shop-on-behalf') return null;
    return {
      id: payload.sub,
      email: payload.email,
      role: (payload.role as string) ?? 'CUSTOMER',
      v: typeof payload.v === 'number' ? payload.v : 0,
      viaAgent: true,
      // dkey có thể vắng ở vé cấp trước đợt nâng cấp — refresh lúc đó 403.
      dkey: typeof payload.dkey === 'string' ? payload.dkey : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Danh tính ghi vào audit trail của 1 hành động ghi.
 *
 * - Browser thật (session cookie) → luôn dùng `byUserId` của phiên, KHÔNG
 *   bao giờ đọc `x-aurel-actor` (tránh giả danh).
 * - Delegation (agent thay user) → nếu agent gửi `x-aurel-actor` hợp lệ
 *   thì ghi `id:agent/...` để phân biệt với thao tác thủ công của user.
 *   Whitelist định dạng, không nhận chuỗi tự do → không thể nhét rác/PII.
 */
export function resolveActor(
  user: SessionUser | null | undefined,
  rawActor?: string | null,
): string | undefined {
  if (!user) return undefined;
  if (!user.viaAgent) return user.id;
  const claimed = typeof rawActor === 'string' ? rawActor.trim() : '';
  if (!/^[a-z_]{1,32}\/[A-Za-z0-9_.:@-]{1,96}$/.test(claimed)) return user.id;
  return claimed;
}

/** Xác thực token → SessionUser | null. Token rỗng/sai/hết hạn → null. */
export async function verifySessionToken(
  token?: string | null,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ['HS256'],
      issuer: 'aurel-backend',
    });
    // Session cookie KHÔNG được có aud/scope — nếu có thì đó là token
    // loại khác (delegation), dùng làm session = leo thang quyền.
    if (payload.aud !== undefined || payload.scope !== undefined) return null;
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string')
      return null;
    return {
      id: payload.sub,
      email: payload.email,
      role: (payload.role as string) ?? 'CUSTOMER',
      v: typeof payload.v === 'number' ? payload.v : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Cookie cross-port localhost (:3000 ↔ :4000) là cùng-site (site không tính
 * port) nên SameSite=Lax ĐỦ cho dev. Deploy khác domain + HTTPS thì đặt
 * COOKIE_SAMESITE=none + COOKIE_SECURE=true.
 */
function cookieSameSite(): 'lax' | 'none' {
  return process.env.COOKIE_SAMESITE === 'none' ? 'none' : 'lax';
}

function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE !== undefined)
    return process.env.COOKIE_SECURE === 'true';
  return cookieSameSite() === 'none';
}

function cookieString(token: string, maxAge: number): string {
  const sameSite = cookieSameSite() === 'none' ? 'None' : 'Lax';
  const secure = cookieSecure() ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=${sameSite}${secure}; Max-Age=${maxAge}`;
}

export const cookieOptions = {
  httpOnly: true,
  path: '/',
  get sameSite() {
    return cookieSameSite();
  },
  get secure() {
    return cookieSecure();
  },
  maxAge: SESSION_MAX_AGE * 1000,
};

export const clearCookieOptions = {
  httpOnly: true,
  path: '/',
  get sameSite() {
    return cookieSameSite();
  },
  get secure() {
    return cookieSecure();
  },
  maxAge: 0,
};

/** Chuỗi Set-Cookie thuần (giữ để test + tương thích với bản frontend cũ). */
export function sessionCookie(token: string): string {
  return cookieString(token, SESSION_MAX_AGE);
}

export function clearSessionCookie(): string {
  return cookieString('', 0);
}
