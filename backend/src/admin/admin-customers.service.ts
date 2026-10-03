import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { serializeOrder } from '../orders/orders.service';

/**
 * Cụm Customer của backoffice (CONTEXT.md: Private Client) — list kèm
 * số đơn + tổng chi, chi tiết 1 khách.
 */
@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

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
}
