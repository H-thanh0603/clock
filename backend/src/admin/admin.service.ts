import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { serializeOrder } from '../orders/orders.service';

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
}
