"use client";

/**
 * Nhãn trạng thái đơn dùng chung (account + orders/[code]).
 *
 * Server component không đọc được locale từ context (context là client-only),
 * nên 2 trang này là server component đọc locale từ cookie `aurel-locale`
 * (do LocaleProvider đồng bộ mỗi khi user đổi). Client component nhỏ
 * (OrderActions, nút hủy) thì dùng `t()` như thường.
 */

import { useLocale } from "@/components/LocaleProvider";

export const ORDER_STATUS_VI: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PAID: "Đã thanh toán",
  SHIPPED: "Đang vận chuyển",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  REFUNDED: "Đã hoàn tiền",
};

export const ORDER_STATUS_EN: Record<string, string> = {
  PENDING: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  PAID: "Paid",
  SHIPPED: "In transit",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

/** Nhãn theo locale hiện tại (client component). */
export function useOrderStatusLabel() {
  const { locale } = useLocale();
  const map = locale === "en" ? ORDER_STATUS_EN : ORDER_STATUS_VI;
  return (status: string) => map[status] ?? status;
}

/** Nhãn cho server component (đọc locale từ cookie, không cần context). */
export function orderStatusLabel(status: string, locale: string): string {
  const map = locale === "en" ? ORDER_STATUS_EN : ORDER_STATUS_VI;
  return map[status] ?? status;
}

/** Đọc locale đã lưu (server-side, từ cookie). */
export async function serverLocale(): Promise<"vi" | "en"> {
  try {
    const { cookies } = await import("next/headers");
    const v = (await cookies()).get("aurel-locale")?.value;
    return v === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}
