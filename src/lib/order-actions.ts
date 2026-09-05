"use client";

import { csrfFetch } from "@/lib/api-client";

function errMsg(data: unknown, fallback: string): string {
  const m = (data as { message?: string | string[] } | null)?.message;
  return (Array.isArray(m) ? m.join(", ") : m) ?? fallback;
}

/** Hủy đơn của chính mình (chỉ PENDING). */
export async function cancelMyOrder(id: string): Promise<void> {
  const res = await csrfFetch(`/orders/${id}/cancel`, { method: "POST" });
  if (!res.ok) {
    throw new Error(errMsg(await res.json().catch(() => null), "Không hủy được đơn"));
  }
}

/** Hủy đơn vãng lai bằng mã + SĐT liên lạc. */
export async function cancelGuestOrder(
  code: string,
  contact: string
): Promise<void> {
  const res = await csrfFetch(
    `/orders/by-code/${encodeURIComponent(code)}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact }),
    }
  );
  if (!res.ok) {
    throw new Error(errMsg(await res.json().catch(() => null), "Không hủy được đơn"));
  }
}
