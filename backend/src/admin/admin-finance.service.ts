import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceService } from '../invoices/invoice.service';
import { auditEvent } from './product-audit';

/**
 * Cụm Finance của backoffice — metrics time-series cho merchant agent
 * + backoffice hóa đơn điện tử (kế toán phát hành tay qua portal NCC).
 */
@Injectable()
export class AdminFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoiceService,
  ) {}

  // -- Metrics time-series (merchant agent: query_metrics) --

  async metrics(
    metric: string,
    granularity: string = 'day',
    days = 30,
  ): Promise<{ metric: string; granularity: string; points: { date: string; value: number }[] }> {
    const gran = ['day', 'week', 'month'].includes(granularity) ? granularity : 'day';
    const span = Math.min(365, Math.max(1, Math.floor(days) || 30));
    const trunc = gran === 'day' ? 'day' : gran === 'week' ? 'week' : 'month';
    if (metric === 'sales') {
      const rows = await this.prisma.$queryRaw<
        { bucket: Date; value: bigint }[]
      >`SELECT date_trunc(${trunc}, "createdAt") AS bucket, COALESCE(SUM("totalUsd"), 0) AS value FROM "Order" WHERE "createdAt" >= NOW() - (${span} * INTERVAL '1 day') AND status IN ('PAID', 'SHIPPED', 'COMPLETED') GROUP BY bucket ORDER BY bucket`;
      return {
        metric,
        granularity: gran,
        points: rows.map((r) => ({
          date: new Date(r.bucket).toISOString().slice(0, 10),
          value: Number(r.value ?? 0),
        })),
      };
    }
    if (metric === 'orders') {
      const rows = await this.prisma.$queryRaw<
        { bucket: Date; value: bigint }[]
      >`SELECT date_trunc(${trunc}, "createdAt") AS bucket, COUNT(*) AS value FROM "Order" WHERE "createdAt" >= NOW() - (${span} * INTERVAL '1 day') AND status <> 'CANCELLED' GROUP BY bucket ORDER BY bucket`;
      return {
        metric,
        granularity: gran,
        points: rows.map((r) => ({
          date: new Date(r.bucket).toISOString().slice(0, 10),
          value: Number(r.value ?? 0),
        })),
      };
    }
    return { metric, granularity: gran, points: [] };
  }

  // -- Hóa đơn điện tử (backoffice cho kế toán) --

  async listInvoices(status?: string, page = 1, limit = 20) {
    const where =
      status === 'PENDING_ISSUE' || status === 'ISSUED' || status === 'FAILED'
        ? { status }
        : {};
    const [total, items] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Math.max(1, page) - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      total,
      page,
      limit,
      // BigInt không JSON được — serialize 1 chỗ duy nhất.
      items: items.map((i) => ({ ...i, amountVnd: Number(i.amountVnd) })),
    };
  }

  async setInvoiceStatus(
    id: string,
    body: { status?: string; number?: string; externalRef?: string },
    byUserId?: string,
  ) {
    const status = String(body.status ?? '').toUpperCase();
    if (status !== 'ISSUED' && status !== 'FAILED') {
      throw new BadRequestException(
        'status chỉ nhận ISSUED (đã phát hành qua portal) hoặc FAILED (NCC từ chối)',
      );
    }
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Không thấy hóa đơn');
    if (inv.status === 'ISSUED' && status === 'ISSUED') return inv;
    const number = String(body.number ?? '').trim().slice(0, 40) || null;
    if (status === 'ISSUED' && !number) {
      throw new BadRequestException('ISSUED cần có số hóa đơn (number) để đối chiếu');
    }
    const row = await this.prisma.invoice.update({
      where: { id },
      data: {
        status,
        number,
        externalRef: String(body.externalRef ?? '').trim().slice(0, 120) || null,
        issuedAt: status === 'ISSUED' ? new Date() : inv.issuedAt,
      },
    });
    // Audit trail: ai đánh dấu, số nào — nối được với ProductEvent qua actor.
    await auditEvent(this.prisma, {
      slug: `invoice:${inv.orderCode}`,
      action: status === 'ISSUED' ? 'INVOICE_ISSUED' : 'INVOICE_FAILED',
      byUserId,
      summary: number ?? inv.orderCode,
    });
    return { ...row, amountVnd: Number(row.amountVnd) };
  }

  async retryInvoice(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Không thấy hóa đơn');
    if (inv.status === 'ISSUED') return inv;
    await this.invoices.issueViaProvider(id);
    const row = await this.prisma.invoice.findUnique({ where: { id } });
    return row ? { ...row, amountVnd: Number(row.amountVnd) } : row;
  }
}
