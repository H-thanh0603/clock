import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<string[]> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => r.productSlug);
  }

  /** Gộp slug local vào DB (bỏ slug rỗng, tối đa 200). */
  async merge(userId: string, slugs: unknown): Promise<string[]> {
    const clean = Array.isArray(slugs)
      ? [...new Set(slugs.map((s) => String(s ?? '').trim()).filter(Boolean))].slice(0, 200)
      : [];
    if (clean.length > 0) {
      await this.prisma.wishlistItem.createMany({
        data: clean.map((productSlug) => ({ userId, productSlug })),
        skipDuplicates: true,
      });
    }
    return this.list(userId);
  }

  async remove(userId: string, slug: string): Promise<string[]> {
    await this.prisma.wishlistItem.deleteMany({
      where: { userId, productSlug: slug },
    });
    return this.list(userId);
  }
}
