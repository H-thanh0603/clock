import { describe, expect, it } from 'vitest';
import { AdminService } from './admin.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Fake Prisma cho updateStatus — mô phỏng đúng semantic conditional
 * updateMany: chỉ thắng khi status DB khớp where.status.
 */
function makePrisma(initialStatus: string) {
  const state = { status: initialStatus };
  const restocked = new Map<string, number>();
  const events: unknown[] = [];
  const order = {
    id: 'ord-1',
    status: initialStatus,
    userId: 'u-1',
    totalUsd: 100000,
    totalVnd: BigInt(2520000000),
    paidUsd: 0,
    paidVnd: BigInt(0),
    items: [{ productSlug: 'vip-1', qty: 2 }],
  };
  const payments: unknown[] = [];
  const prisma = {
    order: {
      findUnique: ({ include }: { include?: { items?: boolean } }) =>
        Promise.resolve(
          include?.items
            ? { ...order, status: state.status }
            : { id: order.id, status: state.status },
        ),
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: { status: string };
      }) => {
        const win = state.status === where.status;
        if (win) state.status = data.status;
        return Promise.resolve(win ? { count: 1 } : { count: 0 });
      },
      update: ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(order, data);
        return Promise.resolve({ ...order, status: state.status });
      },
    },
    payment: {
      create: ({ data }: { data: unknown }) => {
        payments.push(data);
        return Promise.resolve({ id: 'pay-1', ...(data as object) });
      },
    },
    product: {
      updateMany: ({
        where,
        data,
      }: {
        where: { slug: string };
        data: { stock: { increment: number } };
      }) => {
        restocked.set(
          where.slug,
          (restocked.get(where.slug) ?? 0) + data.stock.increment,
        );
        return Promise.resolve({ count: 1 });
      },
    },
    orderEvent: {
      create: (a: unknown) => {
        events.push(a);
        return Promise.resolve({});
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return {
    prisma: prisma as unknown as PrismaService,
    restocked,
    events,
    payments,
    state,
  };
}

describe('AdminService.updateStatus', () => {
  it('PENDING → CANCELLED: hoàn tồn kho + ghi event', async () => {
    const { prisma, restocked, events } = makePrisma('PENDING');
    const svc = new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never);
    const r = await svc.updateStatus('ord-1', 'CANCELLED', 'admin-1');
    expect(r.status).toBe('CANCELLED');
    expect(restocked.get('vip-1')).toBe(2);
    expect(events).toHaveLength(1);
  });

  it('CONFIRMED → CANCELLED: vẫn hoàn tồn kho (trước đây bị rò)', async () => {
    const { prisma, restocked } = makePrisma('CONFIRMED');
    const svc = new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never);
    await svc.updateStatus('ord-1', 'CANCELLED', 'admin-1');
    expect(restocked.get('vip-1')).toBe(2);
  });

  it('PAID → CANCELLED: bị chặn — tiền đã thu phải đi qua REFUNDED', async () => {
    const { prisma, restocked } = makePrisma('PAID');
    const svc = new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never);
    await expect(svc.updateStatus('ord-1', 'CANCELLED', 'admin-1')).rejects.toThrow(
      /Không thể chuyển từ PAID sang CANCELLED/,
    );
    expect(restocked.size).toBe(0);
  });

  it('PAID → REFUNDED kèm refundRef: hoàn tồn kho + ghi event có ref', async () => {
    const { prisma, restocked, events } = makePrisma('PAID');
    const svc = new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never);
    const r = await svc.updateStatus('ord-1', 'REFUNDED', 'admin-1', {
      refundRef: 'VNP-REF-123',
    });
    expect(r.status).toBe('REFUNDED');
    expect(restocked.get('vip-1')).toBe(2);
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).toContain('VNP-REF-123');
  });

  it('PAID → REFUNDED thiếu refundRef: 400 (kỷ luật sổ sách)', async () => {
    const { prisma, restocked } = makePrisma('PAID');
    const svc = new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never);
    await expect(svc.updateStatus('ord-1', 'REFUNDED', 'admin-1')).rejects.toThrow(
      /refundRef/,
    );
    expect(restocked.size).toBe(0);
  });

  it('REFUNDED là trạng thái cuối: không chuyển tiếp đi đâu', async () => {
    const { prisma } = makePrisma('REFUNDED');
    const svc = new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never);
    await expect(svc.updateStatus('ord-1', 'PAID', 'admin-1')).rejects.toThrow(
      /Không thể chuyển/,
    );
  });

  it('PENDING → PAID kèm paymentRef: sinh Payment manual + chốt paid đủ', async () => {
    const { prisma, payments, events } = makePrisma('PENDING');
    const svc = new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never);
    const r = await svc.updateStatus('ord-1', 'PAID', 'admin-1', {
      paymentRef: 'BANK-2026-001',
    });
    expect(r.status).toBe('PAID');
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      orderId: 'ord-1',
      method: 'manual',
      amountUsd: 100000,
      status: 'SUCCESS',
      txnRef: 'BANK-2026-001',
    });
    expect(JSON.stringify(events[0])).toContain('BANK-2026-001');
  });

  it('PENDING → PAID thiếu paymentRef: 400, không ghi Payment', async () => {
    const { prisma, payments } = makePrisma('PENDING');
    const svc = new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never);
    await expect(svc.updateStatus('ord-1', 'PAID', 'admin-1')).rejects.toThrow(
      /paymentRef/,
    );
    expect(payments).toHaveLength(0);
  });

  it('hai admin đua nhau → đúng 1 bên thắng, không ghi event đúp', async () => {
    const { prisma, events } = makePrisma('PENDING');
    const svc = new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never);
    // Cả hai đều đọc thấy PENDING (race thật), DB conditional update phân thắng.
    const order = {
      id: 'ord-1',
      status: 'PENDING',
      userId: 'u-1',
      items: [{ productSlug: 'vip-1', qty: 2 }],
    };
    (prisma as unknown as { order: { findUnique: unknown } }).order.findUnique =
      ({ include }: { include?: { items?: boolean } }) =>
        Promise.resolve(
          include?.items
            ? { ...order, status: 'PENDING' }
            : { id: order.id, status: 'PENDING' }
        );
    const [r1, r2] = await Promise.allSettled([
      svc.updateStatus('ord-1', 'CANCELLED', 'admin-1'),
      svc.updateStatus('ord-1', 'CANCELLED', 'admin-2'),
    ]);
    const wins = [r1, r2].filter((r) => r.status === 'fulfilled').length;
    expect(wins).toBe(1);
    expect(events).toHaveLength(1);
  });

  it('PENDING → COMPLETED: chặn nhảy cóc trạng thái', async () => {
    const { prisma } = makePrisma('PENDING');
    const svc = new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never);
    await expect(svc.updateStatus('ord-1', 'COMPLETED')).rejects.toThrow(
      /Không thể chuyển/,
    );
  });
});

