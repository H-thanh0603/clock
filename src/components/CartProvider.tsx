"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CartItem = {
  slug: string;
  name: string;
  priceUsd: number;
  priceVnd: number;
  image: string;
  strap: string;
  engraving?: string;
  qty: number;
};

type CartContextValue = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  removeItem: (slug: string, strap: string) => void;
  updateQty: (slug: string, strap: string, qty: number) => void;
  clear: () => void;
  totalQty: number;
  totalUsd: number;
  totalVnd: number;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "aurel-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // bỏ qua dữ liệu hỏng
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const addItem = (item: Omit<CartItem, "qty">, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.slug === item.slug && i.strap === item.strap
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [...prev, { ...item, qty }];
    });
  };

  const removeItem = (slug: string, strap: string) =>
    setItems((prev) =>
      prev.filter((i) => !(i.slug === slug && i.strap === strap))
    );

  const updateQty = (slug: string, strap: string, qty: number) =>
    setItems((prev) =>
      prev.map((i) =>
        i.slug === slug && i.strap === strap ? { ...i, qty: Math.max(1, qty) } : i
      )
    );

  const clear = () => setItems([]);

  const { totalQty, totalUsd, totalVnd } = useMemo(
    () =>
      items.reduce(
        (acc, i) => ({
          totalQty: acc.totalQty + i.qty,
          totalUsd: acc.totalUsd + i.priceUsd * i.qty,
          totalVnd: acc.totalVnd + i.priceVnd * i.qty,
        }),
        { totalQty: 0, totalUsd: 0, totalVnd: 0 }
      ),
    [items]
  );

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQty, clear, totalQty, totalUsd, totalVnd }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart phải dùng trong CartProvider");
  return ctx;
}
