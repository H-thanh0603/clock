import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../common/guards';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import {
  CreateInquiryDto,
  normalizePayload,
} from './inquiry.dto';
import { triageInquiry } from '../common/jev';

const TYPES = new Set(['SALON', 'BESPOKE']);

/** Escape text trước khi ghép vào tin Telegram parse_mode=HTML (audit NV-2). */
export function escapeTelegramHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
    const name = dto.name.trim().slice(0, 120);
    const message = dto.message?.trim().slice(0, 2000) || null;
    // Jev triage (1 call, ~100ms): spam gate + urgency + bespoke lead.
    // Hỏng/thiếu key → null → hành vi cũ nguyên vẹn (không ping nhầm, không
    // mất inquiry). Chỉ BESPOKE mới hỏi lead — SALON không tốn dimension.
    const triage = await triageInquiry({ type, name, message, payload });
    // Spam chắc chắn (noul ≥ 0.85) → vẫn lưu để truy vết, nhưng status SPAM
    // (không hiện hàng NEW) và KHÔNG ping Telegram/email.
    const inquiry = await this.prisma.inquiry.create({
      data: {
        type,
        name,
        phone: dto.phone.trim().slice(0, 40),
        email: dto.email?.trim().slice(0, 160) || null,
        message,
        payload: (payload ?? undefined) as never,
        status: triage?.isSpam ? 'SPAM' : 'NEW',
      },
    });
    if (triage?.isSpam) return { id: inquiry.id, status: 'OK' };

    // Thông báo concierge — qua hàng đợi NotifyService (không chặn response,
    // Telegram/SMTP fail thì retry với backoff thay vì mất thông báo).
    // Jev urgency: vip/hot thêm tag ưu tiên đầu tin; bespoke gắn lead score.
    const label = type === 'BESPOKE' ? 'Đơn bespoke' : 'Yêu cầu đặt lịch';
    const esc = escapeTelegramHtml;
    const priorityPrefix =
      triage?.urgency === 'vip' ? '🚨 <b>[VIP]</b> '
      : triage?.urgency === 'hot' ? '🔥 <b>[GẤP]</b> '
      : '';
    const lines = [
      `📬 ${priorityPrefix}<b>${label} mới</b> (${inquiry.id.slice(-6)})`,
      `Khách: ${esc(inquiry.name)} — ${esc(inquiry.phone)}${inquiry.email ? ` — ${esc(inquiry.email)}` : ''}`,
    ];
    if (type === 'BESPOKE' && triage?.lead)
      lines.push(`Lead: ${triage.lead.toUpperCase()} (Jev)`);
    if (inquiry.message) lines.push(`Ghi chú: ${esc(inquiry.message)}`);
    if (payload) {
      // Payload đã sanitize ở trên (4KB, scalar, sâu ≤3) — render an toàn
      // vì Telegram parse_mode=HTML: escape thẻ trước khi ghép vào chuỗi.
      const opts = Object.entries(payload)
        .map(([k, v]) => `${esc(k)}: ${esc(String(v))}`)
        .join(' • ');
      if (opts) lines.push(`Cấu hình: ${opts}`);
    }
    await this.notify.enqueueText(lines.join('\n'));
    if (inquiry.email) {
      await this.notify.enqueueEmail(
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
