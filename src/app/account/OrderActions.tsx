"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelMyOrder } from "@/lib/order-actions";
import { useLocale } from "@/components/LocaleProvider";

/** Nút hủy đơn PENDING trong trang tài khoản. */
export function CancelOrderButton({ id }: { id: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (!confirm(t("account.cancelConfirm"))) return;
    setBusy(true);
    try {
      await cancelMyOrder(id);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("account.cancelFail"));
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
      {busy ? t("account.cancelling") : t("account.cancelOrder")}
    </button>
  );
}
