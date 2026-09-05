"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

/** Đổi tên hiển thị + mật khẩu trong trang tài khoản. */
export function ProfileForms() {
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
      setMsg("Đã cập nhật danh xưng.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Cập nhật thất bại");
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
      setMsg("Đã đổi mật khẩu. Hãy đăng nhập lại.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Đổi mật khẩu thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gold-border-card mt-space-md p-6">
      <h2 className="font-title-editorial text-title-editorial text-on-surface">
        Hồ Sơ Thượng Khách
      </h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {user?.email}
      </p>
      <div className="mt-space-sm grid grid-cols-1 gap-space-md md:grid-cols-2">
        <div>
          <label className="font-label-spec text-label-spec mb-1 block tracking-wider text-on-surface-variant uppercase">
            Danh xưng & họ tên
          </label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ngài / Bà..."
            />
            <button
              onClick={saveName}
              disabled={busy}
              className="shrink-0 rounded bg-primary px-4 py-2 font-label-spec text-label-spec font-semibold tracking-[0.15em] text-on-primary uppercase hover:bg-secondary disabled:opacity-50"
            >
              Lưu
            </button>
          </div>
        </div>
        <div>
          <label className="font-label-spec text-label-spec mb-1 block tracking-wider text-on-surface-variant uppercase">
            Đổi mật khẩu
          </label>
          <div className="flex flex-col gap-2">
            <input
              className={inputCls}
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Mật khẩu hiện tại"
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <input
                className={inputCls}
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="Mật khẩu mới (6-72 ký tự)"
                autoComplete="new-password"
              />
              <button
                onClick={savePass}
                disabled={busy || !current || !next}
                className="shrink-0 rounded bg-primary px-4 py-2 font-label-spec text-label-spec font-semibold tracking-[0.15em] text-on-primary uppercase hover:bg-secondary disabled:opacity-50"
              >
                Đổi
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
