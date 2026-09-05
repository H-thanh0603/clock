/**
 * Catalog dây đeo (copy từ frontend src/data/straps.ts — backend tự chủ,
 * không import ngược sang frontend).
 */
export type StrapOption = {
  label: string;
  priceDeltaUsd: number;
};

export const strapOptions: StrapOption[] = [
  { label: 'Dây da cá sấu đen', priceDeltaUsd: 0 },
  { label: 'Dây da cá sấu nâu Cognac', priceDeltaUsd: 0 },
  { label: 'Dây kim loại tích hợp', priceDeltaUsd: 4500 },
  { label: 'Dây cao su kỹ thuật cao cấp', priceDeltaUsd: 1200 },
];
