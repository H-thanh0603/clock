"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Chống open-redirect: chỉ cho path nội bộ (không scheme, không //).
  const rawNext = searchParams.get("next") || "/";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const { user, login, register, logout } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi xác thực");
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <div className="flex flex-col items-center gap-space-md text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
          <span className="material-symbols-outlined text-[36px]">
            verified_user
          </span>
        </span>
        <div>
          <p className="font-title-editorial text-title-editorial text-on-surface">
            {user.name || user.email}
          </p>
          <p className="font-body-sm text-body-sm mt-1 text-on-surface-variant">
            {user.email} • {user.role === "ADMIN" ? "Atelier Admin" : "Private Client"}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-space-sm">
          <Link
            href="/account"
            className="px-space-lg py-3 rounded bg-primary text-on-primary font-label-spec text-label-spec tracking-[0.2em] uppercase font-semibold hover:bg-secondary transition-colors"
          >
            Đơn Của Tôi
          </Link>
          {user.role === "ADMIN" && (
            <Link
              href="/admin/orders"
              className="px-space-lg py-3 rounded border border-primary-container/50 text-primary font-label-spec text-label-spec tracking-[0.2em] uppercase hover:bg-primary hover:text-on-primary transition-colors"
            >
              Quản Trị
            </Link>
          )}
          <button
            onClick={() => logout().then(() => router.refresh())}
            className="px-space-lg py-3 rounded bg-surface-container-high text-on-surface font-label-spec text-label-spec tracking-[0.2em] uppercase hover:text-primary transition-colors"
          >
            Đăng Xuất
          </button>
        </div>
      </div>
    );
  }

  const inputCls =
    "w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary transition-colors";

  return (
    <div>
      <div className="mb-space-lg grid grid-cols-2 gap-space-xs rounded bg-surface-container-low p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError("");
            }}
            className={`py-2.5 rounded font-label-spec text-label-spec tracking-[0.2em] uppercase transition-colors ${mode === m ? "bg-primary text-on-primary font-semibold" : "text-on-surface-variant hover:text-on-surface"}`}
          >
            {m === "login" ? "Đăng Nhập" : "Đăng Ký"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-space-md">
        {mode === "register" && (
          <div>
            <label className="font-label-spec text-label-spec mb-space-2xs block tracking-wider text-on-surface-variant uppercase">
              Danh Xưng &amp; Họ Tên
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Ngài / Bà..."
              autoComplete="name"
            />
          </div>
        )}
        <div>
          <label className="font-label-spec text-label-spec mb-space-2xs block tracking-wider text-on-surface-variant uppercase">
            Email *
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="thuongkhach@vidu.vn"
            type="email"
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="font-label-spec text-label-spec mb-space-2xs block tracking-wider text-on-surface-variant uppercase">
            Mật Khẩu * (tối thiểu 6 ký tự)
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            placeholder="••••••••"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>
        {error && (
          <p className="rounded border border-error/40 bg-error-container/20 px-space-md py-space-sm font-body-sm text-body-sm text-error">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="w-full py-4 rounded bg-primary text-on-primary font-label-spec text-label-spec tracking-[0.2em] uppercase font-semibold hover:bg-secondary transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-space-sm"
          type="submit"
        >
          <span className="material-symbols-outlined text-[18px]">
            {mode === "login" ? "lock_open" : "person_add"}
          </span>
          <span>{busy ? "Đang xử lý..." : mode === "login" ? "Đăng Nhập Vault" : "Tạo Tài Khoản"}</span>
        </button>
      </form>
      <p className="font-body-sm text-body-sm mt-space-md text-center text-on-surface-variant/70">
        Thượng khách mới? Chọn “Đăng Ký” để mở Vault cá nhân.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-page px-6 py-16 md:px-8">
      <div className="mx-auto max-w-md">
        <div className="mb-space-lg text-center">
          <span className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
            Circle Privé • Genève
          </span>
          <h1 className="font-display mt-3 text-4xl font-medium">
            Cổng <span className="text-gold-gradient">Thượng Khách</span>
          </h1>
          <p className="font-body-md text-body-md mt-3 text-on-surface-variant/85">
            Đăng nhập để đồng bộ Vault giữa các thiết bị, theo dõi đơn hàng và
            nhận ưu tiên phân bổ phiên bản giới hạn.
          </p>
        </div>
        <div className="gold-border-card p-8">
          <Suspense>
            <AuthForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
