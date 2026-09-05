import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import {
  signSession,
  verifySessionToken,
  sessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  type SessionUser,
} from "@/lib/session";

/**
 * Adapter Node.js (route handlers, server components) cho lib/session.
 * Logic JWT/sống ở lib/session (edge-safe, test được); file này chỉ
 * thêm seam `next/headers` + bcrypt. Re-export để caller cũ không đổi.
 */
export {
  signSession,
  sessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  type SessionUser,
};
export { hashPassword, verifyPassword };

/** Đọc phiên từ cookie của request hiện tại (Node runtime). */
export async function readSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

