import { describe, expect, it } from 'vitest';
import { AdminListingsService } from './admin-listings.service';

describe('AdminListingsService CPO', () => {
  function makePrisma() {
    const stored: Record<string, Record<string, unknown>> = {
      p1: {
        slug: 'p1', name: 'X', reference: 'R1', collection: 'classic',
        priceUsd: 1000, priceVnd: 25200000n, shortDescription: '', badges: [],
        strapLabel: '', cardImage: '', images: [], calibre: '', diameterMm: 40,
        caseMaterial: '', complications: [], inBoutique: true, stock: 1,
        specs: [], narrative: '', condition: null, certifiedBy: null,
        certifiedAt: null, serviceHistory: null, ratingValue: null,
        ratingCount: null,
      },
    };
    const prisma = {
      product: {
        findUnique: ({ where }: { where: { slug: string } }) =>
          Promise.resolve(stored[where.slug] ?? null),
        update: ({ where, data }: { where: { slug: string }; data: Record<string, unknown> }) => {
          if (!stored[where.slug]) return Promise.reject(new Error('P2025'));
          stored[where.slug] = { ...stored[where.slug], ...data };
          return Promise.resolve(stored[where.slug]);
        },
      },
      productEvent: {
        create: () => Promise.resolve({}),
      },
    };
    return { prisma, stored };
  }
  const svcOf = (prisma: unknown) =>
    new AdminListingsService(
      prisma as never,
      {} as never,
      { upsertProduct: async () => {} } as never,
    );

  it('PRE_OWNED + chứng thư + serviceHistory (dọc rác bị loại) + rating', async () => {
    const f = makePrisma();
    await svcOf(f.prisma).updateProduct('p1', {
      condition: 'pre_owned',
      certifiedBy: 'Aurel Atelier',
      certifiedAt: '2026-09-01',
      serviceHistory: [
        { date: '2026-09', label: 'CPO 124 điểm' },
        { date: '', label: 'dòng thiếu ngày' },
        { date: '2025-11', label: 'Full service', detail: 'thay dầu' },
      ],
      ratingValue: 4.6,
      ratingCount: 12,
    });
    const row = f.stored.p1;
    expect(row.condition).toBe('PRE_OWNED');
    expect((row.certifiedAt as Date).toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(row.serviceHistory).toHaveLength(2);
    expect(row.ratingValue).toBe(4.6);
    expect(row.ratingCount).toBe(12);
  });

  it('condition/rating ngoài danh sách → null; ngày rác → 400', async () => {
    const f = makePrisma();
    const svc = svcOf(f.prisma);
    await svc.updateProduct('p1', { condition: 'LIKE_NEW', ratingValue: 9 });
    expect(f.stored.p1.condition).toBeNull();
    expect(f.stored.p1.ratingValue).toBeNull();
    await expect(
      svc.updateProduct('p1', { certifiedAt: 'khong-phai-ngay' }),
    ).rejects.toThrow(/ngày/);
  });
});
