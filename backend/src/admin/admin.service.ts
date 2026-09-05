import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { serializeOrder } from '../orders/orders.service';
import { linePrice } from '../common/pricing';

const STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PAID',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
] as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: string) {
    const where = status ? { status: status as (typeof STATUSES)[number] } : {};
    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { items: true, payments: { orderBy: { createdAt: 'desc' } } },
      take: 100,
    });
    const counts = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    return { orders: orders.map(serializeOrder), counts };
  }

  async updateStatus(id: string, status: string) {
    if (!(STATUSES as readonly string[]).includes(status))
      throw new BadRequestException('Trạng thái không hợp lệ');
    const order = await this.prisma.order.update({
      where: { id },
      data: { status: status as (typeof STATUSES)[number] },
    });
    return { id: order.id, status: order.status };
  }

  /** Số liệu tổng quan cho dashboard. */
  async stats() {
    const [counts, revenue, users, products, recent] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.order.aggregate({
        where: { status: { not: 'CANCELLED' } },
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

  /** Danh sách khách hàng kèm số đơn + tổng chi (trừ đơn hủy). */
  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const ids = users.map((u) => u.id);
    const spent = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, status: { not: 'CANCELLED' } },
      _count: { userId: true },
      _sum: { totalVnd: true },
    });
    const byUser = new Map(
      spent.map((s) => [
        s.userId,
        {
          orderCount: s._count.userId,
          totalVnd: Number(s._sum.totalVnd ?? BigInt(0)),
        },
      ]),
    );
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      orderCount: byUser.get(u.id)?.orderCount ?? 0,
      totalVnd: byUser.get(u.id)?.totalVnd ?? 0,
    }));
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

  /** Tạo sản phẩm mới (priceVnd suy ra từ priceUsd — không nhận từ client). */
  async createProduct(body: Record<string, unknown>) {
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
    const row = await this.prisma.product.create({
      data: {
        slug,
        name: name.slice(0, 200),
        reference,
        collection: str(body.collection, 100) || 'classic',
        priceUsd,
        priceVnd,
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
    return { slug: row.slug };
  }

  /** Sửa sản phẩm (cho phép đổi giá/labels/ẩn-hiện; không đổi slug). */
  async updateProduct(slug: string, body: Record<string, unknown>) {
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
    if (body.inBoutique !== undefined)
      data.inBoutique = body.inBoutique !== false;
    const row = await this.prisma.product.update({ where: { slug }, data });
    return { slug: row.slug };
  }
}
