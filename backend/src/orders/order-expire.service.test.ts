import { describe, expect, it } from 'vitest';
import { OrderExpireService } from './order-expire.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Fake Prisma cho expirePending: đơn stale PENDING bị hủy + hoàn kho,
 * đơn mới (createdAt sau cutoff) không bị động tới.
 */
function makePrisma(staleOrders: { id: string; code: string; createdAt: Date; items: { productSlug: string; qty: number }[] }[]) {
  const restocked = new Map<string, number>();
  const events: unknown[] = [];
  const status = new Map(staleOrders.map((o) => [o.id, 'PENDING']));
  const prisma = {
    order: {
      findMany: ({
        where,
      }: {
        where: { status: string; createdAt: { lt: Date } };
      }) =>
        Promise.resolve(
          staleOrders.filter(
            (o) =>
              o.createdAt < where.createdAt.lt && status.get(o.id) === 'PENDING',
          ),
        ),
      updateMany: ({ where }: { where: { id: string; status: string } }) => {
        const win = status.get(where.id) === 'PENDING';
        if (win) status.set(where.id, 'CANCELLED');
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
  return { prisma: prisma as unknown as PrismaService, restocked, events, status };
}

const H = 3600_000;
const old = new Date(Date.now() - 48 * H);
const fresh = new Date(Date.now() - 1 * H);

describe('OrderExpireService.expirePending', () => {
  it('đơn PENDING quá 24h → hủy + hoàn kho + event; đơn mới không bị động', async () => {
    const { prisma, restocked, events } = makePrisma([
      { id: 'o-old', code: 'AC-OLD', createdAt: old, items: [{ productSlug: 'vip-1', qty: 2 }] },
      { id: 'o-new', code: 'AC-NEW', createdAt: fresh, items: [{ productSlug: 'vip-1', qty: 5 }] },
    ]);
    const svc = new OrderExpireService(prisma);
    const n = await svc.expirePending();
    expect(n).toBe(1);
    expect(restocked.get('vip-1')).toBe(2);
    expect(events).toHaveLength(1);
    expect((events[0] as { data: { note: string } }).data.note).toMatch(/Hết hạn/);
  });

  it('không có đơn stale → noop', async () => {
    const { prisma, restocked } = makePrisma([
      { id: 'o-new', code: 'AC-NEW', createdAt: fresh, items: [] },
    ]);
    const svc = new OrderExpireService(prisma);
    const n = await svc.expirePending();
    expect(n).toBe(0);
    expect(restocked.size).toBe(0);
  });

  it('đơn vừa bị settle giữa chừng (status PAID) → cron thua race, bỏ qua', async () => {
    const { prisma, restocked } = makePrisma([
      { id: 'o-old', code: 'AC-OLD', createdAt: old, items: [{ productSlug: 'vip-1', qty: 1 }] },
    ]);
    (prisma as unknown as { order: { updateMany: unknown } }).order.updateMany =
      () => Promise.resolve({ count: 0 });
    const svc = new OrderExpireService(prisma);
    const n = await svc.expirePending();
    expect(n).toBe(0);
    expect(restocked.size).toBe(0);
  });
});
