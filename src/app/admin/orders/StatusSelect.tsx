"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/api-client";

const STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;

const STATUS_VN: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PAID: "Đã thanh toán",
  SHIPPED: "Đang vận chuyển",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  REFUNDED: "Đã hoàn tiền",
};

export function StatusSelect({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [busy, setBusy] = useState(false);

  const change = async (next: string) => {
    // Hoàn tiền / xác nhận thu thủ công bắt buộc có mã tham chiếu (backend
    // cũng validate) — hỏi ngay ở backoffice để admin không phải nhớ.
    // Hủy bỏ prompt = không làm gì.
    let refundRef: string | undefined;
    let paymentRef: string | undefined;
    if (next === "REFUNDED") {
      const ref = window.prompt(
        "Mã tham chiếu hoàn tiền (VD mã giao dịch hoàn trên cổng VNPay):"
      );
      if (!ref || !ref.trim()) {
        setValue(status);
        return;
      }
      refundRef = ref.trim();
    }
    if (next === "PAID") {
      const ref = window.prompt(
        "Mã tham chiếu thu tiền (VD mã giao dịch chuyển khoản đã nhận):"
      );
      if (!ref || !ref.trim()) {
        setValue(status);
        return;
      }
      paymentRef = ref.trim();
    }
    setValue(next);
    setBusy(true);
    try {
      const res = await csrfFetch(`/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: next, refundRef, paymentRef }),
      });
      if (!res.ok) {
        setValue(status);
        const data = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = Array.isArray(data?.message)
          ? data.message.join(", ")
          : data?.message;
        alert(msg ?? "Cập nhật thất bại");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
      className="border border-outline-variant/40 bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_VN[s]}
        </option>
      ))}
    </select>
  );
}
