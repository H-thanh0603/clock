"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthProvider";

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

function loadGuest(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as CartItem[];
    }
  } catch {
    // bỏ qua dữ liệu hỏng
  }
  return [];
}

function saveGuest(items: CartItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // bỏ qua
  }
}

async function readList(res: Response): Promise<CartItem[]> {
  if (!res.ok) throw new Error(`Cart API ${res.status}`);
  return (await res.json()) as CartItem[];
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const prevUser = useRef<string | null>(null);

  // Khởi tạo giỏ khách từ localStorage
  useEffect(() => {
    setItems(loadGuest());
    setHydrated(true);
  }, []);

  // Đăng nhập: gộp giỏ khách lên server rồi dùng giỏ DB.
  // Đăng xuất: quay về giỏ khách local.
  useEffect(() => {
    if (!hydrated) return;
    if (userId && prevUser.current !== userId) {
      (async () => {
        try {
          const guest = loadGuest();
          if (guest.length > 0) {
            const r = await fetch("/api/cart/merge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: guest }),
            });
            setItems(await readList(r));
            saveGuest([]);
          } else {
            const r = await fetch("/api/cart");
            setItems(await readList(r));
          }
        } catch {
          // rớt mạng/DB: giữ giỏ hiện tại
        }
      })();
    } else if (!userId && prevUser.current) {
      setItems(loadGuest());
    }
    prevUser.current = userId;
  }, [userId, hydrated]);

  // Chỉ persist local khi là khách
  useEffect(() => {
    if (hydrated && !userId) saveGuest(items);
  }, [items, hydrated, userId]);

  const addItem = (item: Omit<CartItem, "qty">, qty = 1) => {
    if (userId) {
      fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item, qty }),
      })
        .then(readList)
        .then(setItems)
        .catch(() => {});
      return;
    }
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

  const removeItem = (slug: string, strap: string) => {
    if (userId) {
      fetch(
        `/api/cart?slug=${encodeURIComponent(slug)}&strap=${encodeURIComponent(strap)}`,
        { method: "DELETE" }
      )
        .then(readList)
        .then(setItems)
        .catch(() => {});
      return;
    }
    setItems((prev) =>
      prev.filter((i) => !(i.slug === slug && i.strap === strap))
    );
  };

  const updateQty = (slug: string, strap: string, qty: number) => {
    if (userId) {
      fetch("/api/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, strap, qty }),
      })
        .then(readList)
        .then(setItems)
        .catch(() => {});
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.slug === slug && i.strap === strap ? { ...i, qty: Math.max(1, qty) } : i
      )
    );
  };

  const clear = () => {
    if (userId) {
      fetch("/api/cart?clear=1", { method: "DELETE" })
        .then(readList)
        .then(setItems)
        .catch(() => {});
      return;
    }
    setItems([]);
  };

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
