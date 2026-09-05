/**
 * Catalog dây đeo dùng chung — module lá, không kéo theo catalog sản phẩm.
 * Tách khỏi data/products để client bundle không nhốt toàn bộ mảng products.
 */
export type StrapOption = {
  label: string;
  priceDeltaUsd: number;
};

export const strapOptions: StrapOption[] = [
  { label: "Dây da cá sấu đen", priceDeltaUsd: 0 },
  { label: "Dây da cá sấu nâu Cognac", priceDeltaUsd: 0 },
  { label: "Dây kim loại tích hợp", priceDeltaUsd: 4500 },
  { label: "Dây cao su kỹ thuật cao cấp", priceDeltaUsd: 1200 },
];
