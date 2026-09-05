/** Định dạng tiền tệ dùng chung — module lá, an toàn cho client bundle. */
export const formatUsd = (usd: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(usd);

export const formatVnd = (vnd: number) =>
  `${new Intl.NumberFormat("vi-VN").format(vnd)} ₫`;
