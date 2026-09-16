"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-client";

/**
 * Tự đồng bộ trạng thái đơn sau redirect VNPay (P2-2).
 *
 * Vấn đề: IPN/return đến chậm hơn trình duyệt vài giây → trang hiện
 * "paid=0 / PENDING" trong khi tiền đã vào, khách hoang mang bấm F5 liên tục
 * (hoặc tệ hơn: tưởng chưa trả, trả lại lần nữa).
 * Poller hỏi lại BE mỗi 5s (tối đa 60s) khi đơn còn PENDING; status đổi →
 * router.refresh() để server component vẽ lại toàn trang.
 * Chỉ đọc status công khai (kèm sig nếu có) — không lộ gì thêm.
 */
export function OrderStatusPoller({
  code,
  sig,
  initialStatus,
}: {
  code: string;
  sig?: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(initialStatus === "PENDING");
  const tries = useRef(0);

  useEffect(() => {
    if (initialStatus !== "PENDING") {
      setSyncing(false);
      return;
    }
    setSyncing(true);
    tries.current = 0;
    const t = setInterval(async () => {
      tries.current++;
      try {
        const q = sig ? `?sig=${encodeURIComponent(sig)}` : "";
        const r = await fetch(
          apiUrl(`/orders/by-code/${encodeURIComponent(code)}${q}`),
          { cache: "no-store" }
        );
        const d = (await r.json().catch(() => null)) as {
          status?: string;
        } | null;
        if (d?.status && d.status !== "PENDING") {
          clearInterval(t);
          setSyncing(false);
          router.refresh();
          return;
        }
      } catch {
        // Lỗi mạng 1 vòng → thử lại vòng sau, không báo ồn.
      }
      if (tries.current >= 12) {
        clearInterval(t);
        setSyncing(false);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [code, sig, initialStatus, router]);

  if (!syncing) return null;
  return (
    <p className="font-body-sm text-body-sm text-on-surface-variant/70 animate-pulse">
      Đang đồng bộ trạng thái thanh toán…
    </p>
  );
}
