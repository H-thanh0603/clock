import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

function ttlHours(): number {
  const n = Number(process.env.AGENT_SHOPPER_TTL_HOURS ?? 24);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 24;
}

/**
 * Dọn "shopper rác" của AI agent host: mỗi chat session tự register
 * 1 tài khoản shop+<hex>@… (PooledStorefront) — không dọn thì user
 * table phình vô hạn theo traffic chat.
 *
 * An toàn: chỉ xóa user theo email prefix của agent, tuổi > TTL, và
 * KHÔNG có đơn hàng (đơn = dữ liệu khách thật). Giỏ wishlist/cart đi
 * theo user (cascade) — chấp nhận: giỏ demo của session chat cũ.
 */
@Injectable()
export class AgentShopperCleanupService {
  private readonly log = new Logger(AgentShopperCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('30 */6 * * *')
  async runEvery6h() {
    await this.cleanup();
  }

  async cleanup(): Promise<number> {
    const prefix = process.env.AGENT_SHOPPER_EMAIL_PREFIX ?? 'shop+';
    const cutoff = new Date(Date.now() - ttlHours() * 3600_000);
    const stale = await this.prisma.user.findMany({
      where: {
        email: { startsWith: prefix },
        createdAt: { lt: cutoff },
        orders: { none: {} },
      },
      select: { id: true, email: true },
      take: 500,
    });
    if (!stale.length) return 0;
    // Xóa theo id từng user — race có đơn mới tạo giữ user lại (an toàn hơn
    // deleteMany where lặp lại điều kiện none-orders).
    let removed = 0;
    for (const u of stale) {
      try {
        await this.prisma.user.delete({ where: { id: u.id } });
        removed++;
      } catch {
        // FK constraint (đơn/cart vừa tạo) → bỏ qua user này
      }
    }
    this.log.log(`Dọn ${removed} shopper agent cũ (>${ttlHours()}h, không đơn)`);
    return removed;
  }
}
