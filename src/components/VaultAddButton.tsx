"use client";

import { useState } from "react";
import { useCart } from "./CartProvider";

type Props = {
  slug: string;
  name: string;
  priceUsd: number;
  priceVnd: number;
  image: string;
  strap?: string;
  className?: string;
};

/** Nút "Thêm Vào Vault" giữ nguyên visual Stitch, bấm là thêm thật vào giỏ. */
export default function VaultAddButton({
  slug,
  name,
  priceUsd,
  priceVnd,
  image,
  strap = "Tiêu chuẩn Atelier",
  className = "px-space-sm py-1.5 rounded bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface font-label-spec text-label-spec uppercase tracking-wider transition-all",
}: Props) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        addItem({ slug, name, priceUsd, priceVnd, image, strap });
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1600);
      }}
      className={className}
    >
      {added ? "Đã Thêm ✓" : "Thêm Vào Vault"}
    </button>
  );
}
