"use client";

import { createContext, useContext, useState } from "react";
import { site } from "@/data/site";

type Currency = "USD" | "VND";

type CurrencyContextValue = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Hiển thị giá: nhận giá gốc USD và giá gốc VND của sản phẩm */
  price: (usd: number, vnd: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("VND");

  const price = (usd: number, vnd: number) => {
    if (currency === "USD") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(usd);
    }
    return `${new Intl.NumberFormat("vi-VN").format(vnd)} ₫`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, price }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency phải dùng trong CurrencyProvider");
  return ctx;
}

export { site };
