"use client";

import { useEffect } from "react";
import { useCart } from "@/components/CartProvider";

/**
 * Sau khi VNPay success (orders/[code]?paid=1): clear giỏ local của khách
 * (giỏ DB đã được backend clear lúc settle).
 */
export function ClearCartOnPaid({ paid }: { paid: boolean }) {
  const { clear } = useCart();
  useEffect(() => {
    if (paid) clear();
    // Chỉ chạy 1 lần khi mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid]);
  return null;
}
