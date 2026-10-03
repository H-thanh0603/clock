import { describe, expect, it, vi } from 'vitest';
import { PromotionExpireService } from './promotion-expire.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AdminService } from './admin.service';

/**
 * Cron hồi giá promotion hết hạn (đường tiền — BIZ-HIGH-02):
 * - chỉ lấy active + endsAt < now, tối đa 50/vòng
 * - closePromotion lỗi 1 cái → vẫn đóng các cái còn lại (không vỡ vòng)
 * - trả về số đã đóng
 */
function makeSvc(due: string[], opts: { fail?: string[] } = {}) {
  const prisma = {
    promotion: {
      findMany: () =>
        Promise.resolve(due.map((id) => ({ id }))),
    },
  } as unknown as PrismaService;

  const closed: string[] = [];
  const admin = {
    closePromotion: (id: string) => {
      if (opts.fail?.includes(id)) return Promise.reject(new Error('kẹt'));
      closed.push(id);
      return Promise.resolve({});
    },
  } as unknown as AdminService;

  return { svc: new PromotionExpireService(prisma, admin), closed };
}

describe('PromotionExpireService.expireDue', () => {
  it('đóng hết promotion quá hạn, trả count', async () => {
    const { svc, closed } = makeSvc(['p-1', 'p-2']);
    expect(await svc.expireDue()).toBe(2);
    expect(closed).toEqual(['p-1', 'p-2']);
  });

  it('1 promotion lỗi → vẫn đóng phần còn lại', async () => {
    const { svc, closed } = makeSvc(['p-1', 'p-2', 'p-3'], { fail: ['p-2'] });
    expect(await svc.expireDue()).toBe(2);
    expect(closed).toEqual(['p-1', 'p-3']);
  });

  it('không có promotion quá hạn → 0, không gọi close', async () => {
    const { svc, closed } = makeSvc([]);
    expect(await svc.expireDue()).toBe(0);
    expect(closed).toEqual([]);
  });

  it('runQuarterHourly uỷ quyền cho expireDue', async () => {
    const { svc } = makeSvc(['p-1']);
    const spy = vi.spyOn(svc, 'expireDue');
    await svc.runQuarterHourly();
    expect(spy).toHaveBeenCalledOnce();
  });
});