describe('AdminService.promotions', () => {
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
    const svc = new AdminService(basePrisma() as never, {} as never, { upsertProduct: async () => {} } as never);
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
    const svc = new AdminService(basePrisma() as never, {} as never, { upsertProduct: async () => {} } as never);
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
    const svc = new AdminService(basePrisma() as never, {} as never, { upsertProduct: async () => {} } as never);
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

describe('AdminService.campaigns', () => {
  it('tạo campaign + update status hợp lệ', async () => {
    const prisma = {
      campaign: {
        create: ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'c-1', ...data }),
        update: ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'c-1', ...data }),
      },
    };
    const svc = new AdminService(prisma as never, {} as never, { upsertProduct: async () => {} } as never);
    const c = await svc.createCampaign({ name: 'Launch', budgetUsd: 500 }, 'a1');
    expect(c.status).toBe('draft');
    const u = await svc.updateCampaign('c-1', { status: 'active' });
    expect(u.status).toBe('active');
    await expect(svc.updateCampaign('c-1', { status: 'bogus' })).rejects.toThrow(
      /Status campaign/,
    );
  });
});

describe('AdminService.metrics', () => {
  it('sales map rows thành points ngày', async () => {
    const prisma = {
      $queryRaw: () =>
        Promise.resolve([
          { bucket: new Date('2026-09-10T00:00:00Z'), value: BigInt(1500) },
          { bucket: new Date('2026-09-11T00:00:00Z'), value: BigInt(200) },
        ]),
    };
    const svc = new AdminService(prisma as never, {} as never, { upsertProduct: async () => {} } as never);
    const r = await svc.metrics('sales', 'day', 30);
    expect(r.points).toEqual([
      { date: '2026-09-10', value: 1500 },
      { date: '2026-09-11', value: 200 },
    ]);
  });

  it('metric lạ trả points rỗng (không bịa số)', async () => {
    const svc = new AdminService({} as never, {} as never, { upsertProduct: async () => {} } as never);
    const r = await svc.metrics('traffic', 'day', 30);
    expect(r.points).toEqual([]);
  });
});

