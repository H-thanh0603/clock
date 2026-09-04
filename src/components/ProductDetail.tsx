"use client";

import Image from "next/image";
import { useState } from "react";
import GoldButton from "@/components/GoldButton";
import SpecBadge from "@/components/SpecBadge";
import type { Product } from "@/data/products";
import { strapOptions } from "@/data/products";
import { useCurrency } from "./CurrencyProvider";
import { useCart } from "./CartProvider";

export default function ProductDetail({ product }: { product: Product }) {
  const { price } = useCurrency();
  const { addItem } = useCart();
  const [activeImage, setActiveImage] = useState(0);
  const [strap, setStrap] = useState(strapOptions[0]);
  const [engraving, setEngraving] = useState("");
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addItem({
      slug: product.slug,
      name: product.name,
      priceUsd: product.priceUsd + strap.priceDeltaUsd,
      priceVnd: product.priceVnd + strap.priceDeltaUsd * 25200,
      image: product.images[0],
      strap: strap.label,
      engraving: engraving.trim() || undefined,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="mx-auto max-w-page px-4 py-8 md:px-8">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-[11px] tracking-[0.15em] text-on-surface-variant/60 uppercase">
        <a href="/" className="hover:text-primary">Trang Chủ</a>
        <span>/</span>
        <a href="/collections" className="hover:text-primary">Bộ Sưu Tập</a>
        <span>/</span>
        <span className="text-primary">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-12">
        {/* ===== Immersive visual vault ===== */}
        <div className="lg:col-span-7">
          <div className="relative aspect-square overflow-hidden border border-primary-container/30">
            <Image
              src={product.images[activeImage]}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 58vw"
              className="object-cover"
            />
            {/* Complication HUD overlay */}
            <div className="absolute top-4 left-4 flex flex-col gap-1.5">
              {product.badges.map((b) => (
                <SpecBadge key={b} gold>{b}</SpecBadge>
              ))}
            </div>
            <div className="glass-header absolute right-4 bottom-4 border border-outline-variant/40 px-3 py-2 text-[10px] tracking-[0.2em] text-on-surface-variant/90 uppercase">
              {product.calibre} • {product.strapLabel}
            </div>
          </div>

          {/* Thumbnails */}
          <div className="mt-3 flex gap-3">
            {product.images.map((img, i) => (
              <button
                key={img}
                onClick={() => setActiveImage(i)}
                className={`relative h-20 w-20 overflow-hidden border transition-colors md:h-24 md:w-24 ${
                  activeImage === i
                    ? "border-primary"
                    : "border-outline-variant/30 hover:border-outline"
                }`}
              >
                <Image
                  src={img}
                  alt={`${product.name} — ảnh ${i + 1}`}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>

          {/* Chronometric telemetry */}
          <div className="gold-border-card mt-8 grid grid-cols-3 divide-x divide-outline-variant/20 p-5 text-center">
            {[
              { v: "72h", l: "Trữ Cót" },
              { v: "28,800", l: "Vph • 4 Hz" },
              { v: "-4/+6s", l: "Chuẩn COSC" },
            ].map((t) => (
              <div key={t.l}>
                <div className="font-display text-xl font-semibold text-primary md:text-2xl">{t.v}</div>
                <div className="mt-1 text-[10px] tracking-[0.2em] text-on-surface-variant/70 uppercase">{t.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== Acquisition console ===== */}
        <div className="lg:col-span-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {product.complications.map((c) => (
                <SpecBadge key={c}>{c}</SpecBadge>
              ))}
            </div>
            <h1 className="font-display text-3xl leading-tight font-medium md:text-4xl">
              {product.name}
            </h1>
            <p className="text-xs tracking-[0.25em] text-on-surface-variant/60 uppercase">
              Ref. {product.reference} — Genève
            </p>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-on-surface-variant/85">
            {product.shortDescription}
          </p>

          {/* Price lock card */}
          <div className="mt-6 border border-primary-container/40 bg-surface-lowest/60 p-5">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] tracking-[0.25em] text-on-surface-variant/60 uppercase">
                  Giá Atelier (Bao gồm thuế)
                </div>
                <div className="font-display mt-1 text-3xl font-semibold text-primary">
                  {price(product.priceUsd + strap.priceDeltaUsd, product.priceVnd + strap.priceDeltaUsd * 25200)}
                </div>
              </div>
              {product.inBoutique ? (
                <SpecBadge gold>Sẵn Hàng</SpecBadge>
              ) : (
                <SpecBadge>Đặt Trước 9 Tháng</SpecBadge>
              )}
            </div>
          </div>

          {/* Strap selector */}
          <div className="mt-6">
            <span className="text-[10px] tracking-[0.25em] text-on-surface-variant/70 uppercase">
              Chất Liệu Dây
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {strapOptions.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setStrap(opt)}
                  className={`border px-3 py-2.5 text-left text-xs transition-colors ${
                    strap.label === opt.label
                      ? "border-primary text-primary"
                      : "border-outline-variant/40 text-on-surface-variant/80 hover:border-outline"
                  }`}
                >
                  {opt.label}
                  {opt.priceDeltaUsd > 0 && (
                    <span className="mt-0.5 block text-[10px] text-secondary">
                      +{price(opt.priceDeltaUsd, opt.priceDeltaUsd * 25200)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Engraving */}
          <div className="mt-5">
            <span className="text-[10px] tracking-[0.25em] text-on-surface-variant/70 uppercase">
              Khắc Tên Lưng Vỏ (Miễn Phí)
            </span>
            <input
              value={engraving}
              maxLength={20}
              onChange={(e) => setEngraving(e.target.value)}
              placeholder="Tối đa 20 ký tự — ví dụ: Ad astra per aspera"
              className="mt-2 w-full border border-outline-variant/40 bg-surface-lowest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none transition-colors focus:border-primary"
            />
          </div>

          {/* CTAs */}
          <div className="mt-6 flex flex-col gap-3">
            <GoldButton onClick={handleAdd} icon={added ? "check" : "add_shopping_cart"}>
              {added ? "Đã Thêm Vào Giỏ" : "Thêm Vào Giỏ Hàng"}
            </GoldButton>
            <GoldButton href="/bespoke" variant="secondary" icon="draw">
              Yêu Cầu Phiên Bản Cá Nhân Hóa
            </GoldButton>
          </div>

          {/* Security assurances */}
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-outline-variant/20 pt-5 text-center">
            {[
              { icon: "verified_user", l: "COSC" },
              { icon: "shield", l: "Bảo Hành 5 Năm" },
              { icon: "lock", l: "Giao An Ninh" },
            ].map((a) => (
              <div key={a.l} className="flex flex-col items-center gap-1">
                <span className="material-symbols-outlined text-xl text-primary">{a.icon}</span>
                <span className="text-[10px] tracking-[0.12em] text-on-surface-variant/70 uppercase">{a.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
