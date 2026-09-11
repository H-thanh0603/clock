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

/** Fake PriceLookup — giả lập bảng Product trong DB: giá gốc theo slug.
 *  Slug không có trong map = không tồn tại/được bán → normalizeLine từ chối. */
function makePrices(entries: Record<string, number>) {
  const m = new Map(
    Object.entries(entries).map(([slug, usd]) => [slug, { priceUsd: usd }])
  );
  return async (slugs: string[]) =>
    new Map(
      slugs
        .map((s) => [s, m.get(s)] as const)
        .filter((e): e is readonly [string, { priceUsd: number }] => e[1] != null)
        .map((e) => [e[0], e[1]] as [string, { priceUsd: number }])
    );
}
const makePricesSync = makePrices;

let s: ReturnType<typeof makeFakeStorage>;
beforeEach(() => {
  s = makeFakeStorage();
});

describe("cart service — addToCart", () => {
  it("thêm dòng mới với giá chốt server-side (VND suy ra)", async () => {
    // Giá client gửi 1 USD — server PHẢI dùng giá DB 145000 (SEC).
    const out = await addToCart(s, UID, {
      slug: "chronos-tourbillon-no-07",
      name: "Tourbillon",
      priceUsd: 1,
      strap: "Dây kim loại tích hợp",
    }, makePrices({ "chronos-tourbillon-no-07": 145000 }));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.items).toHaveLength(1);
      expect(out.items[0].priceUsd).toBe(149500);
      expect(out.items[0].priceVnd).toBe(149500 * USD_TO_VND);
    }
  });

  it("slug không có trong DB → 400 (không thêm hàng bespoke/giả vào cart)", async () => {
    const out = await addToCart(s, UID, {
      slug: "x",
      name: "X",
      priceUsd: 999,
    }, makePrices({}));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
  });

  it("cùng slug+strap → tăng qty; khác strap → dòng riêng", async () => {
    const prices = makePrices({ x: 100 });
    await addToCart(s, UID, { slug: "x", name: "X", priceUsd: 100, qty: 2 }, prices);
    await addToCart(s, UID, { slug: "x", name: "X", priceUsd: 100, qty: 3 }, prices);
    await addToCart(s, UID, {
      slug: "x",
      name: "X",
      priceUsd: 100,
      strap: "Dây kim loại tích hợp",
    }, prices);
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0].qty).toBe(5);
    expect(s.rows[1].qty).toBe(1);
  });

  it("thiếu slug/name → 400", async () => {
    const out = await addToCart(s, UID, { name: "Không slug", priceUsd: 1 }, makePrices({}));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
  });

  it("qty bị clamp vào [1, 99]", async () => {
    const prices = makePrices({ x: 10, y: 10 });
    await addToCart(s, UID, { slug: "x", name: "X", priceUsd: 10, qty: 500 }, prices);
    expect(s.rows[0].qty).toBe(99);
    await addToCart(s, UID, { slug: "y", name: "Y", priceUsd: 10, qty: 0 }, prices);
    expect(s.rows[1].qty).toBe(1);
  });
});

describe("cart service — update/remove/clear", () => {
  const prices = makePricesSync({ x: 100 });
  beforeEach(async () => {
    await addToCart(s, UID, { slug: "x", name: "X", priceUsd: 100, qty: 2 }, prices);
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
    const out = await mergeGuestCart(
      s,
      UID,
      [
        { slug: "a", name: "A", priceUsd: 500, qty: 1 },
        { name: "Không slug", priceUsd: 1 },
        null,
        { slug: "b", name: "B", priceUsd: 200, qty: 2 },
      ],
      makePrices({ a: 500, b: 200 })
    );
    expect(out.ok).toBe(true);
    expect(s.rows).toHaveLength(2);
    expect(s.rows.map((r) => r.productSlug).sort()).toEqual(["a", "b"]);
  });

  it("gộp trùng slug+strap → cộng dồn qty", async () => {
    await mergeGuestCart(
      s,
      UID,
      [
        { slug: "a", name: "A", priceUsd: 500, qty: 1 },
        { slug: "a", name: "A", priceUsd: 500, qty: 2 },
      ],
      makePrices({ a: 500 })
    );
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].qty).toBe(3);
  });

  it("merge đặt giá lại server-side — bỏ qua giá client giả", async () => {
    await mergeGuestCart(
      s,
      UID,
      [{ slug: "a", name: "A", priceUsd: 1, priceVnd: 1, strap: "Dây cao su kỹ thuật cao cấp" }],
      makePrices({ a: 500 })
    );
    // Giá DB 500 + strap 1200 = 1700 — client gửi 1 bị bỏ qua.
    expect(s.rows[0].priceUsd).toBe(1700);
    expect(s.rows[0].priceVnd).toBe(BigInt(1700 * USD_TO_VND));
  });

  it("merge dùng upsertMany 1 roundtrip khi storage hỗ trợ", async () => {
    const batched: unknown[][] = [];
    const storage = {
      ...s,
      upsertMany: async (_uid: string, lines: unknown[]) => {
        batched.push(lines);
        for (const l of lines as { key: { productSlug: string; strap: string }; data: { create: CartRow; incrementQty: number } }[]) {
          await s.upsert(_uid, l.key, l.data);
        }
      },
    };
    const out = await mergeGuestCart(
      storage,
      UID,
      [
        { slug: "a", name: "A", priceUsd: 100 },
        { slug: "b", name: "B", priceUsd: 200 },
        { slug: "", name: "" },
      ],
      makePrices({ a: 100, b: 200 })
    );
    expect(batched).toHaveLength(1);
    expect(batched[0]).toHaveLength(2);
    if (!out.ok) throw new Error("merge phải ok");
    expect(out.items).toHaveLength(2);
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
