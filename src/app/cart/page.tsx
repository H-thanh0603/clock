"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { useCurrency } from "@/components/CurrencyProvider";
import GoldButton from "@/components/GoldButton";

export default function CartPage() {
  const { items, removeItem, updateQty, totalUsd, totalVnd, clear } = useCart();
  const { price } = useCurrency();

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-28 text-center">
        <span className="material-symbols-outlined text-6xl text-outline-variant">
          shopping_bag
        </span>
        <h1 className="font-display text-3xl font-medium">
          Giỏ Hàng Đang <span className="text-gold-gradient">Trống</span>
        </h1>
        <p className="text-sm text-on-surface-variant/80">
          Hãy khám phá bộ sưu tập kiệt tác của Aurel &amp; Co. để bắt đầu hành
          trình sở hữu.
        </p>
        <GoldButton href="/collections" icon="arrow_forward">
          Khám Phá Bộ Sưu Tập
        </GoldButton>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-page px-4 py-12 md:px-8">
      <h1 className="font-display text-3xl font-medium md:text-4xl">
        Giỏ Hàng <span className="text-gold-gradient">&amp; Concierge</span>
      </h1>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-12">
        {/* Items */}
        <div className="space-y-5 lg:col-span-8">
          {items.map((item) => (
            <article
              key={`${item.slug}-${item.strap}`}
              className="flex flex-col gap-4 border border-outline-variant/25 bg-surface-container/40 p-4 sm:flex-row"
            >
              <Link
                href={`/products/${item.slug}`}
                className="relative aspect-square w-full shrink-0 overflow-hidden sm:h-32 sm:w-32"
              >
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              </Link>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/products/${item.slug}`}
                      className="font-display text-lg font-medium transition-colors hover:text-primary"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-1 text-xs tracking-[0.15em] text-on-surface-variant/70 uppercase">
                      {item.strap}
                    </p>
                    {item.engraving && (
                      <p className="mt-1 text-xs text-secondary italic">
                        Khắc: “{item.engraving}”
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.slug, item.strap)}
                    aria-label="Xóa khỏi giỏ"
                    className="p-1 text-on-surface-variant/60 transition-colors hover:text-red-400"
                  >
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                </div>
                <div className="mt-auto flex items-end justify-between pt-3">
                  <div className="flex items-center border border-outline-variant/40">
                    <button
                      onClick={() => updateQty(item.slug, item.strap, item.qty - 1)}
                      className="px-3 py-1.5 text-on-surface-variant transition-colors hover:text-primary"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.slug, item.strap, item.qty + 1)}
                      className="px-3 py-1.5 text-on-surface-variant transition-colors hover:text-primary"
                    >
                      +
                    </button>
                  </div>
                  <div className="font-display text-lg font-semibold text-primary">
                    {price(item.priceUsd * item.qty, item.priceVnd * item.qty)}
                  </div>
                </div>
              </div>
            </article>
          ))}

          <button
            onClick={clear}
            className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-on-surface-variant/60 uppercase transition-colors hover:text-red-400"
          >
            <span className="material-symbols-outlined text-[15px]">remove_shopping_cart</span>
            Xóa toàn bộ giỏ hàng
          </button>
        </div>

        {/* Summary */}
        <aside className="lg:col-span-4">
          <div className="gold-border-card sticky top-32 p-6">
            <h2 className="text-[11px] font-semibold tracking-[0.3em] text-primary uppercase">
              Tóm Tắt Đơn Hàng
            </h2>
            <div className="mt-5 space-y-3 border-b border-outline-variant/20 pb-5 text-sm">
              <div className="flex justify-between">
                <span className="text-on-surface-variant/75">Tạm tính ({items.length} mẫu)</span>
                <span>{price(totalUsd, totalVnd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant/75">Vận chuyển an ninh</span>
                <span className="text-secondary">Miễn phí — Concierge</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant/75">Chứng nhận & hộp atelier</span>
                <span className="text-secondary">Tặng kèm</span>
              </div>
            </div>
            <div className="flex items-end justify-between py-5">
              <span className="text-xs tracking-[0.2em] text-on-surface-variant/75 uppercase">
                Tổng cộng
              </span>
              <span className="font-display text-2xl font-semibold text-primary">
                {price(totalUsd, totalVnd)}
              </span>
            </div>
            <GoldButton href="/checkout" icon="lock" className="w-full">
              Tiến Hành Thanh Toán
            </GoldButton>
            <p className="mt-4 flex items-center gap-2 text-[11px] text-on-surface-variant/60">
              <span className="material-symbols-outlined text-[14px] text-primary">
                support_agent
              </span>
              Concierge trực tuyến hỗ trợ 24/7
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
