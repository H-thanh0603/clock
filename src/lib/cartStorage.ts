import { prisma } from "@/lib/db";
import type { CartRow, CartStorage } from "@/lib/cart";

/**
 * Triển khai CartStorage bằng Prisma (Postgres).
 * Đây là adapter duy nhất chạm DB — service lib/cart thuần, test được.
 */
export const prismaCartStorage: CartStorage = {
  async list(userId) {
    const rows = await prisma.cartItem.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      productSlug: r.productSlug,
      name: r.name,
      priceUsd: r.priceUsd,
      priceVnd: r.priceVnd,
      image: r.image,
      strap: r.strap,
      engraving: r.engraving,
      qty: r.qty,
    }));
  },

  async upsert(userId, key, data) {
    await prisma.cartItem.upsert({
      where: {
        userId_productSlug_strap: {
          userId,
          productSlug: key.productSlug,
          strap: key.strap,
        },
      },
      update: { qty: { increment: data.incrementQty } },
      create: {
        userId,
        productSlug: data.create.productSlug,
        name: data.create.name,
        priceUsd: data.create.priceUsd,
        priceVnd: data.create.priceVnd,
        image: data.create.image,
        strap: data.create.strap,
        engraving: data.create.engraving,
        qty: data.create.qty,
      },
    });
  },

  async updateQty(userId, key, qty) {
    await prisma.cartItem.updateMany({
      where: { userId, productSlug: key.productSlug, strap: key.strap },
      data: { qty },
    });
  },

  async remove(userId, key) {
    await prisma.cartItem.deleteMany({
      where: { userId, productSlug: key.productSlug, strap: key.strap },
    });
  },

  async clear(userId) {
    await prisma.cartItem.deleteMany({ where: { userId } });
  },
} satisfies CartStorage;
