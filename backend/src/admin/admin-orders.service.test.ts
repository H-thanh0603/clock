import { describe, expect, it } from 'vitest';
import { AdminOrdersService } from './admin-orders.service';
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

describe('AdminOrdersService.updateStatus', () => {
  it('PENDING → CANCELLED: hoàn tồn kho + ghi event', async () => {
    const { prisma, restocked, events } = makePrisma('PENDING');
    const svc = new AdminOrdersService(prisma);
    const r = await svc.updateStatus('ord-1', 'CANCELLED', 'admin-1');
    expect(r.status).toBe('CANCELLED');
    expect(restocked.get('vip-1')).toBe(2);
    expect(events).toHaveLength(1);
  });

  it('CONFIRMED → CANCELLED: vẫn hoàn tồn kho (trước đây bị rò)', async () => {
    const { prisma, restocked } = makePrisma('CONFIRMED');
    const svc = new AdminOrdersService(prisma);
    await svc.updateStatus('ord-1', 'CANCELLED', 'admin-1');
    expect(restocked.get('vip-1')).toBe(2);
  });

  it('PAID → CANCELLED: bị chặn — tiền đã thu phải đi qua REFUNDED', async () => {
    const { prisma, restocked } = makePrisma('PAID');
    const svc = new AdminOrdersService(prisma);
    await expect(svc.updateStatus('ord-1', 'CANCELLED', 'admin-1')).rejects.toThrow(
      /Không thể chuyển từ PAID sang CANCELLED/,
    );
    expect(restocked.size).toBe(0);
  });

  it('PAID → REFUNDED kèm refundRef: hoàn tồn kho + ghi event có ref', async () => {
    const { prisma, restocked, events } = makePrisma('PAID');
    const svc = new AdminOrdersService(prisma);
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
    const svc = new AdminOrdersService(prisma);
    await expect(svc.updateStatus('ord-1', 'REFUNDED', 'admin-1')).rejects.toThrow(
      /refundRef/,
    );
    expect(restocked.size).toBe(0);
  });

  it('REFUNDED là trạng thái cuối: không chuyển tiếp đi đâu', async () => {
    const { prisma } = makePrisma('REFUNDED');
    const svc = new AdminOrdersService(prisma);
    await expect(svc.updateStatus('ord-1', 'PAID', 'admin-1')).rejects.toThrow(
      /Không thể chuyển/,
    );
  });

  it('PENDING → PAID kèm paymentRef: sinh Payment manual + chốt paid đủ', async () => {
    const { prisma, payments, events } = makePrisma('PENDING');
    const svc = new AdminOrdersService(prisma);
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
    const svc = new AdminOrdersService(prisma);
    await expect(svc.updateStatus('ord-1', 'PAID', 'admin-1')).rejects.toThrow(
      /paymentRef/,
    );
    expect(payments).toHaveLength(0);
  });

  it('hai admin đua nhau → đúng 1 bên thắng, không ghi event đúp', async () => {
    const { prisma, events } = makePrisma('PENDING');
    const svc = new AdminOrdersService(prisma);
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
    const svc = new AdminOrdersService(prisma);
    await expect(svc.updateStatus('ord-1', 'COMPLETED')).rejects.toThrow(
      /Không thể chuyển/,
    );
  });
});
