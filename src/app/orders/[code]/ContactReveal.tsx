"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/api-client";
import { formatUsd, formatVnd } from "@/data/products";
import type { OrderDto } from "@/lib/orders";
import { useLocale } from "@/components/LocaleProvider";

/**
 * Form "xem chi tiết đơn": trang tra đơn public chỉ hiện trạng thái khi
 * chưa chứng minh sở hữu (P1-6). Nhập SĐT/email lúc đặt → BE so khớp
 * (mọi cách viết SĐT) rồi trả full items + totals, render gọn ngay tại chỗ.
 */
export function ContactReveal({ code }: { code: string }) {
  const { t } = useLocale();
  const [contact, setContact] = useState("");
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    if (!contact.trim() || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await csrfFetch(
        `/orders/by-code/${encodeURIComponent(code)}?contact=${encodeURIComponent(contact.trim())}`
      );
      const data = (await res.json().catch(() => null)) as OrderDto | null;
      if (!res.ok || !data || !Array.isArray(data.items)) {
        throw new Error(t("orders.mismatch"));
      }
      setOrder(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("orders.viewFail"));
    } finally {
      setBusy(false);
    }
  };

  if (order) {
    return (
      <div className="mt-space-sm w-full space-y-space-xs border-t border-outline-variant/20 pt-space-md text-left">
        {order.items.map((i) => (
          <div
            key={i.id}
            className="font-body-sm text-body-sm flex items-center justify-between gap-space-sm"
          >
            <span className="text-on-surface">
              {i.name} <span className="text-on-surface-variant/70">× {i.qty}</span>
            </span>
            <span className="text-on-surface-variant">{formatUsd(i.priceUsd * i.qty)}</span>
          </div>
        ))}
        <div className="font-body-md text-body-md flex items-center justify-between pt-space-xs">
          <span className="text-on-surface">{t("orders.grandTotal")}</span>
          <span className="font-display text-xl text-primary">
            {formatUsd(order.totalUsd)} (~{formatVnd(Number(order.totalVnd))})
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-space-sm w-full border-t border-outline-variant/20 pt-space-md">
      <p className="font-body-sm text-body-sm text-on-surface-variant/80">
        {t("orders.ownerOnly")}
      </p>
      <div className="mt-space-xs flex flex-wrap justify-center gap-2">
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && reveal()}
          placeholder={t("orders.contactEmailPh")}
          className="rounded bg-surface-container-high px-3 py-2 text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={reveal}
          disabled={busy || !contact.trim()}
          className="rounded bg-primary px-4 py-2 font-label-spec text-label-spec uppercase text-on-primary disabled:opacity-50"
        >
          {busy ? t("orders.checking") : t("orders.viewDetail")}
        </button>
      </div>
      {error && <p className="mt-space-xs text-body-sm text-error">{error}</p>}
    </div>
  );
}
