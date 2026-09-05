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
] as const;

const STATUS_VN: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PAID: "Đã thanh toán",
  SHIPPED: "Đang vận chuyển",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
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
    setValue(next);
    setBusy(true);
    try {
      const res = await csrfFetch(`/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setValue(status);
        alert("Cập nhật thất bại");
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
