"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelGuestOrder } from "@/lib/order-actions";
import { useLocale } from "@/components/LocaleProvider";

/** Hủy đơn vãng lai: nhập SĐT liên lạc để xác thực sở hữu. */
export function CancelGuestButton({ code }: { code: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (!contact.trim()) return;
    setBusy(true);
    try {
      await cancelGuestOrder(code, contact);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("account.cancelFail"));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="font-label-spec text-label-spec tracking-[0.2em] text-error uppercase hover:underline"
      >
        {t("orders.cancelThis")}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder={t("orders.contactPh")}
        className="rounded bg-surface-container-high px-3 py-2 text-body-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        onClick={cancel}
        disabled={busy || !contact.trim()}
        className="rounded bg-error px-4 py-2 font-label-spec text-label-spec tracking-[0.2em] text-white uppercase disabled:opacity-50"
      >
        {busy ? t("account.cancelling") : t("orders.confirmCancel")}
      </button>
    </div>
  );
}
