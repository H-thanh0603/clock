import { strapOptions } from "@/data/products";

/**
 * Tỉ giá USD → VND dùng cho toàn bộ định giá.
 * USD là đơn vị gốc; VND luôn được SUY RA từ đây, không lưu độc lập.
 */
export const USD_TO_VND = 25200;

export type LinePrice = { priceUsd: number; priceVnd: number };

/**
 * Chốt giá một dòng đơn/cart: giá USD gốc (từ DB hoặc bespoke) + delta strap,
 * VND suy ra theo USD_TO_VND. Trả về cặp thống nhất cho mọi bên sử dụng.
 */
export function linePrice(
  usd: number,
  strap?: string | null
): LinePrice {
  const delta =
    strapOptions.find((s) => s.label === strap)?.priceDeltaUsd ?? 0;
  const priceUsd = Math.max(0, Math.floor(usd)) + delta;
  return { priceUsd, priceVnd: Math.round(priceUsd * USD_TO_VND) };
}