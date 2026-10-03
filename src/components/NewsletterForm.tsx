"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/api-client";
import { useLocale } from "./LocaleProvider";

/**
 * Đăng ký nurture email (footer) — POST /newsletter. Trước đây form không
 * có handler (nút bấm "cho vui"); giờ lưu thật để nuôi khách tier entry /
 * pre-owned — funnel dài của ngành đồng hồ (research: quyết định 3-9 tháng).
 */
export default function NewsletterForm() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      const res = await csrfFetch("/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), source: "footer" }),
      });
      if (!res.ok) throw new Error();
      setState("done");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <p className="flex items-center gap-space-xs font-body-sm text-body-sm text-primary">
        <span className="material-symbols-outlined text-[18px]">check</span>
        {t("footer.newsletterDone")}
      </p>
    );
  }

  return (
    <form className="flex flex-col gap-space-xs" onSubmit={submit}>
      <div className="relative">
        <input
          aria-label={t("footer.newsletterPlaceholder")}
          className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={t("footer.newsletterPlaceholder")}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
        />
        <button
          className="mt-space-sm w-full py-space-sm px-space-md rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.15em] hover:bg-secondary transition-colors font-semibold flex items-center justify-center gap-space-xs disabled:opacity-60"
          type="submit"
          disabled={state === "sending"}
        >
          <span>{state === "sending" ? "..." : t("footer.joinCircle")}</span>
          <span className="material-symbols-outlined text-[16px]">east</span>
        </button>
      </div>
      {state === "error" && (
        <p className="font-body-sm text-body-sm text-error">
          {t("footer.newsletterError")}
        </p>
      )}
    </form>
  );
}
