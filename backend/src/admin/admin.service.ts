import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { serializeOrder } from '../orders/orders.service';
import { linePrice } from '../common/pricing';
import { ProductsService } from '../products/products.service';
import { MeiliService } from '../search/meili.service';

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

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly meili: MeiliService,
  ) {}

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
      return statsCache.data as Awaited<ReturnType<AdminService['statsRaw']>>;
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

  /** Danh sách khách hàng kèm số đơn + tổng chi (trừ đơn hủy) — phân trang. */
  async listUsers(page = 1, limit = 20) {
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 20));
    const safePage = Math.max(1, Math.floor(page) || 1);
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.user.count(),
    ]);
    const ids = users.map((u) => u.id);
    const spent = ids.length
      ? await this.prisma.order.groupBy({
          by: ['userId'],
          where: { userId: { in: ids }, status: { not: 'CANCELLED' } },
          _count: { userId: true },
          _sum: { totalVnd: true },
        })
      : [];
    const byUser = new Map(
      spent.map((s) => [
        s.userId,
        {
          orderCount: s._count.userId,
          totalVnd: Number(s._sum.totalVnd ?? BigInt(0)),
        },
      ]),
    );
    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
        orderCount: byUser.get(u.id)?.orderCount ?? 0,
        totalVnd: byUser.get(u.id)?.totalVnd ?? 0,
      })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async userDetail(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không thấy khách hàng');
    const orders = await this.prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      orders: orders.map(serializeOrder),
    };
  }

  /** Danh sách SP cho backoffice — thấy cả SP ẩn (inBoutique=false). */
  async listProducts(
    page = 1,
    limit = 20,
    q?: string,
    includeHidden = true,
  ) {
    return this.products.list(
      {
        q,
        page,
        limit,
        sort: 'newest',
      },
      { includeHidden },
    );
  }

  /** Tạo sản phẩm mới (priceVnd suy ra từ priceUsd — không nhận từ client). */
  async createProduct(body: Record<string, unknown>, byUserId?: string) {
    const slug = String(body.slug ?? '').trim();
    const name = String(body.name ?? '').trim();
    const reference = String(body.reference ?? '').trim();
    const priceUsd = Math.max(0, Math.floor(Number(body.priceUsd) || 0));
    if (!slug || !name || !reference || priceUsd <= 0)
      throw new BadRequestException('Thiếu slug/tên/reference/giá');
    const dup = await this.prisma.product.findFirst({
      where: { OR: [{ slug }, { reference }] },
    });
    if (dup) throw new ConflictException('Slug hoặc reference đã tồn tại');
    const str = (v: unknown, max = 500) => String(v ?? '').slice(0, max);
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)) : [];
    const { priceVnd } = linePrice(priceUsd, null);
    const stock = Math.max(0, Math.floor(Number(body.stock ?? 1)));
    const row = await this.prisma.product.create({
      data: {
        slug,
        name: name.slice(0, 200),
        reference,
        collection: str(body.collection, 100) || 'classic',
        priceUsd,
        priceVnd,
        stock,
        shortDescription: str(body.shortDescription, 2000),
        badges: strArr(body.badges),
        strapLabel: str(body.strapLabel, 200),
        cardImage: str(body.cardImage),
        images: strArr(body.images),
        calibre: str(body.calibre, 200),
        diameterMm: Number(body.diameterMm) || 0,
        caseMaterial: str(body.caseMaterial, 200),
        complications: strArr(body.complications),
        inBoutique: body.inBoutique !== false,
        specs:
          (body.specs as { label: string; value: string }[] | undefined) ?? [],
        narrative: str(body.narrative, 5000),
      },
    });
    await this.prisma.productEvent.create({
      data: {
        slug,
        action: 'CREATE',
        byUserId: byUserId ?? null,
        summary: `${name} • $${priceUsd.toLocaleString()}`,
      },
    });
    await this.meili.upsertProduct(row as unknown as Record<string, unknown>);
    return { slug: row.slug };
  }

  /** Sửa sản phẩm (cho phép đổi giá/labels/ẩn-hiện; không đổi slug). */
  async updateProduct(
    slug: string,
    body: Record<string, unknown>,
    byUserId?: string,
  ) {
    const exists = await this.prisma.product.findUnique({ where: { slug } });
    if (!exists) throw new NotFoundException('Không thấy sản phẩm');
    const data: Record<string, unknown> = {};
    if (body.name !== undefined)
      data.name = String(body.name).slice(0, 200);
    if (body.reference !== undefined)
      data.reference = String(body.reference);
    if (body.collection !== undefined)
      data.collection = String(body.collection).slice(0, 100);
    if (body.priceUsd !== undefined) {
      const priceUsd = Math.max(0, Math.floor(Number(body.priceUsd) || 0));
      if (priceUsd <= 0) throw new BadRequestException('Giá không hợp lệ');
      data.priceUsd = priceUsd;
      data.priceVnd = linePrice(priceUsd, null).priceVnd;
    }
    for (const k of [
      'shortDescription',
      'strapLabel',
      'cardImage',
      'calibre',
      'caseMaterial',
      'narrative',
    ]) {
      if (body[k] !== undefined) data[k] = String(body[k]);
    }
    for (const k of ['badges', 'images', 'complications']) {
      if (body[k] !== undefined && Array.isArray(body[k]))
        data[k] = (body[k] as unknown[]).map((x) => String(x));
    }
    if (body.specs !== undefined) data.specs = body.specs;
    if (body.diameterMm !== undefined)
      data.diameterMm = Number(body.diameterMm) || 0;
    if (body.stock !== undefined)
      data.stock = Math.max(0, Math.floor(Number(body.stock) || 0));
    if (body.inBoutique !== undefined)
      data.inBoutique = body.inBoutique !== false;
    const row = await this.prisma.product.update({ where: { slug }, data });
    const changed = Object.keys(data).join(',');
    await this.prisma.productEvent.create({
      data: {
        slug,
        action: 'UPDATE',
        byUserId: byUserId ?? null,
        summary: changed || 'no-change',
      },
    });
    // Đồng bộ Meili: row đã update đủ field index cần (merge exists+data
    // cho field không đổi vẫn đúng vì update trả row đầy đủ).
    await this.meili.upsertProduct(row as unknown as Record<string, unknown>);
    return { slug: row.slug };
  }

  async productEvents(slug: string) {
    return this.prisma.productEvent.findMany({
      where: { slug },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  // -- Promotions (merchant agent: stage_promotion → apply tạo + đổi giá) --

  async listPromotions(active?: boolean) {
    return this.prisma.promotion.findMany({
      where: active === undefined ? {} : { active },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createPromotion(
    body: {
      name?: unknown;
      listingSlugs?: unknown;
      discountPct?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
    },
    byUserId?: string,
  ) {
    const name = String(body.name ?? '').trim().slice(0, 80);
    const slugs = Array.isArray(body.listingSlugs)
      ? (body.listingSlugs as unknown[]).map((s) => String(s)).filter(Boolean)
      : [];
    const discountPct = Number(body.discountPct);
    const startsAt = new Date(String(body.startsAt ?? ''));
    const endsAt = new Date(String(body.endsAt ?? ''));
    if (!name || slugs.length === 0)
      throw new BadRequestException('Thiếu tên hoặc danh sách sản phẩm');
    if (!Number.isFinite(discountPct) || discountPct === 0 || Math.abs(discountPct) > 90)
      throw new BadRequestException('discountPct phải trong [-90, 90] và khác 0');
    if (Number.isNaN(+startsAt) || Number.isNaN(+endsAt) || startsAt >= endsAt)
      throw new BadRequestException('Khung ngày không hợp lệ (starts < ends)');
    // Chặn promotion chồng lên sản phẩm đang trong promotion active khác —
    // giá KM đè nhau rồi cron hồi giá không biết hồi về đâu (BIZ-HIGH-02).
    const overlapping = await this.prisma.promotion.findMany({
      where: { active: true, endsAt: { gt: new Date() } },
      select: { id: true, name: true, listingSlugs: true },
    });
    const clash = overlapping.find((p) =>
      p.listingSlugs.some((s) => slugs.includes(s)),
    );
    if (clash)
      throw new ConflictException(
        `Sản phẩm đã nằm trong khuyến mãi đang chạy "${clash.name}" — tắt nó trước`,
      );
    // Snapshot giá gốc lúc tạo: cron hết hạn hồi giá từ đây. Chỉ snapshot
    // SP tồn tại (slug lạ bỏ qua — apply thật cũng chỉ chạm SP có trong DB).
    const existing = await this.prisma.product.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true, priceUsd: true },
    });
    const priceSnapshot: Record<string, number> = {};
    for (const r of existing) priceSnapshot[r.slug] = r.priceUsd;
    const row = await this.prisma.promotion.create({
      data: {
        name,
        listingSlugs: slugs,
        discountPct,
        startsAt,
        endsAt,
        active: true,
        priceSnapshot,
        createdById: byUserId ?? null,
      },
    });
    return row;
  }

  async setPromotionActive(id: string, active: boolean) {
    try {
      if (!active) {
        // Tắt tay giữa chừng cũng hồi giá như hết hạn tự nhiên — nếu không
        // giá KM ở lại vĩnh viễn (cùng bug BIZ-HIGH-02).
        return await this.closePromotion(id, 'Tắt thủ công');
      }
      return await this.prisma.promotion.update({ where: { id }, data: { active } });
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw new NotFoundException('Không thấy promotion');
    }
  }

  /**
   * Đóng promotion: hồi giá các SP đã thực sự bị đổi về giá KM, rồi
   * đánh active=false — trong 1 transaction. Chỉ hồi slug có giá hiện tại
   * KHÁC snapshot (promotion tạo mà chưa từng apply giá, hoặc admin đã sửa
   * tay về đúng giá gốc thì không đụng tới).
   */
  async closePromotion(
    id: string,
    reason: string,
  ): Promise<{ id: string; restored: number }> {
    const promo = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promo) throw new NotFoundException('Không thấy promotion');
    if (!promo.active) return { id, restored: 0 };
    const snap = (promo.priceSnapshot ?? {}) as Record<string, number>;
    const restoredSlugs: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const [slug, origUsd] of Object.entries(snap)) {
        if (!Number.isFinite(origUsd)) continue;
        const cur = await tx.product.findUnique({
          where: { slug },
          select: { priceUsd: true },
        });
        if (!cur || cur.priceUsd === Math.floor(origUsd)) continue;
        const { priceVnd } = linePrice(Math.floor(origUsd), null);
        await tx.product.update({
          where: { slug },
          data: { priceUsd: Math.floor(origUsd), priceVnd },
        });
        await tx.productEvent.create({
          data: {
            slug,
            action: 'PROMO_END',
            summary: `${promo.name} — ${reason}, hồi giá $${Math.floor(origUsd).toLocaleString()}`,
          },
        });
        restoredSlugs.push(slug);
      }
      await tx.promotion.update({ where: { id }, data: { active: false } });
    });
    // Đồng bộ Meili cho SP vừa hồi giá (best-effort, never throws).
    for (const slug of restoredSlugs) {
      try {
        const row = await this.prisma.product.findUnique({ where: { slug } });
        if (row)
          await this.meili.upsertProduct(row as unknown as Record<string, unknown>);
      } catch {
        // upsertProduct đã warn nội bộ; không chặn response.
      }
    }
    return { id, restored: restoredSlugs.length };
  }

  // -- Campaigns (merchant agent: stage_campaign → apply tạo/cập nhật) --

  async listCampaigns(status?: string) {
    return this.prisma.campaign.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createCampaign(
    body: {
      name?: unknown;
      objective?: unknown;
      audience?: unknown;
      budgetUsd?: unknown;
      copyText?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
    },
    byUserId?: string,
  ) {
    const name = String(body.name ?? '').trim().slice(0, 80);
    if (!name) throw new BadRequestException('Thiếu tên campaign');
    const budgetUsd = Math.max(0, Math.floor(Number(body.budgetUsd) || 0));
    const parseOpt = (v: unknown) => {
      if (v === undefined || v === null || v === '') return null;
      const d = new Date(String(v));
      return Number.isNaN(+d) ? null : d;
    };
    const row = await this.prisma.campaign.create({
      data: {
        name,
        objective: body.objective ? String(body.objective).slice(0, 200) : null,
        audience: body.audience ? String(body.audience).slice(0, 300) : null,
        budgetUsd,
        copyText: body.copyText ? String(body.copyText).slice(0, 600) : null,
        status: 'draft',
        startsAt: parseOpt(body.startsAt),
        endsAt: parseOpt(body.endsAt),
        createdById: byUserId ?? null,
      },
    });
    return row;
  }

  async updateCampaign(id: string, body: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).slice(0, 80);
    if (body.objective !== undefined)
      data.objective = body.objective ? String(body.objective).slice(0, 200) : null;
    if (body.audience !== undefined)
      data.audience = body.audience ? String(body.audience).slice(0, 300) : null;
    if (body.copyText !== undefined)
      data.copyText = body.copyText ? String(body.copyText).slice(0, 600) : null;
    if (body.budgetUsd !== undefined)
      data.budgetUsd = Math.max(0, Math.floor(Number(body.budgetUsd) || 0));
    if (body.status !== undefined) {
      const s = String(body.status);
      if (!['draft', 'active', 'paused', 'ended'].includes(s))
        throw new BadRequestException('Status campaign không hợp lệ');
      data.status = s;
    }
    try {
      return await this.prisma.campaign.update({ where: { id }, data });
    } catch {
      throw new NotFoundException('Không thấy campaign');
    }
  }

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
}
