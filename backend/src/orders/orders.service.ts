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

    // Tạo đơn + xóa giỏ trong 1 transaction (tránh đơn nửa vời khi crash).
    // Mã đơn random có thể đụng → bắt unique-constraint và thử lại.
    let order = null as null | {
      id: string;
      code: string;
      totalUsd: number;
      totalVnd: bigint;
      status: string;
    };
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = orderCode();
      try {
        order = await this.prisma.$transaction(async (tx) => {
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
          });
          // Xóa giỏ DB sau khi chốt đơn (giỏ local do client tự clear)
          if (userId) {
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
}