describe('AdminService.promotions expiry', () => {
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
    new AdminService(
      f.prisma as never,
      {} as never,
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

describe('PromotionExpireService', () => {
  it('đóng mọi promotion quá hạn, bỏ qua cái lỗi (không dừng vòng)', async () => {
    const { PromotionExpireService } = await import(
      './promotion-expire.service'
    );
    const closed: string[] = [];
    const prisma = {
      promotion: {
        findMany: () =>
          Promise.resolve([{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }]),
      },
    };
    const admin = {
      closePromotion: async (id: string) => {
        if (id === 'p-2') throw new Error('kẹt');
        closed.push(id);
        return { id, restored: 1 };
      },
    };
    const svc = new PromotionExpireService(
      prisma as never,
      admin as never,
    );
    expect(await svc.expireDue()).toBe(2);
    expect(closed).toEqual(['p-1', 'p-3']);
  });

  it('không có promotion quá hạn → 0, không gọi close', async () => {
    const { PromotionExpireService } = await import(
      './promotion-expire.service'
    );
    const prisma = { promotion: { findMany: () => Promise.resolve([]) } };
    const admin = { closePromotion: async () => ({ restored: 0 }) };
    const svc = new PromotionExpireService(prisma as never, admin as never);
    expect(await svc.expireDue()).toBe(0);
  });
});

describe('productDiff (audit diff old/new)', () => {
  it('chỉ ghi field thực sự đổi, kèm from/to', async () => {
    const { productDiff } = await import('./admin.service');
    const before = { priceUsd: 100, name: 'A', stock: 5 };
    const after = { priceUsd: 120, name: 'A', stock: 5 };
    expect(productDiff(before, after, ['priceUsd', 'name', 'stock'])).toEqual({
      priceUsd: { from: 100, to: 120 },
    });
  });

  it('không đổi gì → {} (summary vẫn là no-change)', async () => {
    const { productDiff } = await import('./admin.service');
    const row = { priceUsd: 100 };
    expect(productDiff(row, { ...row }, ['priceUsd'])).toEqual({});
  });

  it('null vs giá trị là 1 thay đổi (bật/tắt field optional)', async () => {
    const { productDiff } = await import('./admin.service');
    expect(productDiff({ narrative: null }, { narrative: 'x' }, ['narrative']))
      .toEqual({ narrative: { from: null, to: 'x' } });
  });

  it('value dài bị cắt, mảng lớn bị rút gọn — event không phình', async () => {
    const { productDiff } = await import('./admin.service');
    const diff = productDiff(
      { narrative: 'a'.repeat(900), specs: new Array(50).fill('s') },
      { narrative: 'b'.repeat(900), specs: new Array(50).fill('t') },
      ['narrative', 'specs'],
    );
    expect(String(diff.narrative.to)).toHaveLength(501);
    expect(Array.isArray(diff.specs.to)).toBe(true);
    expect((diff.specs.to as unknown[]).length).toBe(21);
  });

  it('bigint (giá VND lớn) chuyển được sang JSON', async () => {
    const { productDiff } = await import('./admin.service');
    const diff = productDiff(
      { priceVnd: BigInt(1) },
      { priceVnd: BigInt(2) },
      ['priceVnd'],
    );
    expect(() => JSON.stringify(diff)).not.toThrow();
    expect(diff.priceVnd).toEqual({ from: 1, to: 2 });
  });
});
