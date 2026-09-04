"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/data/products";
import { strapOptions } from "@/data/products";
import { useCurrency } from "./CurrencyProvider";
import { useCart } from "./CartProvider";
import SpecBadge from "./SpecBadge";

export default function ProductCard({ product }: { product: Product }) {
  const { price } = useCurrency();
  const { addItem } = useCart();
  const [strap, setStrap] = useState(strapOptions[0].label);
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addItem({
      slug: product.slug,
      name: product.name,
      priceUsd: product.priceUsd,
      priceVnd: product.priceVnd,
      image: product.images[0],
      strap,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <article className="group flex flex-col border border-outline-variant/25 bg-surface-container/50 transition-colors duration-300 hover:border-primary-container/50">
      <Link href={`/products/${product.slug}`} className="relative block aspect-square overflow-hidden">
        <Image
          src={product.images[0]}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {product.badges.map((b) => (
            <SpecBadge key={b} gold>
              {b}
            </SpecBadge>
          ))}
        </div>
        {!product.inBoutique && (
          <span className="absolute right-3 bottom-3 bg-surface-lowest/80 px-2.5 py-1 text-[10px] tracking-[0.15em] text-secondary uppercase">
            Đặt Trước
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <Link
          href={`/products/${product.slug}`}
          className="font-display text-xl leading-snug font-medium text-on-surface transition-colors duration-300 group-hover:text-primary"
        >
          {product.name}
        </Link>
        <p className="line-clamp-2 text-sm leading-relaxed text-on-surface-variant/80">
          {product.shortDescription}
        </p>

        {/* Quick strap select */}
        <div className="mt-auto">
          <span className="text-[10px] tracking-[0.2em] text-on-surface-variant/60 uppercase">
            Dây:
          </span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {strapOptions.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setStrap(opt.label)}
                className={`border px-2 py-1 text-[10px] tracking-wide transition-colors ${
                  strap === opt.label
                    ? "border-primary text-primary"
                    : "border-outline-variant/40 text-on-surface-variant/70 hover:border-outline"
                }`}
              >
                {opt.label.replace("Dây ", "")}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end justify-between border-t border-outline-variant/20 pt-4">
          <div>
            <div className="font-display text-lg font-semibold text-primary">
              {price(product.priceUsd, product.priceVnd)}
            </div>
            <div className="text-[10px] tracking-[0.15em] text-on-surface-variant/60 uppercase">
              {product.strapLabel}
            </div>
          </div>
          <button
            onClick={handleAdd}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold tracking-[0.15em] uppercase transition-colors ${
              added
                ? "bg-secondary text-surface-lowest"
                : "bg-surface-container-high text-primary hover:bg-primary hover:text-surface-lowest"
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {added ? "check" : "add_shopping_cart"}
            </span>
            {added ? "Đã Thêm" : "Giỏ Hàng"}
          </button>
        </div>
      </div>
    </article>
  );
}
