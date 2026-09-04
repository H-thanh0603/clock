"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { navLinks, site } from "@/data/site";
import { useCart } from "./CartProvider";
import { useCurrency } from "./CurrencyProvider";

export default function Header() {
  const { totalQty } = useCart();
  const { currency, setCurrency } = useCurrency();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="glass-header fixed inset-x-0 top-0 z-50 border-b border-outline-variant/20">
      {/* Utility bar */}
      <div className="hidden border-b border-outline-variant/10 md:block">
        <div className="mx-auto flex max-w-page items-center justify-between px-8 py-1.5 text-[11px] tracking-[0.25em] text-on-surface-variant/70 uppercase">
          <span>{site.utilityBar}</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrency("VND")}
              className={`transition-colors ${currency === "VND" ? "text-primary" : "hover:text-primary"}`}
            >
              VND
            </button>
            <span className="text-outline-variant/40">/</span>
            <button
              onClick={() => setCurrency("USD")}
              className={`transition-colors ${currency === "USD" ? "text-primary" : "hover:text-primary"}`}
            >
              USD
            </button>
            <span className="ml-2 flex items-center gap-2 border-l border-outline-variant/30 pl-4">
              <Image
                src="/images/vip-collector-profile.jpg"
                alt="Khách hàng VIP"
                width={22}
                height={22}
                className="rounded-full object-cover"
              />
              <span>Private Client</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="mx-auto flex max-w-page items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/images/logo.png"
            alt="Logo Aurel & Co."
            width={38}
            height={38}
            className="h-9 w-9 object-contain"
          />
          <div className="leading-tight">
            <div className="font-display text-lg font-semibold text-on-surface">
              {site.brand}
            </div>
            <div className="text-[10px] tracking-[0.35em] text-on-surface-variant/70 uppercase">
              {site.tagline}
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[11px] font-medium tracking-[0.2em] text-on-surface-variant uppercase transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button
            aria-label="Tìm kiếm"
            className="p-2 text-on-surface-variant transition-colors hover:text-primary"
          >
            <span className="material-symbols-outlined text-[22px]">search</span>
          </button>
          <button
            aria-label="Yêu thích"
            className="hidden p-2 text-on-surface-variant transition-colors hover:text-primary sm:block"
          >
            <span className="material-symbols-outlined text-[22px]">favorite</span>
          </button>
          <Link
            href="/cart"
            aria-label="Giỏ hàng"
            className="relative p-2 text-on-surface-variant transition-colors hover:text-primary"
          >
            <span className="material-symbols-outlined text-[22px]">shopping_bag</span>
            {totalQty > 0 && (
              <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-surface-lowest">
                {totalQty}
              </span>
            )}
          </Link>
          <button
            aria-label="Menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 text-on-surface-variant lg:hidden"
          >
            <span className="material-symbols-outlined text-[22px]">
              {menuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <nav className="border-t border-outline-variant/20 bg-surface-lowest/95 px-6 py-4 lg:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block py-3 text-xs font-medium tracking-[0.2em] text-on-surface-variant uppercase transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex gap-4 border-t border-outline-variant/20 pt-3 text-xs">
            <button
              onClick={() => setCurrency("VND")}
              className={currency === "VND" ? "text-primary" : "text-on-surface-variant"}
            >
              VND
            </button>
            <button
              onClick={() => setCurrency("USD")}
              className={currency === "USD" ? "text-primary" : "text-on-surface-variant"}
            >
              USD
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
