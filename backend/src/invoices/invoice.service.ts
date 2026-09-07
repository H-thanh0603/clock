import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Hóa đơn điện tử — quy định TMĐT VN yêu cầu phát hành hóa đơn cho đơn bán.
 *
 * Luồng: khi đơn chuyển PAID, `ensureForOrder` tạo record Invoice
 * (idempotent theo orderCode). Nếu cấu hình EINVOICE_* (nhà cung cấp thật
 * như MISA / EasyInvoice / EasyInvoice.vn...), đây là integration point:
 * gọi API nhà cung cấp rồi lưu số hóa đơn + externalRef. Không cấu hình →
 * invoice nằm PENDING_ISSUE để kế toán phát hành qua portal nhà cung cấp,
 * admin xem và đánh dấu ISSUED ở backoffice.
 */
@Injectable()
export class InvoiceService {
  private readonly log = new Logger(InvoiceService.name);

  constructor(private readonly prisma: PrismaService) {}

  private providerConfigured() {
    return Boolean(
      process.env.EINVOICE_PROVIDER &&
        process.env.EINVOICE_API_URL &&
        process.env.EINVOICE_API_KEY,
    );
  }

  /** Tạo (nếu chưa có) invoice cho đơn PAID — idempotent. */
  async ensureForOrder(order: {
    code: string;
    totalVnd: number;
    customerName: string;
    contact: string;
  }) {
    const existing = await this.prisma.invoice.findUnique({
      where: { orderCode: order.code },
    });
    if (existing) return existing;

    const invoice = await this.prisma.invoice.create({
      data: {
        orderCode: order.code,
        amountVnd: order.totalVnd,
        buyerName: order.customerName,
        buyerEmail: this.isEmail(order.contact) ? order.contact : null,
        status: 'PENDING_ISSUE',
      },
    });
    this.log.log(`Invoice ${invoice.id} chờ phát hành cho đơn ${order.code}`);

    if (this.providerConfigured()) {
      await this.issueViaProvider(invoice.id);
    }
    return invoice;
  }

  /**
   * Integration point nhà cung cấp e-invoice. Cấu trúc body giả định theo
   * chuẩn chung (mã đơn, số tiền, thông tin người mua) — điều chỉnh theo
   * API doc của nhà cung cấp khi ký hợp đồng.
   */
  async issueViaProvider(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice || invoice.status === 'ISSUED') return;

    try {
      const res = await fetch(process.env.EINVOICE_API_URL as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.EINVOICE_API_KEY}`,
        },
        body: JSON.stringify({
          orderRef: invoice.orderCode,
          amount: invoice.amountVnd,
          currency: 'VND',
          buyer: {
            name: invoice.buyerName,
            email: invoice.buyerEmail,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        invoiceNo?: string;
        refId?: string;
      };
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          number: data.invoiceNo ?? null,
          externalRef: data.refId ?? null,
          status: 'ISSUED',
          issuedAt: new Date(),
        },
      });
      this.log.log(`Đã phát hành hóa đơn ${data.invoiceNo} cho ${invoice.orderCode}`);
    } catch (e) {
      // Giữ PENDING_ISSUE — admin phát hành lại/đối chiếu sau.
      this.log.warn(
        `Gọi nhà cung cấp e-invoice thất bại cho ${invoice.orderCode}: ${(e as Error).message}`,
      );
    }
  }

  private isEmail(s: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
  }
}
