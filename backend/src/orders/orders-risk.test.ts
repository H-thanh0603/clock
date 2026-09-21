import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { OrdersService } from './orders.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotifyService } from '../notify/notify.service';

/**
 * Order risk advisory: fire-and-forget, không chặn tạo đơn.
 * - đơn nhỏ khách quen → không gọi Jev.
 * - đơn vãng lai lớn + Jev risky → thêm tin Telegram ⚠️.
 * - Jev chết → đơn vẫn tạo bình thường.
 */

const OLD_ENV = { ...process.env };

function makeSvc(texts: string[]) {
  const notify = {
    orderCreated: () => Promise.resolve(),
    orderPaid: () => Promise.resolve(),
    enqueueText: (t: string) => {
      texts.push(t);
      return Promise.resolve();
    },
  } as unknown as NotifyService;
  const products = new Map([
    ['vip-1', { slug: 'vip-1', priceUsd: 1000, inBoutique: true, stock: 100 }],
    ['big-1', { slug: 'big-1', priceUsd: 6000, inBoutique: true, stock: 100 }],
  ]);
  const prisma = {
    product: {
      findMany: ({ where }: { where: { slug: { in: string[] } } }) =>
        Promise.resolve(where.slug.in.map((s) => products.get(s)).filter(Boolean)),
      updateMany: () => Promise.resolve({ count: 1 }),
    },
    order: {
      create: (args: { data: Record<string, unknown> }) => {
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
      findFirst: () => Promise.resolve(null),
      findUnique: () => Promise.resolve(null),
    },
    cartItem: { deleteMany: () => Promise.resolve({ count: 0 }) },
    paymentIntent: { findUnique: () => Promise.resolve(null) },
    idempotencyKey: { create: () => Promise.resolve({}) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  } as unknown as PrismaService;
  return new OrdersService(prisma, notify, {} as never);
}

const BASE = {
  customerName: 'K',
  contact: '0900',
  address: 'HCM',
  payment: { method: 'cod' },
  agreedTerms: true,
};

const flush = () => new Promise((r) => setTimeout(r, 300));

describe('OrdersService Jev risk advisory', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllGlobals();
  });

  it('đơn nhỏ → không gọi Jev, đơn tạo bình thường', async () => {
    delete process.env.JEV_API_KEY;
    const spy = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', spy);
    const svc = makeSvc([]);
    const r = await svc.create(
      { ...BASE, items: [{ slug: 'vip-1', name: 'V', priceUsd: 1000, priceVnd: 0, image: 'i', qty: 1 }] },
      null,
    );
    await flush();
    expect(r.code).toMatch(/^AC-/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('đơn vãng lai $6k + Jev risky → tin ⚠️, đơn vẫn CONFIRMED', async () => {
    process.env.JEV_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            answers: {
              is_risky: { noul: 0.9 },
              risk_reason: { choice: 'high_value_guest' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const texts: string[] = [];
    const svc = makeSvc(texts);
    const r = await svc.create(
      { ...BASE, items: [{ slug: 'big-1', name: 'B', priceUsd: 6000, priceVnd: 0, image: 'i', qty: 1 }] },
      null,
    );
    expect(r.status).toBe('CONFIRMED');
    await flush();
    expect(texts.some((t) => t.includes('xem lại đơn'))).toBe(true);
  });

  it('Jev not risky → không tin thừa', async () => {
    process.env.JEV_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ answers: { is_risky: { noul: 0.1 } } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const texts: string[] = [];
    const svc = makeSvc(texts);
    await svc.create(
      { ...BASE, items: [{ slug: 'big-1', name: 'B', priceUsd: 6000, priceVnd: 0, image: 'i', qty: 1 }] },
      null,
    );
    await flush();
    expect(texts).toHaveLength(0);
  });
});
