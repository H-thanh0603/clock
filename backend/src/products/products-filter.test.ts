import { describe, expect, it } from 'vitest';
import { ProductsService } from './products.service';

/**
 * Filter catalog mới: condition (CPO) + khoá giá server-side minUsd/maxUsd.
 * Stub Prisma bắt `where` để assert đúng điều kiện đẩy vào AND.
 */
const ROW = {
  slug: 'cpo-speedy',
  name: 'Speedy CPO',
  reference: 'CPO-1',
  collection: 'sport',
  priceUsd: 6800,
  priceVnd: BigInt(171360000),
  shortDescription: 'x',
  badges: [],
  strapLabel: 'Da',
  cardImage: '/img.jpg',
  images: [],
  calibre: 'CAL',
  diameterMm: 42,
  caseMaterial: 'Steel',
  complications: [],
  inBoutique: true,
  stock: 1,
  condition: 'PRE_OWNED',
  certifiedBy: 'Atelier',
  ratingValue: 4.6,
  ratingCount: 12,
};

const meiliOff = { enabled: false } as never;

function prismaCapture() {
  const wheres: Record<string, unknown>[] = [];
  const prisma = {
    product: {
      findMany: ({ where }: { where: Record<string, unknown> }) => {
        wheres.push(where);
        return Promise.resolve([ROW]);
      },
      count: () => Promise.resolve(1),
    },
  } as never;
  return { prisma, wheres };
}

const and = (w: Record<string, unknown>) =>
  (w.AND as Record<string, unknown>[]) ?? [];

describe('ProductsService.list — condition + price band', () => {
  it('condition=PRE_OWNED → where condition đúng', async () => {
    const { prisma, wheres } = prismaCapture();
    const svc = new ProductsService(prisma, meiliOff);
    await svc.list({ condition: 'PRE_OWNED' });
    expect(and(wheres[0])).toContainEqual({ condition: 'PRE_OWNED' });
  });

  it('condition=NEW → OR null/NEW (row cũ chưa có cột vẫn hiện)', async () => {
    const { prisma, wheres } = prismaCapture();
    const svc = new ProductsService(prisma, meiliOff);
    await svc.list({ condition: 'NEW' });
    expect(and(wheres[0])).toContainEqual({
      OR: [{ condition: null }, { condition: 'NEW' }],
    });
  });

  it('minUsd/maxUsd → khoá priceUsd server-side', async () => {
    const { prisma, wheres } = prismaCapture();
    const svc = new ProductsService(prisma, meiliOff);
    await svc.list({ minUsd: 1500, maxUsd: 10000 });
    const a = and(wheres[0]);
    expect(a).toContainEqual({ priceUsd: { gte: 1500 } });
    expect(a).toContainEqual({ priceUsd: { lte: 10000 } });
  });

  it('condition + band cùng lúc → hasFilters (không shortcut Meili relevance)', async () => {
    const { prisma, wheres } = prismaCapture();
    const meiliHit = {
      enabled: true,
      searchSlugs: () => Promise.resolve(['cpo-speedy']),
    } as never;
    const svc = new ProductsService(prisma, meiliHit);
    const r = await svc.list({ q: 'speedy', condition: 'PRE_OWNED', minUsd: 1 });
    expect(r.total).toBe(1);
    // có filter → đi đường findMany+where thường, không phải listBySlugs
    const a = and(wheres[0]);
    expect(a).toContainEqual({ condition: 'PRE_OWNED' });
    expect(a).toContainEqual({ priceUsd: { gte: 1 } });
    expect(a).toContainEqual({ slug: { in: ['cpo-speedy'] } });
  });
});
