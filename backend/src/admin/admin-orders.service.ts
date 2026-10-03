import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { serializeOrder } from '../orders/orders.service';

const STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PAID',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
] as const;

// Cache dashboard 60s trong memory (số liệu tổng quan không cần realtime).
let statsCache: { at: number; data: unknown } | null = null;
const STATS_TTL_MS = 60_000;

/**
 * Cụm Order của backoffice (CONTEXT.md: Order) — list, chuyển trạng thái
 * (conditional update chống đua), dashboard stats.
 */
@Injectable()
export class AdminOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: string, page = 1, limit = 20) {
    const where = status ? { status: status as (typeof STATUSES)[number] } : {};
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 20));
    const safePage = Math.max(1, Math.floor(page) || 1);
    const [orders, total, counts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          payments: { orderBy: { createdAt: 'desc' } },
          events: { orderBy: { createdAt: 'asc' } },
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
    ]);
    return {
      orders: orders.map(serializeOrder),
      counts,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async updateStatus(
    id: string,
    status: string,
    byUserId?: string,
    opts: { refundRef?: string; paymentRef?: string; note?: string } = {},
  ) {
    if (!(STATUSES as readonly string[]).includes(status))
      throw new BadRequestException('Trạng thái không hợp lệ');
    // Chỉ cho chuyển trạng thái hợp lệ (không nhảy cóc/ngược).
    // PAID không được → CANCELLED trực tiếp: tiền đã thu mà hủy chay thì
    // sổ lệch (mất tiền lẫn mất hàng trên sổ) — phải đi qua REFUNDED kèm
    // mã tham chiếu hoàn tiền (audit BIZ-HIGH-02).
    const allowed: Record<string, string[]> = {
      PENDING: ['CONFIRMED', 'PAID', 'CANCELLED'],
      CONFIRMED: ['PAID', 'SHIPPED', 'CANCELLED'],
      PAID: ['SHIPPED', 'REFUNDED'],
      SHIPPED: ['COMPLETED'],
      COMPLETED: [],
      CANCELLED: [],
      REFUNDED: [],
    };
    const current = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!current) throw new NotFoundException('Không thấy đơn hàng');
    if (!allowed[current.status].includes(status))
      throw new BadRequestException(
        `Không thể chuyển từ ${current.status} sang ${status}`,
      );
    const from = current.status;
    // Hoàn tiền bắt buộc có mã tham chiếu (mã giao dịch hoàn trên cổng
    // VNPay hoặc phiếu thủ công) — kỷ luật sổ sách, tra soát được về sau.
    const isRefund = status === 'REFUNDED';
    const refundRef = String(opts.refundRef ?? '').trim().slice(0, 200);
    if (isRefund && !refundRef)
      throw new BadRequestException(
        'Hoàn tiền cần mã tham chiếu (refundRef) — VD mã giao dịch hoàn trên cổng VNPay',
      );
    // Xác nhận thu thủ công (đơn chưa qua cổng thanh toán mà admin đánh dấu
    // PAID — VD đã nhận chuyển khoản): bắt buộc mã tham chiếu + sinh Payment
    // record SUCCESS trong cùng tx. Không có dòng này thì doanh thu tăng mà
    // đối soát không có chứng từ nào — vector gian lận nội bộ (P1-3).
    // (Đường VNPay settle tự tạo Payment row của nó ở payments.service.)
    const isManualPaid =
      status === 'PAID' && (from === 'PENDING' || from === 'CONFIRMED');
    const paymentRef = String(opts.paymentRef ?? '').trim().slice(0, 200);
    if (isManualPaid && !paymentRef)
      throw new BadRequestException(
        'Xác nhận đã thu cần mã tham chiếu thu tiền (paymentRef) — VD mã giao dịch chuyển khoản',
      );
    const order = await this.prisma.$transaction(async (tx) => {
      // Conditional update: hai admin đua nhau đổi trạng thái thì bên thua
      // nhận count=0 → 400, không ghi đè last-write-wins (audit ORD-001).
      const won = await tx.order.updateMany({
        where: { id, status: from },
        data: { status: status as (typeof STATUSES)[number] },
      });
      if (won.count === 0)
        throw new BadRequestException(
          'Đơn vừa được người khác cập nhật, vui lòng tải lại',
        );
      // Hủy đơn chưa chốt → hoàn tồn kho (trước đây chỉ khách hủy mới hoàn,
      // admin hủy làm hàng "bốc hơi" — audit ORD-001).
      // Hoàn tiền (PAID → REFUNDED) cũng hoàn kho: hàng chưa giao thì về
      // lại kệ được bán tiếp; paidUsd giữ nguyên làm sổ đã thu.
      if (
        (status === 'CANCELLED' &&
          (from === 'PENDING' || from === 'CONFIRMED')) ||
        isRefund
      ) {
        for (const l of current.items) {
          if (!l.productSlug) continue;
          await tx.product.updateMany({
            where: { slug: l.productSlug },
            data: { stock: { increment: l.qty } },
          });
        }
      }
      if (isManualPaid) {
        // Thu đủ phần còn lại trong cùng tx với chuyển trạng thái.
        const remainingUsd = Math.max(0, current.totalUsd - current.paidUsd);
        await tx.payment.create({
          data: {
            orderId: id,
            method: 'manual',
            amountUsd: remainingUsd,
            status: 'SUCCESS',
            txnRef: paymentRef,
          },
        });
        await tx.order.update({
          where: { id },
          data: { paidUsd: current.totalUsd, paidVnd: current.totalVnd },
        });
      }
      const extraNote = String(opts.note ?? '').trim().slice(0, 200);
      await tx.orderEvent.create({
        data: {
          orderId: id,
          from,
          to: status as (typeof STATUSES)[number],
          byUserId: byUserId ?? null,
          note: isRefund
            ? `Hoàn tiền — ref: ${refundRef}${extraNote ? ` — ${extraNote}` : ''}`
            : isManualPaid
              ? `Xác nhận đã thu — ref: ${paymentRef}${extraNote ? ` — ${extraNote}` : ''}`
              : 'Admin cập nhật',
        },
      });
      return tx.order.findUnique({ where: { id } });
    });
    // Vô hiệu cache dashboard vì số liệu đã đổi.
    statsCache = null;
    return { id: order!.id, status: order!.status };
  }

  /** Số liệu tổng quan cho dashboard (cache 60s). */
  async stats() {
    if (statsCache && Date.now() - statsCache.at < STATS_TTL_MS) {
      return statsCache.data as Awaited<ReturnType<AdminOrdersService['statsRaw']>>;
    }
    const data = await this.statsRaw();
    statsCache = { at: Date.now(), data };
    return data;
  }

  private async statsRaw() {
    const [counts, revenue, users, products, recent] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.order.aggregate({
        // Doanh thu chỉ tính đơn ĐÃ THU tiền (PAID+). Trước đây tính cả
        // PENDING chưa thanh toán → số liệu dashboard sai quyết định
        // khi nhiều đơn VNPay bỏ giữa chừng (audit P3).
        where: { status: { in: ['PAID', 'SHIPPED', 'COMPLETED'] } },
        _sum: { totalUsd: true, totalVnd: true },
        _count: true,
      }),
      this.prisma.user.count(),
      this.prisma.product.count(),
      this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { items: true },
      }),
    ]);
    return {
      ordersByStatus: counts.map((c) => ({
        status: c.status,
        count: c._count.status,
      })),
      totalOrders: revenue._count,
      revenueUsd: revenue._sum.totalUsd ?? 0,
      revenueVnd: Number(revenue._sum.totalVnd ?? BigInt(0)),
      totalUsers: users,
      totalProducts: products,
      recentOrders: recent.map(serializeOrder),
    };
  }
}
