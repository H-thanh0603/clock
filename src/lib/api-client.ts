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
