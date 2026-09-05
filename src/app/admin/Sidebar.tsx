"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

const NAV = [
  { href: "/admin", label: "Tổng Quan", icon: "dashboard", exact: true },
  { href: "/admin/orders", label: "Đơn Hàng", icon: "receipt_long" },
  { href: "/admin/products", label: "Sản Phẩm", icon: "watch" },
  { href: "/admin/customers", label: "Khách Hàng", icon: "group" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-outline-variant/20 bg-surface-container-low">
      <div className="px-6 pt-8 pb-6">
        <p className="font-label-spec text-label-spec tracking-[0.35em] text-secondary uppercase">
          Aurel & Co. • Backoffice
        </p>
        <h2 className="font-display mt-2 text-2xl font-medium">
          Atelier <span className="text-gold-gradient">Admin</span>
        </h2>
        {user && (
          <p className="font-body-sm text-body-sm mt-2 text-on-surface-variant">
            {user.name || user.email}
          </p>
        )}
      </div>
      <nav className="flex flex-col gap-1 px-4">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-3 rounded px-4 py-3 font-label-spec text-label-spec tracking-[0.15em] uppercase transition-colors ${
              active(n.href, n.exact)
                ? "bg-primary font-semibold text-on-primary"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {n.icon}
            </span>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-outline-variant/20 p-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded px-4 py-3 font-label-spec text-label-spec tracking-[0.15em] text-on-surface-variant uppercase transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[20px]">storefront</span>
          Về Cửa Hàng
        </Link>
        <button
          onClick={() => logout().then(() => router.push("/login"))}
          className="flex items-center gap-3 rounded px-4 py-3 font-label-spec text-label-spec tracking-[0.15em] text-on-surface-variant uppercase transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          Đăng Xuất
        </button>
      </div>
    </aside>
  );
}
