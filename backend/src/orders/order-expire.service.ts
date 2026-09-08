import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

function ttlHours(): number {
  const n = Number(process.env.ORDER_PENDING_TTL_HOURS ?? 24);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 24;
}

/**
 * Hết hạn đơn PENDING quá lâu (khách bỏ VNPay giữa chừng, không quay lại):
 * hủy + hoàn tồn kho, ghi OrderEvent — tránh hàng kẹt vĩnh viễn trong
 * trạng thái "chờ thanh toán" (audit reliability).
 *
 * Dùng conditional updateMany giống cancel của khách: nếu đơn vừa được
 * settle/admin đổi trạng thái thì cron thua race và bỏ qua an toàn.
 */
@Injectable()
export class OrderExpireService {
  private readonly log = new Logger(OrderExpireService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Mỗi giờ một lần; logic tách ra method public để test được. */
  @Cron('0 * * * *')
  async runHourly() {
    await this.expirePending();
  }

  async expirePending(): Promise<number> {
    const cutoff = new Date(Date.now() - ttlHours() * 3600_000);
    const stale = await this.prisma.order.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      include: { items: true },
      take: 100, // mỗi vòng tối đa 100 đơn — tránh tx dài
    });
    let expired = 0;
    for (const order of stale) {
      try {
        const won = await this.prisma.$transaction(async (tx) => {
          const r = await tx.order.updateMany({
            where: { id: order.id, status: 'PENDING' },
            data: { status: 'CANCELLED' },
          });
          if (r.count === 0) return false;
          for (const l of order.items) {
            if (!l.productSlug) continue;
            await tx.product.updateMany({
              where: { slug: l.productSlug },
              data: { stock: { increment: l.qty } },
            });
          }
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              from: 'PENDING',
              to: 'CANCELLED',
              note: 'Hết hạn thanh toán (tự động)',
            },
          });
          return true;
        });
        if (won) expired++;
      } catch (e) {
        this.log.warn(
          `Hết hạn đơn ${order.code} thất bại: ${(e as Error).message}`,
        );
      }
    }
    if (expired > 0)
      this.log.log(`Đã hết hạn ${expired} đơn PENDING quá ${ttlHours()}h`);
    return expired;
  }
}
