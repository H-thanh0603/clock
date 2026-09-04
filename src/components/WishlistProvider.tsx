"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type WishlistContextValue = {
  slugs: string[];
  has: (slug: string) => boolean;
  toggle: (slug: string) => void;
  remove: (slug: string) => void;
  count: number;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

const STORAGE_KEY = "aurel-wishlist";

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSlugs(parsed.filter((x) => typeof x === "string"));
      }
    } catch {
      // bỏ qua dữ liệu hỏng
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  }, [slugs, hydrated]);

  const toggle = useCallback(
    (slug: string) =>
      setSlugs((prev) =>
        prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
      ),
    []
  );

  const remove = useCallback(
    (slug: string) => setSlugs((prev) => prev.filter((s) => s !== slug)),
    []
  );

  const has = useCallback((slug: string) => slugs.includes(slug), [slugs]);

  return (
    <WishlistContext.Provider value={{ slugs, has, toggle, remove, count: slugs.length }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist phải dùng trong WishlistProvider");
  return ctx;
}
