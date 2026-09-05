import { SignJWT, jwtVerify } from "jose";

/**
 * Lõi phiên làm việc thuần (edge-safe): KHÔNG import `next/headers`,
 * `@/lib/db` hay bcrypt — chỉ xử lý JWT + chuỗi cookie.
 * Dùng được cả ở middleware (edge runtime) lẫn route handlers (node).
 */
export const SESSION_COOKIE = "aurel_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 ngày

export type SessionUser = { id: string; email: string; role: string };

export function sessionSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("Thiếu JWT_SECRET trong .env");
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(sessionSecret());
}

/** Xác thực token → SessionUser | null. Token rỗng/sai/hết hạn → null. */
export async function verifySessionToken(
  token?: string | null
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string")
      return null;
    return {
      id: payload.sub,
      email: payload.email,
      role: (payload.role as string) ?? "CUSTOMER",
    };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
