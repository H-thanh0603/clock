"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "./CartProvider";
import { useCurrency } from "./CurrencyProvider";
import { useAuth } from "./AuthProvider";
import { useWishlist } from "./WishlistProvider";
import { productBySlug, formatUsd } from "@/data/products";

const links = [
  { href: "/", label: "Trang Chủ" },
  { href: "/collections", label: "Bộ Sưu Tập" },
  { href: "/products/chronos-tourbillon-no-07", label: "Chi Tiết Sản Phẩm" },
  { href: "/atelier", label: "Atelier & Di Sản" },
  { href: "/cart", label: "Giỏ Hàng & Concierge" },
];

export default function Header() {
  const { totalQty } = useCart();
  const { currency, setCurrency } = useCurrency();
  const { user, logout } = useAuth();
  const { slugs, count, remove } = useWishlist();
  const [menuOpen, setMenuOpen] = useState(false);
  const [wishOpen, setWishOpen] = useState(false);
  const wished = slugs
    .map((s) => productBySlug(s))
    .filter((p) => p !== undefined);

  return (
    <header className="fixed top-0 left-0 z-50 w-full bg-surface-container-lowest/90 shadow-[0_1px_8px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      {/* Utility bar — y hệt Stitch */}
      <div className="flex h-7 items-center justify-between bg-surface-container-low px-gutter-desktop text-on-surface-variant">
        <div className="flex items-center gap-space-xs">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
          <span className="font-label-badge text-label-badge tracking-widest text-secondary uppercase">
            Manufacture de Haute Horlogerie • Genève
          </span>
        </div>
        <div className="hidden font-label-badge text-label-badge tracking-widest text-on-surface-variant/80 uppercase md:block">
          SWISS CHRONOMETER CERTIFIED • COMPLIMENTARY SECURED CONCIERGE DELIVERY
          WORLDWIDE • PRIVATE SALON APPOINTMENTS
        </div>
        <div className="flex items-center gap-space-sm font-label-badge text-label-badge text-primary uppercase">
          <span className="material-symbols-outlined text-[14px]">verified</span>
          <span>Atelier Direct</span>
        </div>
      </div>

      {/* Main bar — y hệt Stitch */}
      <div className="mx-auto flex h-20 max-w-[1360px] items-center justify-between px-gutter-desktop">
        <Link href="/" className="flex items-center gap-space-md">
          <img
            alt="Aurel & Co. Haute Horlogerie Logo"
            className="h-8 w-auto object-contain"
            src="/images/logo.png"
          />
          <div className="flex flex-col">
            <span className="font-title-editorial text-title-editorial leading-none tracking-[0.25em] text-on-surface uppercase">
              Aurel &amp; Co.
            </span>
            <span className="mt-1 font-label-badge text-[9px] leading-none tracking-[0.35em] text-secondary uppercase">
              Genève 1892
            </span>
          </div>
        </Link>

        <nav className="hidden h-full items-center gap-space-xl lg:flex">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="font-body-sm text-body-sm flex h-full items-center tracking-[0.1em] text-on-surface-variant uppercase transition-colors hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-space-md">
          <div className="font-label-spec hidden cursor-pointer items-center rounded bg-surface-container-high px-space-xs py-1 text-[11px] tracking-wider text-on-surface-variant uppercase transition-colors hover:text-primary sm:flex">
            <button
              onClick={() => setCurrency("USD")}
              className={currency === "USD" ? "text-primary" : ""}
            >
              USD
            </button>
            <span className="mx-1 text-outline-variant">/</span>
            <button
              onClick={() => setCurrency("VND")}
              className={currency === "VND" ? "text-primary" : ""}
            >
              VND
            </button>
          </div>
          <button
            aria-label="Search Archive"
            className="flex items-center justify-center p-1 text-on-surface-variant transition-colors hover:text-primary"
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
          </button>
          <div className="relative">
            <button
              aria-label="Wishlist"
              onClick={() => setWishOpen((v) => !v)}
              className="relative flex items-center justify-center p-1 text-on-surface-variant transition-colors hover:text-primary"
            >
              <span className="material-symbols-outlined text-[20px]">
                favorite
              </span>
              {count > 0 && (
                <span className="font-label-badge absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-on-primary">
                  {count}
                </span>
              )}
            </button>
            {wishOpen && (
              <div className="absolute top-10 right-0 z-50 w-80 rounded-xl border border-outline-variant/30 bg-surface-container-lowest/95 p-space-md shadow-2xl backdrop-blur-xl">
                <div className="mb-space-sm flex items-center justify-between">
                  <span className="font-label-spec text-label-spec tracking-[0.2em] text-secondary uppercase">
                    Private Wishlist ({count})
                  </span>
                  <button
                    onClick={() => setWishOpen(false)}
                    className="p-1 text-on-surface-variant hover:text-primary"
                    aria-label="Đóng wishlist"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      close
                    </span>
                  </button>
                </div>
                {wished.length === 0 ? (
                  <div className="flex flex-col items-center gap-space-xs py-space-lg text-center">
                    <span className="material-symbols-outlined text-4xl text-outline-variant">
                      favorite
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Chưa có kiệt tác yêu thích. Bấm tim trên thẻ sản phẩm để
                      lưu vào đây.
                    </p>
                    <Link
                      href="/collections"
                      onClick={() => setWishOpen(false)}
                      className="mt-space-xs font-label-spec text-label-spec tracking-[0.2em] text-primary uppercase hover:text-secondary"
                    >
                      Khám Phá Bộ Sưu Tập
                    </Link>
                  </div>
                ) : (
                  <div className="flex max-h-80 flex-col gap-space-xs overflow-y-auto">
                    {wished.map((p) => (
                      <div
                        key={p.slug}
                        className="flex items-center gap-space-sm rounded-lg bg-surface-container p-space-xs"
                      >
                        <img
                          src={p.images[0]}
                          alt={p.name}
                          className="h-12 w-12 shrink-0 rounded object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/products/${p.slug}`}
                            onClick={() => setWishOpen(false)}
                            className="font-body-sm text-body-sm block truncate text-on-surface hover:text-primary"
                          >
                            {p.name}
                          </Link>
                          <span className="font-label-spec text-[11px] text-primary">
                            {formatUsd(p.priceUsd)}
                          </span>
                        </div>
                        <button
                          onClick={() => remove(p.slug)}
                          className="p-1.5 text-on-surface-variant transition-colors hover:text-error"
                          aria-label={`Xóa ${p.name} khỏi wishlist`}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            delete_outline
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <Link
            aria-label="Vault Cart"
            href="/cart"
            className="relative flex items-center justify-center p-1 text-on-surface-variant transition-colors hover:text-primary"
          >
            <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
            {totalQty > 0 && (
              <span className="font-label-badge absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary-container text-[9px] font-bold text-on-primary">
                {totalQty}
              </span>
            )}
          </Link>
          <button
            aria-label="Menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1 text-on-surface-variant lg:hidden"
          >
            <span className="material-symbols-outlined text-[20px]">
              {menuOpen ? "close" : "menu"}
            </span>
          </button>
          <div className="hidden h-6 w-[1px] bg-surface-container-highest sm:block"></div>
          {user ? (
            <div className="flex items-center gap-space-xs pl-space-xs">
              <Link href="/account" className="group flex items-center gap-space-xs">
                <div className="relative">
                  <img
                    alt="Profile"
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-primary/40"
                    src="/images/vip-collector-profile.jpg"
                  />
                  <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full bg-primary ring-1 ring-surface"></span>
                </div>
                <div className="hidden flex-col xl:flex">
                  <span className="font-label-badge max-w-28 truncate text-[10px] tracking-wider text-on-surface uppercase transition-colors group-hover:text-primary">
                    {user.name || user.email}
                  </span>
                  <span className="font-label-spec text-[9px] tracking-widest text-secondary uppercase">
                    {user.role === "ADMIN" ? "Atelier Admin" : "Collector Tier"}
                  </span>
                </div>
              </Link>
              {user.role === "ADMIN" && (
                <Link
                  href="/admin/orders"
                  aria-label="Quản trị"
                  className="p-1.5 text-on-surface-variant transition-colors hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    shield_person
                  </span>
                </Link>
              )}
              <button
                onClick={() => logout()}
                aria-label="Đăng xuất"
                className="p-1.5 text-on-surface-variant transition-colors hover:text-primary"
              >
                <span className="material-symbols-outlined text-[20px]">
                  logout
                </span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-space-xs pl-space-xs">
              <Link
                href="/login"
                className="group hidden items-center gap-space-xs sm:flex"
              >
                <div className="relative">
                  <img
                    alt="Profile"
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-primary/40"
                    src="/images/vip-collector-profile.jpg"
                  />
                  <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full bg-surface-container-highest ring-1 ring-surface"></span>
                </div>
                <div className="hidden flex-col xl:flex">
                  <span className="font-label-badge text-[10px] tracking-wider text-on-surface uppercase transition-colors group-hover:text-primary">
                    Đăng Nhập
                  </span>
                  <span className="font-label-spec text-[9px] tracking-widest text-secondary uppercase">
                    Circle Privé
                  </span>
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-outline-variant/20 bg-surface-lowest/95 px-6 py-4 lg:hidden">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="block py-3 text-xs font-medium tracking-[0.2em] text-on-surface-variant uppercase transition-colors hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link
                href="/account"
                onClick={() => setMenuOpen(false)}
                className="block py-3 text-xs font-medium tracking-[0.2em] text-on-surface-variant uppercase transition-colors hover:text-primary"
              >
                Đơn Của Tôi
              </Link>
              <button
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                }}
                className="block py-3 text-xs font-medium tracking-[0.2em] text-on-surface-variant uppercase transition-colors hover:text-primary"
              >
                Đăng Xuất ({user.email})
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="block py-3 text-xs font-medium tracking-[0.2em] text-primary uppercase"
            >
              Đăng Nhập / Đăng Ký
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
