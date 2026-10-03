import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const OLD_ENV = { ...process.env };
import { AdminPromotionsService } from './admin-promotions.service';

describe('AdminPromotionsService', () => {
  const basePrisma = () => ({
    product: {
      findMany: () => Promise.resolve([]),
    },
    promotion: {
      create: ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'promo-1', ...data }),
      findMany: () => Promise.resolve([]),
      update: () => Promise.resolve({ id: 'promo-1', active: false }),
    },
  });

  it('tạo promotion hợp lệ', async () => {
    const svc = new AdminPromotionsService(basePrisma() as never, { upsertProduct: async () => {} } as never);
    const r = await svc.createPromotion(
      {
        name: 'Mid-season 10%',
        listingSlugs: ['a', 'b'],
        discountPct: 10,
        startsAt: '2026-09-01',
        endsAt: '2026-09-30',
      },
      'admin-1',
    );
    expect(r.name).toBe('Mid-season 10%');
  });

  it('discountPct = 0 hoặc > 90 bị từ chối', async () => {
    const svc = new AdminPromotionsService(basePrisma() as never, { upsertProduct: async () => {} } as never);
    await expect(
      svc.createPromotion({
        name: 'x',
        listingSlugs: ['a'],
        discountPct: 0,
        startsAt: '2026-09-01',
        endsAt: '2026-09-30',
      }),
    ).rejects.toThrow(/discountPct/);
    await expect(
      svc.createPromotion({
        name: 'x',
        listingSlugs: ['a'],
        discountPct: 95,
        startsAt: '2026-09-01',
        endsAt: '2026-09-30',
      }),
    ).rejects.toThrow(/discountPct/);
  });

  it('starts >= ends bị từ chối', async () => {
    const svc = new AdminPromotionsService(basePrisma() as never, { upsertProduct: async () => {} } as never);
    await expect(
      svc.createPromotion({
        name: 'x',
        listingSlugs: ['a'],
        discountPct: 10,
        startsAt: '2026-09-30',
        endsAt: '2026-09-01',
      }),
    ).rejects.toThrow(/Khung ngày/);
  });
});
describe('AdminPromotionsService expiry', () => {
  /** Fake đủ cho create/close promotion: product + event + tx. */
  function makePromoPrisma(opts: {
    products: Record<string, number>;
    promos: Record<string, unknown>;
    dueIds?: string[];
  }) {
    const products = new Map(Object.entries(opts.products));
    const promos = new Map(Object.entries(opts.promos));
    const events: unknown[] = [];
    const created: unknown[] = [];
    const tx = {
      product: {
        findUnique: ({ where }: { where: { slug: string } }) => {
          const priceUsd = products.get(where.slug);
          return Promise.resolve(
            priceUsd === undefined ? null : { priceUsd },
          );
        },
        update: ({
          where,
          data,
        }: {
          where: { slug: string };
          data: { priceUsd: number };
        }) => {
          products.set(where.slug, data.priceUsd);
          return Promise.resolve({ slug: where.slug, ...data });
        },
      },
      productEvent: {
        create: ({ data }: { data: unknown }) => {
          events.push(data);
          return Promise.resolve({});
        },
      },
      promotion: {
        update: ({
          where,
          data,
        }: {
          where: { id: string };
          data: { active: boolean };
        }) => {
          const p = promos.get(where.id) as Record<string, unknown>;
          promos.set(where.id, { ...p, ...data });
          return Promise.resolve(promos.get(where.id));
        },
      },
    };
    const prisma = {
      product: {
        findMany: ({
          where,
        }: {
          where: { slug: { in: string[] } };
        }) =>
          Promise.resolve(
            where.slug.in
              .filter((s: string) => products.has(s))
              .map((s: string) => ({ slug: s, priceUsd: products.get(s) })),
          ),
        findUnique: ({ where }: { where: { slug: string } }) => {
          const priceUsd = products.get(where.slug);
          return Promise.resolve(
            priceUsd === undefined
              ? null
              : { slug: where.slug, priceUsd, priceVnd: BigInt(priceUsd * 25200) },
          );
        },
      },
      productEvent: tx.productEvent,
      promotion: {
        findMany: () =>
          Promise.resolve(
            (opts.dueIds ?? []).map((id) => ({ id })),
          ),
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(promos.get(where.id) ?? null),
        create: ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve({ id: 'promo-new', ...data });
        },
        update: tx.promotion.update,
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    };
    const meili = { upsertProduct: async () => {} };
    return { prisma, products, promos, events, created, meili };
  }

  const svcOf = (f: ReturnType<typeof makePromoPrisma>) =>
    new AdminPromotionsService(
      f.prisma as never,
      { upsertProduct: f.meili.upsertProduct } as never,
    );

  it('tạo promotion snapshot giá gốc + chặn promotion chồng lên SP đang chạy', async () => {
    const f = makePromoPrisma({
      products: { a: 100000, b: 50000 },
      promos: {},
      dueIds: [],
    });
    // findMany overlap: giả có promo active khác đang giữ slug 'a'.
    (f.prisma.promotion as { findMany: unknown }).findMany = () =>
      Promise.resolve([
        { id: 'p-old', name: 'Tet 5%', listingSlugs: ['a'] },
      ]);
    const svc = svcOf(f);
    await expect(
      svc.createPromotion(
        {
          name: 'Mới',
          listingSlugs: ['a'],
          discountPct: 10,
          startsAt: '2026-09-01',
          endsAt: '2026-09-30',
        },
        'admin-1',
      ),
    ).rejects.toThrow(/đang chạy/);
    // Không chồng thì tạo được + snapshot giá gốc.
    const r = await svc.createPromotion(
      {
        name: 'Mới',
        listingSlugs: ['b'],
        discountPct: 10,
        startsAt: '2026-09-01',
        endsAt: '2026-09-30',
      },
      'admin-1',
    );
    expect((r.priceSnapshot as Record<string, number>).b).toBe(50000);
  });

  it('closePromotion hồi giá đã đổi, bỏ qua giá đã đúng, tắt active', async () => {
    const f = makePromoPrisma({
      // a đang giá KM 90000 (gốc 100000) → hồi; b đã đúng 50000 → bỏ qua.
      products: { a: 90000, b: 50000 },
      promos: {
        'p-1': {
          id: 'p-1',
          name: 'Sale 10%',
          listingSlugs: ['a', 'b'],
          priceSnapshot: { a: 100000, b: 50000 },
          active: true,
        },
      },
    });
    const svc = svcOf(f);
    const r = await svc.closePromotion('p-1', 'Hết hạn (test)');
    expect(r.restored).toBe(1);
    expect(f.products.get('a')).toBe(100000);
    expect(f.products.get('b')).toBe(50000);
    expect((f.promos.get('p-1') as { active: boolean }).active).toBe(false);
    expect(
      (f.events as { action: string }[]).filter((e) => e.action === 'PROMO_END'),
    ).toHaveLength(1);
  });

  it('setPromotionActive(false) cũng hồi giá (tắt tay giữa chừng)', async () => {
    const f = makePromoPrisma({
      products: { a: 90000 },
      promos: {
        'p-1': {
          id: 'p-1',
          name: 'Sale',
          listingSlugs: ['a'],
          priceSnapshot: { a: 100000 },
          active: true,
        },
      },
    });
    const svc = svcOf(f);
    await svc.setPromotionActive('p-1', false);
    expect(f.products.get('a')).toBe(100000);
    expect((f.promos.get('p-1') as { active: boolean }).active).toBe(false);
  });
});

describe('AdminPromotionsService Jev copy guardrail', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllGlobals();
  });

  it('thiếu key → tạo bình thường, không warning', async () => {
    delete process.env.JEV_API_KEY;
    const prisma = {
      product: { findMany: () => Promise.resolve([]) },
      promotion: {
        create: ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'promo-1', ...data }),
        findMany: () => Promise.resolve([]),
      },
    } as never;
    const svc = new AdminPromotionsService(
      prisma,
      { upsertProduct: async () => {} } as never,
    );
    const r = (await svc.createPromotion(
      {
        name: 'Sale',
        listingSlugs: ['a'],
        discountPct: 10,
        startsAt: '2026-09-01',
        endsAt: '2026-09-30',
      },
      'a1',
    )) as Record<string, unknown>;
    expect(r.name).toBe('Sale');
    expect(r.jevWarning).toBeUndefined();
  });
});
