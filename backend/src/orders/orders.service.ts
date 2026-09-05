import {
  BadRequestException,
  Injectable,
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
  items: { priceVnd: bigint }[];
  payments?: { amountUsd?: number }[];
  [k: string]: unknown;
}) {
  return {
    ...o,
    totalVnd: Number(o.totalVnd),
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

    // Chốt giá phía server: sản phẩm có trong DB thì lấy giá DB,
    // hàng bespoke/phụ kiện custom thì giữ giá client gửi.
    const slugs = [...new Set(items.map((i) => String(i.slug ?? '')).filter(Boolean))];
    const rows = await this.prisma.product.findMany({
      where: { slug: { in: slugs } },
    });
    const priceOf = new Map(rows.map((r) => [r.slug, r]));

    let totalUsd = 0;
    let totalVnd = 0;
    const lines = items.map((i) => {
      const qty = Math.min(99, Math.max(1, Math.floor(Number(i.qty ?? 1))));
      const db = priceOf.get(String(i.slug ?? ''));
      const strap = String(i.strap ?? 'Tiêu chuẩn Atelier');
      // Giá gốc USD: DB nếu có, bespoke/phụ kiện thì dùng giá client gửi.
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

    // Mã đơn duy nhất (thử lại nếu đụng)
    let code = orderCode();
    for (let k = 0; k < 5; k++) {
      const dup = await this.prisma.order.findUnique({ where: { code } });
      if (!dup) break;
      code = orderCode();
    }

    const simulated = method !== 'vnpay';
    const order = await this.prisma.order.create({
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
        items: { create: lines },
        payments: {
          create: {
            method,
            amountUsd: totalUsd,
            status: simulated ? 'SUCCESS' : 'PENDING',
            txnRef: simulated ? `SIM-${code}` : null,
          },
        },
      },
      include: { items: true },
    });

    // Xóa giỏ DB sau khi chốt đơn (giỏ local do client tự clear)
    if (userId) {
      await this.prisma.cartItem.deleteMany({ where: { userId } });
    }

    return {
      orderId: order.id,
      code: order.code,
      totalUsd: order.totalUsd,
      totalVnd: Number(order.totalVnd),
      status: order.status,
    };
  }

  async byCode(code: string) {
    const order = await this.prisma.order.findUnique({
      where: { code },
      include: { items: true, payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) return null;
    return serializeOrder(order);
  }

  async mine(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return orders.map(serializeOrder);
  }
}
