"use client";

import { useCart, type CartItem } from "./CartProvider";
import { formatUsd, formatVnd } from "@/data/products";

/** Dòng vật phẩm trong Vault — visual Stitch, số lượng & xóa đấu thật. */
export default function VaultItemCard({ item }: { item: CartItem }) {
  const { updateQty, removeItem } = useCart();

  return (
    <div className="bg-surface-container-lowest rounded-lg p-space-lg md:p-space-xl shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md mb-space-lg bg-surface-container-low/60 -mx-space-lg -mt-space-lg px-space-lg pt-space-md rounded-t-lg">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary text-[20px]">
            diamond
          </span>
          <span className="font-label-spec text-label-spec text-primary uppercase tracking-[0.2em]">
            Tuyển Chọn Vault • {item.qty} Kiệt Tác
          </span>
        </div>
        <span className="font-label-badge text-label-badge text-secondary bg-surface-container-high px-space-xs py-0.5 rounded uppercase mt-2 sm:mt-0">
          {item.strap}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-space-lg">
        <div className="md:col-span-5 relative group">
          <div className="aspect-square bg-surface-container-high rounded overflow-hidden relative shadow-inner flex items-center justify-center">
            <img
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              data-alt={item.name}
              src={item.image}
            />
            <div className="absolute bottom-2 left-2 bg-surface-container-lowest/80 backdrop-blur-md px-2 py-1 rounded text-primary font-label-badge text-[9px] uppercase tracking-widest">
              Vault Selection
            </div>
          </div>
          <div className="mt-space-sm flex items-center justify-between text-on-surface-variant font-label-spec text-label-spec">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>{" "}
              Chứng thư Provenance kèm theo
            </span>
            <span>Vận chuyển bọc thép</span>
          </div>
        </div>

        <div className="md:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-space-sm">
              <div>
                <span className="font-label-badge text-label-badge text-on-surface-variant uppercase tracking-widest">
                  Genève Haute Horlogerie
                </span>
                <h2 className="font-headline-md text-headline-sm text-on-surface mt-space-2xs">
                  {item.name}
                </h2>
              </div>
              <div className="text-right shrink-0">
                <span className="font-headline-md text-headline-sm text-primary font-medium">
                  {formatUsd(item.priceUsd * item.qty)}
                </span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant">
                  ~{formatVnd(item.priceVnd * item.qty)}
                </span>
              </div>
            </div>
            {item.engraving && (
              <div className="mt-space-md p-space-sm bg-surface-container rounded flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-secondary text-[20px]">
                  edit_note
                </span>
                <div className="text-body-sm">
                  <span className="font-label-spec text-label-spec uppercase tracking-wider text-secondary">
                    Khắc tên độc bản:
                  </span>
                  <span className="text-on-surface font-medium ml-1">
                    &quot;{item.engraving}&quot;
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-space-md mt-space-md bg-surface-container-low/40 -mx-space-sm px-space-sm rounded flex flex-wrap items-center justify-between gap-space-sm">
            <div className="flex items-center gap-space-xs">
              <span className="font-label-spec text-label-spec text-on-surface-variant uppercase tracking-wider">
                Số lượng:
              </span>
              <div className="flex items-center bg-surface-container-high rounded px-1 py-1 text-on-surface">
                <button
                  onClick={() =>
                    updateQty(item.slug, item.strap, item.qty - 1)
                  }
                  className="px-2 hover:text-primary transition-colors"
                  aria-label="Giảm số lượng"
                >
                  −
                </button>
                <span className="font-label-spec text-body-sm font-bold text-primary px-2">
                  {item.qty}
                </span>
                <button
                  onClick={() =>
                    updateQty(item.slug, item.strap, item.qty + 1)
                  }
                  className="px-2 hover:text-primary transition-colors"
                  aria-label="Tăng số lượng"
                >
                  +
                </button>
              </div>
            </div>
            <button
              onClick={() => removeItem(item.slug, item.strap)}
              className="font-body-sm text-body-sm text-error/80 hover:text-error transition-colors flex items-center gap-1"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">
                delete_outline
              </span>
              <span>Rút khỏi giỏ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
