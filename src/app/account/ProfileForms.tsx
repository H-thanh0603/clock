"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLocale } from "@/components/LocaleProvider";

/** Đổi tên hiển thị + mật khẩu trong trang tài khoản. */
export function ProfileForms() {
  const { t } = useLocale();
  const { user, updateProfile, changePassword } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const inputCls =
    "w-full bg-surface-container-high px-3 py-2 rounded text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary";

  const saveName = async () => {
    setBusy(true);
    setMsg("");
    try {
      await updateProfile(name);
      setMsg(t("account.nameUpdated"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("account.updateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const savePass = async () => {
    setBusy(true);
    setMsg("");
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setMsg(t("account.passwordChanged"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("account.passwordChangeFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gold-border-card mt-space-md p-6">
      <h2 className="font-title-editorial text-title-editorial text-on-surface">
        {t("account.profileTitle")}
      </h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {user?.email}
      </p>
      <div className="mt-space-sm grid grid-cols-1 gap-space-md md:grid-cols-2">
        <div>
          <label className="font-label-spec text-label-spec mb-1 block tracking-wider text-on-surface-variant uppercase">
            {t("account.displayName")}
          </label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("auth.namePh")}
            />
            <button
              onClick={saveName}
              disabled={busy}
              className="shrink-0 rounded bg-primary px-4 py-2 font-label-spec text-label-spec font-semibold tracking-[0.15em] text-on-primary uppercase hover:bg-secondary disabled:opacity-50"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
        <div>
          <label className="font-label-spec text-label-spec mb-1 block tracking-wider text-on-surface-variant uppercase">
            {t("account.changePassword")}
          </label>
          <div className="flex flex-col gap-2">
            <input
              className={inputCls}
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder={t("account.currentPassword")}
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <input
                className={inputCls}
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder={t("account.newPassword")}
                autoComplete="new-password"
              />
              <button
                onClick={savePass}
                disabled={busy || !current || !next}
                className="shrink-0 rounded bg-primary px-4 py-2 font-label-spec text-label-spec font-semibold tracking-[0.15em] text-on-primary uppercase hover:bg-secondary disabled:opacity-50"
              >
                {t("account.change")}
              </button>
            </div>
          </div>
        </div>
      </div>
      {msg && (
        <p className="font-body-sm text-body-sm mt-3 text-secondary">{msg}</p>
      )}
    </div>
  );
}
