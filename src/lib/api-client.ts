/**
 * Helper URL backend NestJS — dùng được cả client lẫn server (không chạm
 * next/headers). Logic fetch + forward cookie nằm ở lib/api (server-only).
 */

export function backendBase(): string {
  if (typeof window === "undefined") {
    return process.env.BACKEND_URL ?? "http://localhost:4000";
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
}

export function apiUrl(path: string): string {
  const base = backendBase().replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

const CSRF_COOKIE = "aurel_csrf";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * fetch client kèm CSRF double-submit (backend yêu cầu header x-csrf-token
 * khớp cookie cho mọi POST/PATCH/PUT/DELETE ngoài login/register).
 */
export async function csrfFetch(path: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    let token = readCookie(CSRF_COOKIE);
    if (!token) {
      const r = await fetch(apiUrl("/auth/csrf"), { credentials: "include" });
      const data = (await r.json().catch(() => null)) as {
        csrfToken?: string;
      } | null;
      token = data?.csrfToken ?? readCookie(CSRF_COOKIE);
    }
    if (token) headers.set("x-csrf-token", token);
  }
  return fetch(apiUrl(path), { ...init, headers, credentials: "include" });
}
