import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { linePrice } from '../common/pricing';

const METHODS = ['centurion', 'escrow', 'deposit', 'vnpay', 'cod'] as const;

function orderCode() {
  return `AC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
}

export type ItemInput = {
  slug?: string;
  name: string;
  priceUsd: number;
  priceVnd: number;
  image: string;
  strap?: string;
  engraving?: string;
  qty?: number;
};

export type CreateOrderInput = {
  customerName?: string;
  contact?: string;
  address?: string;
  slot?: string;
  items?: ItemInput[];
  payment?: { method?: string };
};

/** Serialize order (BigInt/Date → JSON-safe). */
export function serializeOrder(o: {
  totalVnd: bigint;
  paidVnd?: bigint;
  items: { priceVnd: bigint }[];
  payments?: { amountUsd?: number }[];
  [k: string]: unknown;
}) {
  return {
    ...o,
    totalVnd: Number(o.totalVnd),
    paidVnd: o.paidVnd !== undefined ? Number(o.paidVnd) : undefined,
    items: o.items.map((i) => ({ ...i, priceVnd: Number(i.priceVnd) })),
  };
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tạo đơn từ giỏ. Khách vãng lai vẫn đặt được (userId null). */
  async create(input: CreateOrderInput, userId: string | null) {
    const customerName = String(input.customerName ?? '').trim();
    const contact = String(input.contact ?? '').trim();
    const address = String(input.address ?? '').trim();
    const slot = input.slot ? String(input.slot) : null;
    const method = String(input.payment?.method ?? 'centurion');
    const items = Array.isArray(input.items) ? input.items.slice(0, 50) : [];

    if (!customerName || !contact || !address)
      throw new BadRequestException('Thiếu tên, liên lạc hoặc địa chỉ');
    if (!(METHODS as readonly string[]).includes(method))
      throw new BadRequestException('Phương thức thanh toán không hợp lệ');
    if (items.length === 0)
      throw new BadRequestException('Giỏ hàng trống');

    // Chốt giá phía server: sản phẩm có trong DB thì lấy giá DB.
    // - Slug lạ (không trong DB) → chỉ chấp nhận làm hàng bespoke/custom,
    //   cả đơn chuyển PENDING để concierge duyệt giá thủ công.
    // - SP bị ẩn khỏi boutique (inBoutique=false) → từ chối outright.
    const slugs = [...new Set(items.map((i) => String(i.slug ?? '')).filter(Boolean))];
    const rows = await this.prisma.product.findMany({
      where: { slug: { in: slugs } },
    });
    const priceOf = new Map(rows.map((r) => [r.slug, r]));

    let totalUsd = 0;
    let totalVnd = 0;
    let hasCustom = false;
    const lines = items.map((i) => {
      const qty = Math.min(99, Math.max(1, Math.floor(Number(i.qty ?? 1))));
      const slug = String(i.slug ?? '');
      const db = priceOf.get(slug);
      if (slug && !db)
        // Slug bịa nhưng không tồn tại → hàng custom, chờ duyệt.
        hasCustom = true;
      if (db && !db.inBoutique)
        throw new BadRequestException(
          `Sản phẩm ${db.name} hiện ngừng trưng bày`,
        );
      if (db && db.stock < qty)
        throw new BadRequestException(
          `Sản phẩm ${db.name} chỉ còn ${db.stock} chiếc`,
        );
      const strap = String(i.strap ?? 'Tiêu chuẩn Atelier');
      // Giá gốc USD: DB nếu có, bespoke thì dùng giá client gửi (đơn PENDING).
      // VND LUÔN suy ra từ USD × USD_TO_VND — không tin priceVnd client.
      const { priceUsd, priceVnd } = linePrice(
        db ? db.priceUsd : Math.max(0, Math.floor(Number(i.priceUsd) || 0)),
        strap,
      );
      totalUsd += priceUsd * qty;
      totalVnd += priceVnd * qty;
      return {
        // Slug chỉ được ghi khi tồn tại trong DB (FK Product.slug);
        // hàng bespoke/phụ kiện custom không có product tương ứng → null.
        productSlug: db ? String(i.slug ?? '') : null,
        name: String(i.name ?? '').slice(0, 200),
        priceUsd,
        priceVnd,
        image: String(i.image ?? ''),
        strap,
        engraving: i.engraving ? String(i.engraving).slice(0, 120) : null,
        qty,
      };
    });
    if (totalUsd <= 0)
      throw new BadRequestException('Tổng đơn không hợp lệ');

    // Hàng custom phải qua concierge duyệt giá → không auto-confirm.
    const simulated = method !== 'vnpay' && !hasCustom;
    // Deposit 20%: chỉ thu trước 20%, còn lại thanh toán khi bàn giao.
    const isDeposit = simulated && method === 'deposit';
    const paidUsd = simulated ? (isDeposit ? Math.round(totalUsd * 0.2) : totalUsd) : 0;
    const paidVnd = simulated
      ? isDeposit
        ? Math.round(totalVnd * 0.2)
        : totalVnd
      : 0;

    // Tạo đơn + trừ kho + xóa giỏ trong 1 transaction.
    // Mã đơn random có thể đụng → bắt unique-constraint và thử lại.
    let order = null as null | {
      id: string;
      code: string;
      totalUsd: number;
      totalVnd: bigint;
      paidUsd: number;
      paidVnd: bigint;
      status: string;
    };
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = orderCode();
      try {
        order = await this.prisma.$transaction(async (tx) => {
          // Trừ kho có điều kiện (chống oversell khi chốt song song).
          for (const l of lines) {
            if (!l.productSlug) continue;
            const r = await tx.product.updateMany({
              where: { slug: l.productSlug, stock: { gte: l.qty } },
              data: { stock: { decrement: l.qty } },
            });
            if (r.count === 0)
              throw new BadRequestException(
                `Sản phẩm ${l.name} vừa hết hàng, vui lòng thử lại`,
              );
          }
          const created = await tx.order.create({
            data: {
              code,
              userId,
              customerName: customerName.slice(0, 200),
              contact: contact.slice(0, 200),
              address: address.slice(0, 500),
              slot: slot?.slice(0, 200) ?? null,
              status: simulated ? 'CONFIRMED' : 'PENDING',
              totalUsd,
              totalVnd,
              paidUsd,
              paidVnd,
              items: { create: lines },
              payments: {
                create: {
                  method,
                  amountUsd: paidUsd,
                  status: simulated ? 'SUCCESS' : 'PENDING',
                  txnRef: simulated ? `SIM-${code}` : null,
                },
              },
              events: { create: { from: null, to: simulated ? 'CONFIRMED' : 'PENDING' } },
            },
          });
          // Xóa giỏ DB sau khi chốt đơn KHÔNG qua VNPay.
          // Đơn VNPay chỉ clear khi settle success (bỏ giữa chừng vẫn giữ giỏ).
          if (userId && simulated) {
            await tx.cartItem.deleteMany({ where: { userId } });
          }
          return created;
        });
        break;
      } catch (e) {
        // P2002 = đụng mã đơn (hiếm) → thử mã khác; lỗi khác throw luôn.
        if (
          attempt < 5 &&
          typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          (e as { code?: string }).code === 'P2002'
        ) {
          continue;
        }
        throw e;
      }
    }
    if (!order) throw new BadRequestException('Không tạo được mã đơn, thử lại');

    return {
      orderId: order.id,
      code: order.code,
      totalUsd: order.totalUsd,
      totalVnd: Number(order.totalVnd),
      paidUsd: order.paidUsd,
      paidVnd: Number(order.paidVnd),
      remainingUsd: order.totalUsd - order.paidUsd,
      remainingVnd: Number(order.totalVnd) - Number(order.paidVnd),
      status: order.status,
      pendingReview: hasCustom,
    };
  }

  /**
   * Tra cứu công khai theo mã — chỉ trả trường tối thiểu để hiển thị
   * (không lộ tên/SĐT/địa chỉ/userId), vì mã đơn dễ đoán.
   */
  async byCode(code: string) {
    const order = await this.prisma.order.findUnique({
      where: { code },
      include: { items: true },
    });
    if (!order) return null;
    return {
      code: order.code,
      status: order.status,
      totalUsd: order.totalUsd,
      totalVnd: Number(order.totalVnd),
      items: order.items.map((i) => ({
        id: i.id,
        name: i.name,
        priceUsd: i.priceUsd,
        priceVnd: Number(i.priceVnd),
        image: i.image,
        strap: i.strap,
        qty: i.qty,
      })),
    };
  }

  async mine(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return orders.map(serializeOrder);
  }

  /** Hủy đơn PENDING (chính chủ hoặc contact khớp cho khách vãng lai). */
  async cancel(
    orderId: string,
    opts: { userId?: string | null; contact?: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Không thấy đơn hàng');
    if (order.status !== 'PENDING')
      throw new BadRequestException('Chỉ hủy được đơn đang chờ xác nhận');
    const owned =
      (opts.userId && order.userId === opts.userId) ||
      (opts.contact &&
        order.contact.trim().toLowerCase() ===
          opts.contact.trim().toLowerCase());
    if (!owned) throw new ForbiddenException('Không có quyền hủy đơn này');

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });
      // Hoàn kho các dòng có product thật.
      for (const l of order.items) {
        if (!l.productSlug) continue;
        await tx.product.updateMany({
          where: { slug: l.productSlug },
          data: { stock: { increment: l.qty } },
        });
      }
      await tx.orderEvent.create({
        data: {
          orderId,
          from: 'PENDING',
          to: 'CANCELLED',
          byUserId: opts.userId ?? null,
          note: 'Khách hủy',
        },
      });
    });
    return { id: orderId, status: 'CANCELLED' as const };
  }

  async cancelByCode(code: string, contact: string) {
    const order = await this.prisma.order.findUnique({ where: { code } });
    if (!order) throw new NotFoundException('Không thấy đơn hàng');
    return this.cancel(order.id, { contact });
  }
}
