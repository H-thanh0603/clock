"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "./CartProvider";
import { products, formatUsd, formatVnd, type Product } from "@/data/products";
import { site } from "@/data/site";

const STRAPS = [
  {
    short: "Alligator Đen",
    full: "Cá sấu Mississippi Đen Mờ",
    dot: "bg-[#18181b]",
    deltaUsd: 0,
  },
  {
    short: "Cognac Vintage",
    full: "Cognac Vintage Nâu",
    dot: "bg-[#5c3a21]",
    deltaUsd: 0,
  },
  {
    short: "Vàng Đúc 18K",
    full: "Vàng Đúc 18K Nguyên Khối",
    dot: "bg-gradient-to-tr from-secondary-container via-primary-container to-secondary",
    deltaUsd: 4500,
  },
];

/**
 * Cụm mua hàng trang chi tiết — visual y hệt Stitch (thẻ giá,
 * chọn dây, khắc laser, Mua Ngay) nhưng đấu thật vào giỏ hàng.
 */
export default function DetailPurchase({ product: dbProduct }: { product: Product | null }) {
  const router = useRouter();
  const { addItem } = useCart();
  const product = dbProduct ?? products[0];
  const [strapIdx, setStrapIdx] = useState(0);
  const [engraving, setEngraving] = useState("");

  const strap = STRAPS[strapIdx];
  const priceUsd = product.priceUsd + strap.deltaUsd;
  const priceVnd = product.priceVnd + strap.deltaUsd * site.usdToVnd;

  const buyNow = () => {
    addItem({
      slug: product.slug,
      name: product.name,
      priceUsd,
      priceVnd,
      image: product.images[0],
      strap: strap.full,
      engraving: engraving.trim() || undefined,
    });
    router.push("/cart");
  };

  return (
    <>
      {/* Valued Price Lock Card */}
      <div className="p-space-md rounded-xl bg-surface-container-low shadow-lg flex flex-col gap-1">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-headline-lg text-headline-lg text-primary tracking-tight">
              {formatUsd(priceUsd)}
            </span>
            <span className="font-label-spec text-label-spec text-on-surface-variant uppercase">
              USD
            </span>
          </div>
          <span className="font-title-editorial text-body-md text-secondary">
            ≈ {formatVnd(priceVnd).replace(" ₫", "")} VNĐ
          </span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 mt-1">
          <span className="material-symbols-outlined text-[14px] text-primary">
            verified_user
          </span>
          Đã bao gồm thuế tiêu thụ đặc biệt, bảo hiểm vận chuyển bọc thép quốc
          tế và thủ tục hải quan VIP.
        </p>
      </div>

      {/* Bespoke Personalization Section */}
      <div className="p-space-lg rounded-xl bg-surface-container-low shadow-lg flex flex-col gap-space-md">
        {/* Option 1: Strap Material Selection */}
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center justify-between">
            <span className="font-label-spec text-label-spec text-on-surface uppercase tracking-[0.14em]">
              Chất Liệu Dây Đeo Atelier
            </span>
            <span
              className="font-body-sm text-body-sm text-primary"
              id="strap-label"
            >
              {strap.full}
              {strap.deltaUsd > 0 && (
                <span className="text-on-surface-variant">
                  {" "}
                  (+{formatUsd(strap.deltaUsd)})
                </span>
              )}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-space-xs mt-1">
            {STRAPS.map((s, i) => {
              const active = i === strapIdx;
              return (
                <button
                  key={s.short}
                  onClick={() => setStrapIdx(i)}
                  className={`strap-choice p-space-xs rounded transition-all flex flex-col items-center text-center gap-1 shadow-sm ${active ? "bg-surface-container-high text-on-surface" : "bg-surface-container-low hover:bg-surface-container-highest text-on-surface-variant"}`}
                  type="button"
                >
                  <span
                    className={`w-6 h-6 rounded-full ${s.dot} shadow-inner flex items-center justify-center`}
                  >
                    <span
                      className={`material-symbols-outlined text-[14px] ${active ? "text-primary" : "text-transparent"}`}
                    >
                      done
                    </span>
                  </span>
                  <span className="font-label-badge text-[10px] uppercase tracking-wider">
                    {s.short}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Option 2: Free Bespoke Engraving Laser */}
        <div className="flex flex-col gap-space-xs pt-space-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">
                draw
              </span>
              <span className="font-label-spec text-label-spec text-on-surface uppercase tracking-[0.14em]">
                Khắc Laser Bespoke Đáy Vỏ
              </span>
            </div>
            <span className="font-label-badge text-[10px] uppercase tracking-wider text-secondary">
              Đặc Quyền Miễn Phí
            </span>
          </div>
          <div className="relative">
            <input
              value={engraving}
              onChange={(e) => setEngraving(e.target.value.slice(0, 24))}
              className="w-full bg-surface-container-high px-space-md py-space-sm rounded text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-0 focus:bg-surface-container-highest uppercase tracking-widest font-title-editorial"
              id="engraving-text"
              maxLength={24}
              placeholder="Ví dụ: L. H. D. • GENÈVE 2024"
              type="text"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-badge text-[10px] text-on-surface-variant">
              {engraving.length}/24 ký tự
            </span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant/70 italic">
            Nghệ nhân Geneva sẽ khắc họa thủ công theo phông chữ ký hiệu truyền
            thống của hãng.
          </p>
        </div>
      </div>

      {/* Purchase Action Buttons & Concierge Suite */}
      <div className="flex flex-col gap-space-sm">
        {/* Primary Action */}
        <button
          onClick={buyNow}
          className="w-full py-space-md px-space-lg rounded bg-primary text-on-primary font-label-spec text-label-spec uppercase tracking-[0.18em] font-bold hover:bg-secondary transition-all shadow-xl flex items-center justify-center gap-space-sm transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="material-symbols-outlined text-[20px]">verified</span>
          <span>Mua Ngay &amp; Đặt Vận Chuyển Bọc Thép</span>
        </button>
        {/* Secondary Actions Split */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-space-sm">
          <Link
            href="/#private-salon"
            className="sm:col-span-4 py-space-sm px-space-md rounded bg-surface-container-high text-on-surface font-label-spec text-label-spec uppercase tracking-[0.12em] hover:text-primary hover:bg-surface-container-highest transition-all shadow-md flex items-center justify-center gap-space-xs"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">
              event_seat
            </span>
            <span>Đặt Lịch Trải Nghiệm Tại Salon VIP</span>
          </Link>
          <button
            className="sm:col-span-1 py-space-sm px-space-xs rounded bg-surface-container-high text-primary hover:bg-primary hover:text-on-primary transition-all shadow-md flex items-center justify-center gap-1 group"
            title="Kết nối trực tiếp Master Horologist qua Concierge Desk"
          >
            <span className="material-symbols-outlined text-[20px]">chat</span>
            <span className="font-label-badge text-[10px] uppercase tracking-widest sm:hidden">
              Tư Vấn
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
