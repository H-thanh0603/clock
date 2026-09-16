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
    items: [{ productSlug: 'vip-1', qty: 2 }],
  };
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
  return { prisma: prisma as unknown as PrismaService, restocked, events, state };
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
