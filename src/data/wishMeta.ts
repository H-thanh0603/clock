/**
 * Metadata rút gọn cho wishlist/header client — TÁCH khỏi data/products
 * để client bundle không phải nhốt toàn bộ catalog tĩnh (trang collections
 * đã fetch qua /api/products từ DB).
 */
export type WishItem = {
  slug: string;
  name: string;
  priceUsd: number;
  image: string;
};

const wishMeta: WishItem[] = [
  {
    slug: "chronos-tourbillon-no-07",
    name: "Chronos Tourbillon N°07",
    priceUsd: 145000,
    image: "/images/stitch/26_AB6AXuB7UM.jpg",
  },
  {
    slug: "celestial-perpetual-moonphase",
    name: "Celestial Perpetual Moonphase",
    priceUsd: 98000,
    image: "/images/stitch/26_AB6AXuB7UM.jpg",
  },
  {
    slug: "sovereign-skeleton-1888",
    name: "Sovereign Skeleton 1888",
    priceUsd: 82000,
    image: "/images/stitch/26_AB6AXuB7UM.jpg",
  },
  {
    slug: "vanguard-chronograph-flyback-carbon",
    name: "Vanguard Chronograph Flyback Carbon",
    priceUsd: 46000,
    image: "/images/stitch/26_AB6AXuB7UM.jpg",
  },
  {
    slug: "elegance-classic-rose-gold-40mm",
    name: "Elegance Classic Rose Gold 40mm",
    priceUsd: 34000,
    image: "/images/stitch/26_AB6AXuB7UM.jpg",
  },
  {
    slug: "aquanaut-deep-sea-diver-500m",
    name: "Aquanaut Deep Sea Diver 500m",
    priceUsd: 28500,
    image: "/images/stitch/26_AB6AXuB7UM.jpg",
  },
];

export const productBySlug = (slug: string) =>
  wishMeta.find((p) => p.slug === slug);
