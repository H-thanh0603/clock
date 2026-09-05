"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthProvider";
import { csrfFetch } from "@/lib/api-client";

type WishlistContextValue = {
  slugs: string[];
  has: (slug: string) => boolean;
  toggle: (slug: string) => void;
  remove: (slug: string) => void;
  count: number;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

const STORAGE_KEY = "aurel-wishlist";

function loadLocal(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed))
        return parsed.filter((x) => typeof x === "string");
    }
  } catch {
    // bỏ qua dữ liệu hỏng
  }
  return [];
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [slugs, setSlugs] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const prevUser = useRef<string | null>(null);

  useEffect(() => {
    setSlugs(loadLocal());
    setHydrated(true);
  }, []);

  // Đăng nhập: gộp wishlist local lên server. Đăng xuất: về local.
  useEffect(() => {
    if (!hydrated) return;
    if (userId && prevUser.current !== userId) {
      (async () => {
        try {
          const local = loadLocal();
          const r = await csrfFetch("/wishlist/merge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slugs: local }),
          });
          if (r.ok) {
            const list = (await r.json()) as string[];
            setSlugs(list);
            localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
          }
        } catch {
          // rớt mạng: giữ local
        }
      })();
    } else if (!userId && prevUser.current) {
      setSlugs(loadLocal());
    }
    prevUser.current = userId;
  }, [userId, hydrated]);

  useEffect(() => {
    if (hydrated && !userId) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
      } catch {
        // bỏ qua
      }
    }
  }, [slugs, hydrated, userId]);

  const toggle = useCallback(
    (slug: string) => {
      setSlugs((prev) => {
        const next = prev.includes(slug)
          ? prev.filter((s) => s !== slug)
          : [...prev, slug];
        // Đồng bộ server khi đã đăng nhập (fire-and-forget).
        if (userId) {
          if (next.includes(slug)) {
            csrfFetch("/wishlist/merge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slugs: [slug] }),
            }).catch(() => {});
          } else {
            csrfFetch(`/wishlist/${encodeURIComponent(slug)}`, {
              method: "DELETE",
            }).catch(() => {});
          }
        }
        return next;
      });
    },
    [userId]
  );

  const remove = useCallback(
    (slug: string) => {
      setSlugs((prev) => prev.filter((s) => s !== slug));
      if (userId) {
        csrfFetch(`/wishlist/${encodeURIComponent(slug)}`, {
          method: "DELETE",
        }).catch(() => {});
      }
    },
    [userId]
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
