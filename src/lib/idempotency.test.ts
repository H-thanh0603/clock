import { describe, expect, it } from "vitest";
import {
  checkoutFingerprint,
  clearCheckoutKey,
  getCheckoutKey,
  type KeyStorage,
} from "./idempotency";

function mem(): KeyStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}

const LINES = [
  { slug: "vip-1", qty: 1, priceUsd: 1000 },
  { slug: "vip-2", qty: 2, priceUsd: 500 },
];

describe("checkoutFingerprint", () => {
  it("ổn định, không phụ thuộc thứ tự, đổi giỏ là đổi fingerprint", () => {
    const a = checkoutFingerprint(LINES);
    const b = checkoutFingerprint([...LINES].reverse());
    expect(a).toBe(b);
    expect(checkoutFingerprint([{ ...LINES[0], qty: 2 }, LINES[1]])).not.toBe(a);
    expect(checkoutFingerprint([])).not.toBe(a);
  });
});

describe("getCheckoutKey/clearCheckoutKey", () => {
  it("cùng fingerprint → cùng key (retry dùng lại); clear xong → key mới", () => {
    const store = mem();
    const fp = checkoutFingerprint(LINES);
    const k1 = getCheckoutKey(fp, store);
    expect(k1).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(getCheckoutKey(fp, store)).toBe(k1);
    clearCheckoutKey(fp, store);
    expect(getCheckoutKey(fp, store)).not.toBe(k1);
  });

  it("khác fingerprint → khác key (đổi giỏ không replay đơn cũ)", () => {
    const store = mem();
    const k1 = getCheckoutKey(checkoutFingerprint(LINES), store);
    const k2 = getCheckoutKey(
      checkoutFingerprint([{ ...LINES[0], qty: 9 }, LINES[1]]),
      store,
    );
    expect(k2).not.toBe(k1);
  });
});
