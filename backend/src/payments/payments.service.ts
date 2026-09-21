import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { InvoiceService } from '../invoices/invoice.service';
import {
  buildPayUrl,
  settlePayment,
  type SettleDeps,
} from '../common/vnpay';
import { signOrderCode } from '../orders/orders.service';

function backendBaseUrl(): string {
  return (
    process.env.BACKEND_PUBLIC_URL ??
    `http://localhost:${process.env.PORT ?? '4000'}`
  );
}

function frontendBaseUrl(): string {
  return process.env.FRONTEND_URL ?? 'http://localhost:3000';
}

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly invoices: InvoiceService,
  ) {}

  private settleDeps(): SettleDeps {
    return {
      findPayment: (txnRef) =>
        this.prisma.payment.findFirst({ where: { txnRef } }).then((p) =>
          p
            ? {
                id: p.id,
                orderId: p.orderId,
                status: p.status,
                expectedVnd:
                  p.expectedVnd !== null && p.expectedVnd !== undefined
                    ? Number(p.expectedVnd)
                    : null,
              }
            : null,
        ),
      getOrder: (orderId) =>
        this.prisma.order
          .findUnique({ where: { id: orderId } })
          .then((o) =>
            o
              ? {
                  code: o.code,
                  totalVnd: Number(o.totalVnd),
                  userId: o.userId,
                }
              : null,
          ),
      // Update ĐIỀU KIỆN: chỉ chuyển khi còn PENDING (chống double-settle
      // khi IPN và return chạy song song). Trả về false nếu đã settle trước.
      updatePayment: async (id, status) => {
        const r = await this.prisma.payment.updateMany({
          where: { id, status: 'PENDING' },
          data: { status },
        });
        return r.count > 0;
      },
      updateOrder: (orderId, status) =>
        this.prisma.order
          .update({ where: { id: orderId }, data: { status } })
          .then(() => undefined),
      clearCart: async (userId) => {
        if (userId) {
          await this.prisma.cartItem.deleteMany({ where: { userId } });
        }
      },
      // Một transaction cho cả payment + order + giỏ: crash giữa chừng
      // không còn kẹt payment SUCCESS / order PENDING (audit ORD-002).
      settleAtomically: async ({
        paymentId,
        orderId,
        userId,
        paymentStatus,
      }) => {
        try {
          return await this.prisma.$transaction(async (tx) => {
            const r = await tx.payment.updateMany({
              where: { id: paymentId, status: 'PENDING' },
              data: { status: paymentStatus },
            });
            if (r.count === 0) return false;
            if (paymentStatus === 'SUCCESS') {
              await tx.order.updateMany({
                where: { id: orderId, status: 'PENDING' },
                data: { status: 'PAID' },
              });
              if (userId) {
                await tx.cartItem.deleteMany({ where: { userId } });
              }
            }
            return true;
          });
        } catch {
          // Tx rollback (timeout/deadlock) — coi như chưa settle, caller
          // VNPay sẽ retry bằng IPN.
          return false;
        }
      },
    };
  }

  /** Tạo URL thanh toán VNPay cho đơn vừa chốt. */
  async createPayUrl(orderId: string, userId: string | null, req: Request) {
    if (!orderId) throw new BadRequestException('Thiếu orderId');
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw new NotFoundException('Không thấy đơn');
    if (order.userId && order.userId !== userId)
      throw new ForbiddenException('Không có quyền');
    // Chỉ tạo thanh toán cho đơn đang PENDING (chặn re-pay đơn đã xong).
    if (order.status !== 'PENDING')
      throw new BadRequestException('Đơn không ở trạng thái chờ thanh toán');
    // Giới hạn số payment PENDING tồn đọng (chống spam rows).
    const pendingCount = await this.prisma.payment.count({
      where: { orderId: order.id, status: 'PENDING' },
    });
    if (pendingCount >= 3)
      throw new BadRequestException('Đơn đã có quá nhiều yêu cầu chờ xử lý');

    // txnRef ngẫu nhiên, khó đoán (tránh liệt kê + trùng khi tạo cùng ms).
    const txnRef = `${order.code}-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
    const expectedVnd = Number(order.totalVnd);
    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        method: 'vnpay',
        amountUsd: order.totalUsd,
        status: 'PENDING',
        txnRef,
        expectedVnd,
      },
    });
    const url = buildPayUrl({
      txnRef,
      amountVnd: expectedVnd,
      orderInfo: `Thanh toan don ${order.code} Aurel Co`,
      returnUrl: `${backendBaseUrl()}/payments/vnpay/return`,
      // req.ip đã là client thật sau trust-proxy (main.ts) — ưu tiên nó,
      // fallback XFF như cũ khi chạy trước proxy không chuẩn.
      ipAddr:
        req.ip ??
        req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
        '127.0.0.1',
    });
    return { url };
  }

  /**
   * Tạo link VNPay hộ cho agent (không có Request browser).
   * Chỉ gọi từ OrdersService sau khi intent đã khóa — không gọi trực tiếp
   * từ controller (không có endpoint nào gọi hàm này ngoài intent flow).
   */
  async createPayUrlForOrder(orderId: string, userId: string | null) {
    // IP server-side cho vnp_IpAddr: agent gọi hộ nên không có IP user thật
    // — dùng IP loopback, VNPay chỉ dùng để log chống gian lận.
    const fakeReq = {
      ip: '127.0.0.1',
      headers: {},
    } as unknown as Request;
    const out = await this.createPayUrl(orderId, userId, fakeReq);
    return out.url;
  }

  // -- Payment intent (hạn mức user duyệt trước cho agent) --

  /** Trần intent: đủ mua 1 chiếc flagship nhưng không thành thẻ tín dụng mở. */
  static readonly INTENT_MAX_USD = 200_000;
  /** TTL intent: đủ cho 1 turn agent chốt đơn, lộ cũng nhanh chết. */
  static readonly INTENT_TTL_MIN = 15;

  async createIntent(
    userId: string,
    body: { maxUsd?: number; method?: string; ttlMinutes?: number },
  ) {
    const maxUsd = Math.floor(Number(body.maxUsd) || 0);
    if (maxUsd <= 0 || maxUsd > PaymentsService.INTENT_MAX_USD) {
      throw new BadRequestException(
        `Hạn mức 1–${PaymentsService.INTENT_MAX_USD} USD`,
      );
    }
    const method = String(body.method ?? 'vnpay');
    if (method !== 'vnpay') {
      // Đợt 1 chỉ VNPay (settle idempotent đã kiểm chứng); method mô phỏng
      // không cho agent tự thu tiền ảo.
      throw new BadRequestException('Agent chỉ thanh toán hộ qua VNPay');
    }
    const ttlMin = Math.min(
      60,
      Math.max(5, Math.floor(Number(body.ttlMinutes) || PaymentsService.INTENT_TTL_MIN)),
    );
    // Duyệt mới → revoke intent ACTIVE cũ (tránh 2 hạn mức chồng nhau gây
    // nhầm khi đối chiếu; intent đã USED giữ lại làm chứng từ).
    await this.prisma.paymentIntent.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
    const row = await this.prisma.paymentIntent.create({
      data: {
        userId,
        maxUsd,
        method,
        expiresAt: new Date(Date.now() + ttlMin * 60 * 1000),
      },
    });
    return {
      id: row.id,
      maxUsd: row.maxUsd,
      method: row.method,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async listIntents(userId: string) {
    const rows = await this.prisma.paymentIntent.findMany({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    return rows.map((r) => ({
      id: r.id,
      maxUsd: r.maxUsd,
      method: r.method,
      expiresAt: r.expiresAt.toISOString(),
    }));
  }

  async revokeIntent(userId: string, id: string) {
    const r = await this.prisma.paymentIntent.updateMany({
      where: { id, userId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
    if (r.count === 0)
      throw new NotFoundException('Không thấy hạn mức còn hiệu lực');
    return { ok: true };
  }

  private toOrderUrl(
    code: string,
    paid: boolean,
    reason?: string,
  ): string {
    // Kèm sig xem đơn (HMAC mã đơn): trình duyệt landing từ VNPay không có
    // session/contact nhưng vẫn xem được chi tiết đơn của chính mình (P1-6).
    // Sig chỉ mở items+totals của ĐÚNG đơn này — không PII, không action.
    const url =
      `${frontendBaseUrl()}/orders/${code}?paid=${paid ? '1' : '0'}` +
      `${reason ? `&reason=${reason}` : ''}`;
    if (!code) return url;
    try {
      return `${url}&sig=${signOrderCode(code)}`;
    } catch {
      // Thiếu JWT_SECRET (cấu hình dở) → redirect không sig, trang tra đơn
      // hiện trạng thái tối thiểu thay vì gãy hẳn.
      return url;
    }
  }

  /** VNPay redirect người dùng về đây sau thanh toán → redirect tiếp về frontend. */
  async handleReturn(query: Record<string, string>): Promise<string> {
    try {
      const result = await settlePayment(query, this.settleDeps());
      const code = 'code' in result ? result.code : '';
      if (result.outcome === 'success' && code) {
        await this.notifyPaid(code);
      }
      switch (result.outcome) {
        case 'success':
          return this.toOrderUrl(code, true);
        case 'already-set':
          return result.settled
            ? this.toOrderUrl(code, true)
            : this.toOrderUrl(code, false, 'already');
        case 'unpaid':
          return this.toOrderUrl(code, false, 'unpaid');
        case 'payment-not-found':
          return this.toOrderUrl(code, false, 'payment');
        case 'amount-mismatch':
          return this.toOrderUrl(code, false, 'amount');
        case 'checksum-fail':
        default:
          return this.toOrderUrl(code, false, 'checksum');
      }
    } catch {
      return `${frontendBaseUrl()}/checkout?paid=0`;
    }
  }

  private async notifyPaid(code: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({ where: { code } });
      if (order) {
        await this.notify.orderPaid(code, Number(order.totalVnd));
        // Hóa đơn điện tử cho đơn đã thu tiền (idempotent, không chặn callback).
        await this.invoices.ensureForOrder({
          code: order.code,
          totalVnd: Number(order.totalVnd),
          customerName: order.customerName,
          contact: order.contact,
        });
      }
    } catch (e) {
      // Thông báo không được làm hỏng callback thanh toán — nhưng PHẢI log:
      // catch câm từng làm invoice đơn tiền tỷ "bốc hơi" mà không ai hay
      // (audit DATA-CRIT: Int overflow ở Invoice.amountVnd).
      this.log.warn(
        `notifyPaid(${code}) thất bại (đơn đã PAID, kiểm tra notify/invoice): ${(e as Error).message}`,
      );
    }
  }

  /** IPN server-to-server của VNPay (xác nhận thụ động). */
  async handleIpn(query: Record<string, string>) {
    try {
      const result = await settlePayment(query, this.settleDeps());
      const code = 'code' in result ? result.code : '';
      if (result.outcome === 'success' && code) {
        await this.notifyPaid(code);
      }
      const byRspCode: Record<string, { RspCode: string; Message: string }> = {
        checksum_fail: { RspCode: '97', Message: 'Invalid checksum' },
        payment_not_found: { RspCode: '01', Message: 'Order not found' },
        amount_mismatch: { RspCode: '04', Message: 'Invalid amount' },
        already_set: { RspCode: '02', Message: 'Already confirmed' },
        success: { RspCode: '00', Message: 'Confirm Success' },
        unpaid: { RspCode: '00', Message: 'Confirm Success' },
      };
      const key = result.outcome.replaceAll('-', '_');
      return byRspCode[key];
    } catch {
      return { RspCode: '99', Message: 'Unknown error' };
    }
  }
}
