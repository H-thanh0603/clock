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
    const svc = new AdminService(prisma, {} as never);
    const r = await svc.updateStatus('ord-1', 'CANCELLED', 'admin-1');
    expect(r.status).toBe('CANCELLED');
    expect(restocked.get('vip-1')).toBe(2);
    expect(events).toHaveLength(1);
  });

  it('CONFIRMED → CANCELLED: vẫn hoàn tồn kho (trước đây bị rò)', async () => {
    const { prisma, restocked } = makePrisma('CONFIRMED');
    const svc = new AdminService(prisma, {} as never);
    await svc.updateStatus('ord-1', 'CANCELLED', 'admin-1');
    expect(restocked.get('vip-1')).toBe(2);
  });

  it('PAID → CANCELLED: KHÔNG hoàn tồn kho (đã thu tiền, xử lý hoàn riêng)', async () => {
    const { prisma, restocked } = makePrisma('PAID');
    const svc = new AdminService(prisma, {} as never);
    await svc.updateStatus('ord-1', 'CANCELLED', 'admin-1');
    expect(restocked.size).toBe(0);
  });

  it('hai admin đua nhau → đúng 1 bên thắng, không ghi event đúp', async () => {
    const { prisma, events } = makePrisma('PENDING');
    const svc = new AdminService(prisma, {} as never);
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
    const svc = new AdminService(prisma, {} as never);
    await expect(svc.updateStatus('ord-1', 'COMPLETED')).rejects.toThrow(
      /Không thể chuyển/,
    );
  });
});
