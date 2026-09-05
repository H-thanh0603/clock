import { cookies } from "next/headers";
import { apiUrl } from "@/lib/api-client";

/**
 * SERVER-ONLY: fetch JSON tới backend NestJS riêng.
 * forwardCookies=true → forward cookie request hiện tại (phiên) sang backend.
 * Không import file này từ Client Component (nó kéo next/headers).
 */

type ApiOptions = RequestInit & {
  forwardCookies?: boolean;
  /** Tag cho Next cache (chỉ có tác dụng ở Server Components). */
  next?: { revalidate?: number };
};

/** fetch JSON tới backend, throw Error(message) khi backend trả lỗi. */
export async function apiJson<T>(
  path: string,
  init?: ApiOptions
): Promise<T> {
  const { forwardCookies, next, ...rest } = init ?? {};
  const headers = new Headers(rest.headers);
  if (forwardCookies) {
    const cookie = (await cookies()).toString();
    if (cookie) headers.set("Cookie", cookie);
  }
  if (rest.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(apiUrl(path), {
    ...rest,
    headers,
    // Catalog/statics cache 60s; mặc định no-store cho dữ liệu phiên.
    ...(next ? { next } : { cache: "no-store" }),
  });
  const data = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  if (!res.ok) {
    const msg =
      (Array.isArray(data?.message) ? data.message.join(", ") : data?.message) ??
      data?.error ??
      `Backend ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}
