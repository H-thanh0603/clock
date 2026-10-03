import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPromotionsService } from './admin-promotions.service';

/**
 * Đóng promotion đã qua endsAt (cron 15 phút/lần): hồi giá SP về snapshot
 * gốc + đánh active=false qua AdminPromotionsService.closePromotion.
 *
 * Vì sao cần: apply promotion ghi đè giá SP về giá KM — không có vòng này,
 * giá KM ở lại vĩnh viễn sau khi hết hạn (audit BIZ-HIGH-02). Logic tách
 * method public để test được (giống OrderExpireService).
 */
@Injectable()
export class PromotionExpireService {
  private readonly log = new Logger(PromotionExpireService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminPromotionsService,
  ) {}

  /** Mỗi 15 phút một lần; logic tách ra method public để test được. */
  @Cron('*/15 * * * *')
  async runQuarterHourly() {
    await this.expireDue();
  }

  async expireDue(): Promise<number> {
    const due = await this.prisma.promotion.findMany({
      where: { active: true, endsAt: { lt: new Date() } },
      select: { id: true },
      take: 50, // mỗi vòng tối đa 50 — tránh tx dài
    });
    let closed = 0;
    for (const p of due) {
      try {
        await this.admin.closePromotion(p.id, 'Hết hạn khuyến mãi (tự động)');
        closed++;
      } catch (e) {
        this.log.warn(
          `Đóng promotion ${p.id} thất bại: ${(e as Error).message}`,
        );
      }
    }
    if (closed > 0)
      this.log.log(`Đã đóng ${closed} promotion hết hạn + hồi giá gốc`);
    return closed;
  }
}
