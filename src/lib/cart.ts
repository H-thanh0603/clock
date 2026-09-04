import type { CartItem as ClientCartItem } from "@/components/CartProvider";

export type CartRow = {
  productSlug: string;
  name: string;
  priceUsd: number;
  priceVnd: bigint;
  image: string;
  strap: string;
  engraving: string | null;
  qty: number;
};

export function toClientItem(r: CartRow): ClientCartItem {
  return {
    slug: r.productSlug,
    name: r.name,
    priceUsd: r.priceUsd,
    priceVnd: Number(r.priceVnd),
    image: r.image,
    strap: r.strap,
    engraving: r.engraving ?? undefined,
    qty: r.qty,
  };
}
