import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPayUrl,
  settlePayment,
  type SettleDeps,
} from '../common/vnpay';

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
  constructor(private readonly prisma: PrismaService) {}

  private settleDeps(): SettleDeps {
    return {
      findPayment: (txnRef) =>
        this.prisma.payment.findFirst({ where: { txnRef } }),
      getOrder: (orderId) =>
        this.prisma.order
          .findUnique({ where: { id: orderId } })
          .then((o) =>
            o ? { code: o.code, totalVnd: Number(o.totalVnd) } : null,
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
    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        method: 'vnpay',
        amountUsd: order.totalUsd,
        status: 'PENDING',
        txnRef,
      },
    });
    const url = buildPayUrl({
      txnRef,
      amountVnd: Number(order.totalVnd),
      orderInfo: `Thanh toan don ${order.code} Aurel Co`,
      returnUrl: `${backendBaseUrl()}/payments/vnpay/return`,
      ipAddr:
        req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
        req.ip ??
        '127.0.0.1',
    });
    return { url };
  }

  private toOrderUrl(
    code: string,
    paid: boolean,
    reason?: string,
  ): string {
    return `${frontendBaseUrl()}/orders/${code}?paid=${paid ? '1' : '0'}${reason ? `&reason=${reason}` : ''}`;
  }

  /** VNPay redirect người dùng về đây sau thanh toán → redirect tiếp về frontend. */
  async handleReturn(query: Record<string, string>): Promise<string> {
    try {
      const result = await settlePayment(query, this.settleDeps());
      const code = 'code' in result ? result.code : '';
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

  /** IPN server-to-server của VNPay (xác nhận thụ động). */
  async handleIpn(query: Record<string, string>) {
    try {
      const result = await settlePayment(query, this.settleDeps());
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
