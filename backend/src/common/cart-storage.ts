import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CartRow, CartStorage } from './cart';

/**
 * Triển khai CartStorage bằng Prisma (Postgres).
 * Adapter duy nhất chạm DB — service cart thuần, test được.
 */
@Injectable()
export class PrismaCartStorage implements CartStorage {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<CartRow[]> {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
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
  }

  async upsert(
    userId: string,
    key: { productSlug: string; strap: string },
    data: {
      create: Omit<CartRow, 'productSlug' | 'strap'> & {
        productSlug: string;
        strap: string;
      };
      incrementQty: number;
    },
  ): Promise<void> {
    await this.prisma.cartItem.upsert({
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
  }

  async updateQty(
    userId: string,
    key: { productSlug: string; strap: string },
    qty: number,
  ): Promise<void> {
    await this.prisma.cartItem.updateMany({
      where: { userId, productSlug: key.productSlug, strap: key.strap },
      data: { qty },
    });
  }

  async remove(
    userId: string,
    key: { productSlug: string; strap: string },
  ): Promise<void> {
    await this.prisma.cartItem.deleteMany({
      where: { userId, productSlug: key.productSlug, strap: key.strap },
    });
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
  }
}
