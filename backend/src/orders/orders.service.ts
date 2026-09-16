import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { linePrice } from '../common/pricing';
import { sameContact } from '../common/phone';
import { sessionSecret } from '../common/session';

const METHODS = ['centurion', 'escrow', 'deposit', 'vnpay', 'cod'] as const;
// Method mô phỏng (giả lập thu tiền, không có rails thật). Ở production
// bắt buộc tắt — bật thì đơn tự CONFIRMED + ghi payment SUCCESS mà không
// một đồng nào được thu (audit PAY-001).
const SIMULATED_METHODS = ['centurion', 'escrow', 'deposit', 'cod'] as const;

export function simulatedMethodsEnabled(): boolean {
  // Mặc định: bật ở dev/demo, TẮT ở production (fail-closed với tiền thật).
  // Set ENABLE_SIMULATED_METHODS=0 để tắt ở dev; =1 không bật được ở prod.
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.ENABLE_SIMULATED_METHODS !== '0';
}

function orderCode() {
  // 6 chữ số crypto-random (không dùng Math.random — không gian đoán được;
  // mã đơn lộ qua URL tra cứu/hủy theo SĐT nên phải khó dò). Trùng thì
  // transaction bên dưới bắt P2002 và thử lại.
  return `AC-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
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

export type CreateOrderOpts = {
  /** Idempotency-Key header: retry/double-click cùng key → trả đơn cũ. */
  idempotencyKey?: string;
};

/** Key BE chấp nhận: 8–64 ký tự URL-safe (FE sinh UUID/lần bấm). */
const IDEM_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

function normalizeIdemKey(raw: unknown): string | null {
  const k = String(raw ?? '').trim();
  return IDEM_KEY_RE.test(k) ? k : null;
}

/** Định danh chủ sở hữu cho khách vãng lai (không lưu SĐT thô vào bảng key). */
function contactHash(contact: string): string {
  return createHash('sha256')
    .update(contact.trim().toLowerCase())
    .digest('hex');
}

/**
 * Chữ ký xem đơn (sig cho URL redirect VNPay): HMAC-SHA256 mã đơn bằng
 * JWT_SECRET, cắt 32 hex. Người cầm link redirect (không đăng nhập, không
 * nhớ SĐT) vẫn xem được chi tiết đơn của chính mình; kẻ ngoài không forge
 * được nếu không có secret. Chỉ mở items+totals của ĐÚNG đơn đó — không
 * PII, không action (không thay thế auth).
 */
export function signOrderCode(code: string): string {
  return createHmac('sha256', sessionSecret())
    .update(`aurel-code-view:${code}`)
    .digest('hex')
    .slice(0, 32);
}

/** Verify sig xem đơn — sai format/secret thiếu → false (fail-closed). */
export function verifyOrderCode(code: string, sig: unknown): boolean {
  const s = String(sig ?? '');
  if (!/^[0-9a-f]{32}$/.test(s)) return false;
  try {
    return timingSafeEqual(
      Buffer.from(signOrderCode(code), 'utf8'),
      Buffer.from(s, 'utf8'),
    );
  } catch {
    return false;
  }
}

export type ByCodeOpts = {
  /** SĐT/email lúc đặt (so khớp mọi cách viết SĐT) — khách vãng lai. */
  contact?: string;
  /** userId từ session — chủ đơn đã đăng nhập. */
  userId?: string | null;
  /** Chữ ký xem đơn trong URL redirect VNPay (không login, không nhớ SĐT). */
  sig?: string;
};

/** Shape trả về của tạo đơn (dùng chung cho đơn mới + replay idempotent). */
export type CreateOrderResult = {
  orderId: string;
  code: string;
  totalUsd: number;
  totalVnd: number;
  paidUsd: number;
  paidVnd: number;
  remainingUsd: number;
  remainingVnd: number;
  status: string;
  pendingReview: boolean;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  /** Dựng response tạo đơn từ order DB (đơn mới hay replay đều cùng shape). */
  private toCreateResult(o: {
    id: string;
    code: string;
    totalUsd: number;
    totalVnd: bigint | number;
    paidUsd: number;
    paidVnd: bigint | number;
    status: string;
    items: { productSlug: string | null }[];
  }): CreateOrderResult {
    const totalVnd = Number(o.totalVnd);
    const paidVnd = Number(o.paidVnd);
    return {
      orderId: o.id,
      code: o.code,
      totalUsd: o.totalUsd,
      totalVnd,
      paidUsd: o.paidUsd,
      paidVnd,
      remainingUsd: o.totalUsd - o.paidUsd,
      remainingVnd: totalVnd - paidVnd,
      status: o.status,
      // Dòng không gắn SP thật = hàng bespoke/custom chờ concierge duyệt.
      pendingReview: o.items.some((i) => !i.productSlug),
    };
  }

  /**
   * Trả về đơn đã tạo trước đó cho cùng Idempotency-Key (null = chưa có).
   * Key gắn chủ sở hữu: key của user này không moi được đơn user khác —
   * sai chủ thì 409 thay vì rò rỉ (kể cả sự tồn tại của đơn).
   */
  private async replayIdempotent(
    key: string,
    userId: string | null,
    contact: string,
  ): Promise<CreateOrderResult | null> {
    const rec = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (!rec) return null;
    const owned = rec.userId
      ? rec.userId === userId
      : !userId && rec.contactHash === contactHash(contact);
    if (!owned)
      throw new ConflictException('Idempotency-Key đã được dùng cho đơn khác');
    const order = await this.prisma.order.findUnique({
      where: { id: rec.orderId },
      include: { items: true },
    });
    // Đơn gốc không còn (bị xóa tay ngoài luồng) → cho tạo mới.
    if (!order) return null;
    return this.toCreateResult(order);
  }

  /** Tạo đơn từ giỏ. Khách vãng lai vẫn đặt được (userId null). */
  async create(
    input: CreateOrderInput,
    userId: string | null,
    opts: CreateOrderOpts = {},
  ) {
    const customerName = String(input.customerName ?? '').trim();
    const contact = String(input.contact ?? '').trim();
    const address = String(input.address ?? '').trim();
    const slot = input.slot ? String(input.slot) : null;
    const method = String(input.payment?.method ?? 'vnpay');
    const items = Array.isArray(input.items) ? input.items.slice(0, 50) : [];

    if (!customerName || !contact || !address)
      throw new BadRequestException('Thiếu tên, liên lạc hoặc địa chỉ');

    // Idempotency-Key: request retry/double-click gửi cùng key → trả về đơn
    // đã tạo trước đó (không trừ kho lần 2). Key gắn với chủ sở hữu nên
    // không moi được đơn của người khác (P1-5).
    const idemKey = normalizeIdemKey(opts.idempotencyKey);
    if (idemKey) {
      const replay = await this.replayIdempotent(idemKey, userId, contact);
      if (replay) return replay;
    }
    if (!(METHODS as readonly string[]).includes(method))
      throw new BadRequestException('Phương thức thanh toán không hợp lệ');
    if (
      (SIMULATED_METHODS as readonly string[]).includes(method) &&
      !simulatedMethodsEnabled()
    )
      throw new BadRequestException(
        'Phương thức thanh toán này chỉ khả dụng ở môi trường demo — vui lòng chọn VNPay',
      );
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

    // Chống submit trùng (double-click / retry mạng): nếu user này vừa tạo
    // đơn giống hệt (cùng món, cùng tổng, cùng thanh toán) trong 3 phút qua
    // và đơn cũ chưa CANCELLED → trả lại đơn cũ thay vì tạo bản sao + trừ
    // kho thêm lần nữa. Khách vãng lai (userId null) không dedup được —
    // chấp nhận rủi ro vì VNPay settle đã idempotent theo txnRef.
    if (userId) {
      const since = new Date(Date.now() - 3 * 60 * 1000);
      const recent = await this.prisma.order.findFirst({
        where: {
          userId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          createdAt: { gte: since },
          totalUsd,
          payments: { some: { method } },
          items: {
            every: {
              productSlug: { in: slugs },
            },
            // số dòng khớp → không thêm bớt món
          },
        },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      });
      if (
        recent &&
        recent.items.length === lines.filter((l) => l.productSlug).length
      ) {
        // Trả lại đơn cũ (idempotent theo nội dung + khoảng 3') — cùng
        // shape như đơn mới tạo để FE checkout redirect bình thường.
        // (pendingReview suy từ items đơn cũ — đúng hơn flag của request mới.)
        return this.toCreateResult({
          ...recent,
          items: recent.items,
        });
      }
    }

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

    // Ghi Idempotency-Key → đơn vừa tạo (best-effort): retry sau này replay
    // đơn này. Race 2 request song song tuyệt đối cùng ms: bên thua P2002
    // thì trả đơn bên thắng (đơn trùng của mình đã tạo vẫn tồn tại — chấp
    // nhận, cửa sổ race hẹp; double-click/retry tuần tự đã được chặn hết).
    if (idemKey) {
      try {
        await this.prisma.idempotencyKey.create({
          data: {
            key: idemKey,
            userId,
            contactHash: userId ? null : contactHash(contact),
            orderId: order.id,
          },
        });
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          (e as { code?: string }).code === 'P2002'
        ) {
          const replay = await this.replayIdempotent(idemKey, userId, contact);
          if (replay) return replay;
        }
        // Lưu key fail vì lý do khác → thôi, đơn đã tạo đúng.
      }
    }

    // Thông báo không chặn luồng chính (fire-and-forget, có try/catch trong).
    void this.notify.orderCreated({
      code: order.code,
      status: order.status,
      customerName,
      contact,
      totalUsd: order.totalUsd,
      totalVnd: Number(order.totalVnd),
      paidUsd: order.paidUsd,
      method,
      itemCount: lines.reduce((s, l) => s + l.qty, 0),
    });

    return this.toCreateResult({
      id: order.id,
      code: order.code,
      totalUsd: order.totalUsd,
      totalVnd: order.totalVnd,
      paidUsd: order.paidUsd,
      paidVnd: order.paidVnd,
      status: order.status,
      items: lines.map((l) => ({ productSlug: l.productSlug })),
    });
  }

  /**
   * Tra cứu theo mã — chi tiết (items + totals) CHỈ cho người chứng minh
   * được sở hữu: session chính chủ, contact khớp, hoặc sig trong URL
   * redirect VNPay. Còn lại chỉ trả {code, status} (P1-6): mã đơn đoán được,
   * trước đây ai cũng xem được món + tổng tiền của đơn người khác.
   */
  async byCode(code: string, opts: ByCodeOpts = {}) {
    const order = await this.prisma.order.findUnique({
      where: { code },
      include: { items: true },
    });
    if (!order) return null;
    const owned =
      (opts.userId != null && order.userId === opts.userId) ||
      (opts.contact != null && sameContact(order.contact, opts.contact)) ||
      verifyOrderCode(order.code, opts.sig);
    if (!owned) return { code: order.code, status: order.status };
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

  /** Đơn của tôi — phân trang (trước đây trả toàn bộ, audit API-001). */
  async mine(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<{ items: unknown[]; total: number; page: number; limit: number }> {
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 10));
    const safePage = Math.max(1, Math.floor(page) || 1);
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);
    return {
      items: orders.map(serializeOrder),
      total,
      page: safePage,
      limit: safeLimit,
    };
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
    // So khớp mọi cách viết SĐT (+84/84/cách/gạch) + email hoa thường.
    const owned =
      (opts.userId && order.userId === opts.userId) ||
      (opts.contact != null && sameContact(order.contact, opts.contact));
    if (!owned) throw new ForbiddenException('Không có quyền hủy đơn này');

    await this.prisma.$transaction(async (tx) => {
      // Update ĐIỀU KIỆN: chỉ thắng khi đơn vẫn PENDING — hai lần hủy
      // song song thì bên thua nhận count=0, không hoàn kho lần 2 (ORD-001).
      const won = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      if (won.count === 0)
        throw new BadRequestException(
          'Đơn đã được xử lý trước đó, vui lòng tải lại trang',
        );
      // Hoàn kho các dòng có product thật — chỉ người thắng race mới đến đây.
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
