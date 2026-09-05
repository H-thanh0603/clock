import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addToCart,
  clearCart,
  getCart,
  mergeGuestCart,
  removeFromCart,
  updateCartQty,
  toClientItem,
  type CartRow,
  type CartStorage,
} from "./cart";
import { USD_TO_VND } from "./pricing";

/** Fake storage in-memory — mô phỏng Prisma model CartItem. */
function makeFakeStorage(): CartStorage & { rows: CartRow[] } {
  const rows: CartRow[] = [];
  const find = (userId: string, slug: string, strap: string) =>
    rows.find(
      (r) => r.productSlug === slug && r.strap === strap
    );
  return {
    rows,
    async list(userId) {
      return rows.filter((r) => r.productSlug !== "__none__"); // mọi row thuộc user fake
    },
    async upsert(userId, key, data) {
      const found = find(userId, key.productSlug, key.strap);
      if (found) {
        found.qty += data.incrementQty;
      } else {
        rows.push({ ...data.create, productSlug: key.productSlug, strap: key.strap });
      }
    },
    async updateQty(userId, key, qty) {
      const found = find(userId, key.productSlug, key.strap);
      if (found) found.qty = qty;
    },
    async remove(userId, key) {
      const idx = rows.findIndex(
        (r) => r.productSlug === key.productSlug && r.strap === key.strap
      );
      if (idx >= 0) rows.splice(idx, 1);
    },
    async clear() {
      rows.length = 0;
    },
  };
}

const UID = "user-1";

let s: ReturnType<typeof makeFakeStorage>;
beforeEach(() => {
  s = makeFakeStorage();
});

describe("cart service — addToCart", () => {
  it("thêm dòng mới với giá chốt server-side (VND suy ra)", async () => {
    const out = await addToCart(s, UID, {
      slug: "chronos-tourbillon-no-07",
      name: "Tourbillon",
      priceUsd: 145000,
      strap: "Dây kim loại tích hợp",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.items).toHaveLength(1);
      expect(out.items[0].priceUsd).toBe(149500);
      expect(out.items[0].priceVnd).toBe(149500 * USD_TO_VND);
    }
  });

  it("bỏ qua mọi giá client không hợp lệ (âm/NaN → 0)", async () => {
    const out = await addToCart(s, UID, {
      slug: "x",
      name: "X",
      priceUsd: -50,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.items[0].priceUsd).toBe(0);
      expect(out.items[0].priceVnd).toBe(0);
    }
  });

  it("cùng slug+strap → tăng qty; khác strap → dòng riêng", async () => {
    await addToCart(s, UID, { slug: "x", name: "X", priceUsd: 100, qty: 2 });
    await addToCart(s, UID, { slug: "x", name: "X", priceUsd: 100, qty: 3 });
    await addToCart(s, UID, {
      slug: "x",
      name: "X",
      priceUsd: 100,
      strap: "Dây kim loại tích hợp",
    });
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0].qty).toBe(5);
    expect(s.rows[1].qty).toBe(1);
  });

  it("thiếu slug/name → 400", async () => {
    const out = await addToCart(s, UID, { name: "Không slug", priceUsd: 1 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
  });

  it("qty bị clamp vào [1, 99]", async () => {
    await addToCart(s, UID, { slug: "x", name: "X", priceUsd: 10, qty: 500 });
    expect(s.rows[0].qty).toBe(99);
    await addToCart(s, UID, { slug: "y", name: "Y", priceUsd: 10, qty: 0 });
    expect(s.rows[1].qty).toBe(1);
  });
});

describe("cart service — update/remove/clear", () => {
  beforeEach(async () => {
    await addToCart(s, UID, { slug: "x", name: "X", priceUsd: 100, qty: 2 });
  });

  it("updateQty đổi số lượng", async () => {
    const out = await updateCartQty(s, UID, { slug: "x", strap: "Tiêu chuẩn Atelier", qty: 7 });
    expect(out.ok).toBe(true);
    expect(s.rows[0].qty).toBe(7);
  });

  it("updateQty thiếu slug → 400", async () => {
    const out = await updateCartQty(s, UID, { strap: "", qty: 3 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
  });

  it("removeItem xoá đúng dòng slug+strap", async () => {
    await removeFromCart(s, UID, { slug: "x", strap: "Tiêu chuẩn Atelier" });
    expect(s.rows).toHaveLength(0);
  });

  it("removeItem thiếu slug → 400", async () => {
    const out = await removeFromCart(s, UID, {});
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
  });

  it("clear xoá sạch", async () => {
    await clearCart(s, UID);
    expect(s.rows).toHaveLength(0);
  });
});

describe("cart service — mergeGuestCart", () => {
  it("gộp dòng hợp lệ, bỏ qua dòng hỏng", async () => {
    const out = await mergeGuestCart(s, UID, [
      { slug: "a", name: "A", priceUsd: 500, qty: 1 },
      { name: "Không slug", priceUsd: 1 },
      null,
      { slug: "b", name: "B", priceUsd: 200, qty: 2 },
    ]);
    expect(out.ok).toBe(true);
    expect(s.rows).toHaveLength(2);
    expect(s.rows.map((r) => r.productSlug).sort()).toEqual(["a", "b"]);
  });

  it("gộp trùng slug+strap → cộng dồn qty", async () => {
    await mergeGuestCart(s, UID, [
      { slug: "a", name: "A", priceUsd: 500, qty: 1 },
      { slug: "a", name: "A", priceUsd: 500, qty: 2 },
    ]);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].qty).toBe(3);
  });

  it("merge đặt giá lại server-side", async () => {
    await mergeGuestCart(s, UID, [
      { slug: "a", name: "A", priceUsd: 500, priceVnd: 1, strap: "Dây cao su kỹ thuật cao cấp" },
    ]);
    expect(s.rows[0].priceUsd).toBe(1700);
    expect(s.rows[0].priceVnd).toBe(BigInt(1700 * USD_TO_VND));
  });
});

describe("toClientItem", () => {
  it("bigint → number, engraving null → undefined", () => {
    const item = toClientItem({
      productSlug: "x",
      name: "X",
      priceUsd: 10,
      priceVnd: BigInt(252000),
      image: "i",
      strap: "s",
      engraving: null,
      qty: 1,
    });
    expect(item.priceVnd).toBe(252000);
    expect(item.engraving).toBeUndefined();
    expect(item.slug).toBe("x");
  });
});
