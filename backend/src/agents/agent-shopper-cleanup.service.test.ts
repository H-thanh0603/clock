import { describe, expect, it } from 'vitest';
import { AgentShopperCleanupService } from './agent-shopper-cleanup.service';

/** Cron dọn shopper rác của agent host — chỉ xóa đúng 3 điều kiện. */
describe('AgentShopperCleanupService', () => {
  function makePrisma(users: unknown[]) {
    const deleted: string[] = [];
    const prisma = {
      user: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          const startsWith = (where.email as { startsWith: string }).startsWith;
          const cutoff = where.createdAt as { lt: Date };
          const ordersNone = where.orders as { none: {} } | undefined;
          return users.filter(
            (u) =>
              (u as { email: string }).email.startsWith(startsWith) &&
              (u as { createdAt: Date }).createdAt < cutoff.lt &&
              (ordersNone
                ? (u as { orders: unknown[] }).orders.length === 0
                : true),
          );
        },
        delete: async ({ where }: { where: { id: string } }) => {
          deleted.push(where.id);
        },
      },
    };
    return { prisma, deleted };
  }

  it('chỉ xóa shopper prefix agent, tuổi > TTL, KHÔNG có đơn', async () => {
    const old = new Date(Date.now() - 48 * 3600_000);
    const fresh = new Date(Date.now() - 1000);
    const { prisma, deleted } = makePrisma([
      { id: 'agent-old-1', email: 'shop+abc@x', createdAt: old, orders: [] },
      { id: 'agent-old-2', email: 'shop+def@x', createdAt: old, orders: [] },
      { id: 'agent-with-order', email: 'shop+ghi@x', createdAt: old, orders: [{ id: 'o1' }] },
      { id: 'agent-fresh', email: 'shop+jkl@x', createdAt: fresh, orders: [] },
      { id: 'real-user', email: 'vip@aurel.local', createdAt: old, orders: [] },
    ]);
    const svc = new AgentShopperCleanupService(prisma as never);
    const removed = await svc.cleanup();
    expect(removed).toBe(2);
    expect(deleted).toEqual(['agent-old-1', 'agent-old-2']);
  });

  it('rỗng → 0, không gọi delete', async () => {
    const { prisma, deleted } = makePrisma([]);
    const svc = new AgentShopperCleanupService(prisma as never);
    expect(await svc.cleanup()).toBe(0);
    expect(deleted).toEqual([]);
  });
});
