import { SignJWT, jwtVerify } from 'jose';

/**
 * Lõi phiên JWT (port từ frontend src/lib/session, giữ nguyên semantics).
 * Cookie giờ là cross-site (FE :3000 → BE :4000) nên dùng SameSite=None + Secure
 * (trình duyệt vẫn chấp nhận Secure cookie trên http://localhost).
 */
export const SESSION_COOKIE = 'aurel_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 ngày

export type SessionUser = {
  id: string;
  email: string;
  role: string;
  /** Phiên bản token — logout/đổi pass tăng version để vô hiệu token cũ. */
  v: number;
};

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
