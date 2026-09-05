"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelMyOrder } from "@/lib/order-actions";

/** Nút hủy đơn PENDING trong trang tài khoản. */
export function CancelOrderButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (!confirm("Quý khách chắc chắn muốn hủy đơn này? Kho sẽ được hoàn lại.")) return;
    setBusy(true);
    try {
      await cancelMyOrder(id);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Không hủy được đơn");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={cancel}
      disabled={busy}
      className="font-label-spec text-label-spec tracking-[0.2em] text-error uppercase hover:underline disabled:opacity-50"
    >
      {busy ? "Đang hủy..." : "Hủy đơn"}
    </button>
  );
}
