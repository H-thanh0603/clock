import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from './orders.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotifyService } from '../notify/notify.service';

const notifyStub = { orderCreated: () => Promise.resolve(), orderPaid: () => Promise.resolve() } as unknown as NotifyService;

/** Fake Prisma tối thiểu cho create(): giá DB, trừ kho, tạo đơn. */
function makePrisma(over: Record<string, unknown> = {}) {
  const products = new Map<string, { slug: string; priceUsd: number; inBoutique: boolean; stock: number }>([
    ['vip-1', { slug: 'vip-1', priceUsd: 1000, inBoutique: true, stock: 5 }],
    ['hidden-1', { slug: 'hidden-1', priceUsd: 500, inBoutique: false, stock: 5 }],
  ]);
  const created: unknown[] = [];
  const prisma = {
    product: {
      findMany: ({ where }: { where: { slug: { in: string[] } } }) =>
        Promise.resolve(
          where.slug.in.map((s) => products.get(s)).filter(Boolean),
        ),
      updateMany: ({ where, data }: { where: { slug: string; stock?: { gte: number } }; data: { stock: { decrement: number } } }) => {
        const p = products.get(where.slug);
        if (!p || (where.stock && p.stock < where.stock.gte))
          return Promise.resolve({ count: 0 });
        p.stock -= data.stock.decrement;
        return Promise.resolve({ count: 1 });
      },
    },
    order: {
      create: (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        const d = args.data as { code: string; totalUsd: number; totalVnd: number; paidUsd: number; paidVnd: number; status: string };
        return Promise.resolve({
          id: 'ord-1',
          code: d.code,
          totalUsd: d.totalUsd,
          totalVnd: BigInt(d.totalVnd),
          paidUsd: d.paidUsd,
          paidVnd: BigInt(d.paidVnd),
          status: d.status,
        });
      },
      findUnique: () => Promise.resolve(null),
      update: () => Promise.resolve({}),
      findMany: () => Promise.resolve([]),
    },
    cartItem: { deleteMany: () => Promise.resolve({ count: 0 }) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ...over,
  };
  return { prisma: prisma as unknown as PrismaService, created };
}

const BASE_ITEM = {
  slug: 'vip-1',
  name: 'VIP',
  priceUsd: 1000,
  priceVnd: 0,
  image: 'img',
  strap: 'Tiêu chuẩn Atelier',
  qty: 1,
};

const BASE_ORDER = {
  customerName: 'Khach',
  contact: '0900',
  address: 'HCM',
  items: [BASE_ITEM],
  payment: { method: 'cod' },
};

describe('OrdersService.create', () => {
  it('chốt giá DB, bỏ qua priceVnd client', async () => {
    const { prisma } = makePrisma();
    const svc = new OrdersService(prisma, notifyStub);
    const r = await svc.create(
      {
        ...BASE_ORDER,
        items: [{ ...BASE_ITEM, priceUsd: 1, priceVnd: 1 }],
      },
      null,
    );
    expect(r.totalUsd).toBe(1000);
    expect(r.totalVnd).toBe(1000 * 25200);
    expect(r.status).toBe('CONFIRMED');
  });

  it('SP ẩn → 400', async () => {
    const { prisma } = makePrisma();
    const svc = new OrdersService(prisma, notifyStub);
    await expect(
      svc.create(
        { ...BASE_ORDER, items: [{ ...BASE_ITEM, slug: 'hidden-1' }] },
        null,
      ),
    ).rejects.toThrow(/ngừng trưng bày/);
  });

  it('hết hàng → 400', async () => {
    const { prisma } = makePrisma();
    const svc = new OrdersService(prisma, notifyStub);
    await expect(
      svc.create(
        { ...BASE_ORDER, items: [{ ...BASE_ITEM, qty: 99 }] },
        null,
      ),
    ).rejects.toThrow(/chỉ còn|hết hàng/);
  });

  it('slug lạ → PENDING review, không SUCCESS', async () => {
    const { prisma, created } = makePrisma();
    const svc = new OrdersService(prisma, notifyStub);
    const r = await svc.create(
      {
        ...BASE_ORDER,
        items: [{ ...BASE_ITEM, slug: 'fake-x', priceUsd: 10 }],
      },
      null,
    );
    expect(r.status).toBe('PENDING');
    expect(r.pendingReview).toBe(true);
    const payment = (created[0] as { payments: { create: { status: string } } })
      .payments.create;
    expect(payment.status).toBe('PENDING');
  });

  it('deposit chỉ thu 20%, trả remaining', async () => {
    const { prisma } = makePrisma();
    const svc = new OrdersService(prisma, notifyStub);
    const r = await svc.create(
      { ...BASE_ORDER, payment: { method: 'deposit' } },
      null,
    );
    expect(r.status).toBe('CONFIRMED');
    expect(r.paidUsd).toBe(200);
    expect(r.remainingUsd).toBe(800);
  });

  it('vnpay → PENDING, paid = 0', async () => {
    const { prisma } = makePrisma();
    const svc = new OrdersService(prisma, notifyStub);
    const r = await svc.create(
      { ...BASE_ORDER, payment: { method: 'vnpay' } },
      null,
    );
    expect(r.status).toBe('PENDING');
    expect(r.paidUsd).toBe(0);
  });

  it('cancel PENDING của chính chủ → CANCELLED + hoàn kho', async () => {
    const stock = new Map([['vip-1', 0]]);
    const events: unknown[] = [];
    const order = {
      id: 'ord-9',
      status: 'PENDING',
      userId: 'u-1',
      contact: '0900',
      items: [{ productSlug: 'vip-1', qty: 1 }],
    };
    const prisma = {
      order: {
        findUnique: () => Promise.resolve(order),
        update: () => Promise.resolve({}),
      },
      product: {
        updateMany: ({ where }: { where: { slug: string } }) => {
          stock.set(where.slug, (stock.get(where.slug) ?? 0) + 1);
          return Promise.resolve({ count: 1 });
        },
      },
      orderEvent: { create: (a: unknown) => { events.push(a); return Promise.resolve({}); } },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, notifyStub);
    const r = await svc.cancel('ord-9', { userId: 'u-1' });
    expect(r.status).toBe('CANCELLED');
    expect(stock.get('vip-1')).toBe(1);
    expect(events).toHaveLength(1);
    vi.clearAllMocks();
  });

  it('cancel đơn đã CONFIRMED → 400', async () => {
    const prisma = {
      order: {
        findUnique: () =>
          Promise.resolve({
            id: 'ord-9',
            status: 'CONFIRMED',
            userId: 'u-1',
            contact: '0900',
            items: [],
          }),
      },
    };
    const svc = new OrdersService(prisma as unknown as PrismaService, notifyStub);
    await expect(svc.cancel('ord-9', { userId: 'u-1' })).rejects.toThrow(
      /chờ xác nhận/,
    );
  });
});
