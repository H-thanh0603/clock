import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../common/guards';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import {
  CreateInquiryDto,
  normalizePayload,
} from './inquiry.dto';

const TYPES = new Set(['SALON', 'BESPOKE']);

/**
 * Form "Đặt lịch Private Salon" (trang chủ/atelier) và đơn bespoke
 * (configurator). Public POST (rate-limited toàn app) — lưu DB, đẩy
 * Telegram/Email cho concierge; admin đọc/danh sách ở GET.
 */
@Controller('inquiries')
export class InquiriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(@Body() dto: CreateInquiryDto) {
    const type = TYPES.has(dto.type) ? dto.type : 'SALON';
    // Payload configurator: cap 4KB + sanitize trước khi chạm DB / Telegram
    // (audit DATA-001 — trước đây JSON client không giới hạn kích thước).
    const payload = normalizePayload(dto.payload);
    const inquiry = await this.prisma.inquiry.create({
      data: {
        type,
        name: dto.name.trim().slice(0, 120),
        phone: dto.phone.trim().slice(0, 40),
        email: dto.email?.trim().slice(0, 160) || null,
        message: dto.message?.trim().slice(0, 2000) || null,
        payload: (payload ?? undefined) as never,
      },
    });

    // Thông báo concierge — kênh optional, lỗi không chặn lưu DB.
    const label = type === 'BESPOKE' ? 'Đơn bespoke' : 'Yêu cầu đặt lịch';
    const lines = [
      `📬 <b>${label} mới</b> (${inquiry.id.slice(-6)})`,
      `Khách: ${inquiry.name} — ${inquiry.phone}${inquiry.email ? ` — ${inquiry.email}` : ''}`,
    ];
    if (inquiry.message) lines.push(`Ghi chú: ${inquiry.message}`);
    if (payload) {
      // Payload đã sanitize ở trên (4KB, scalar, sâu ≤3) — render an toàn
      // vì Telegram parse_mode=HTML: escape thẻ trước khi ghép vào chuỗi.
      const esc = (v: string) =>
        v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const opts = Object.entries(payload)
        .map(([k, v]) => `${esc(k)}: ${esc(String(v))}`)
        .join(' • ');
      if (opts) lines.push(`Cấu hình: ${opts}`);
    }
    await this.notify.telegram(lines.join('\n'));
    if (inquiry.email) {
      await this.notify.email(
        inquiry.email,
        `[Aurel & Co.] Đã nhận ${label.toLowerCase()}`,
        `Kính chào ${inquiry.name},\n\nAtelier đã nhận ${label.toLowerCase()} của quý khách. Concierge sẽ liên hệ trong 24 giờ làm việc.\n\nTrân trọng,\nAurel & Co.`,
      );
    }

    return { id: inquiry.id, status: 'OK' };
  }

  @Get()
  @UseGuards(AdminGuard)
  async list(
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.prisma.inquiry.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
