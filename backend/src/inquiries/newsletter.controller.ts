import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Nurture email (footer newsletter). Public POST, throttle riêng — email
 * trùng là no-op idempotent; luôn trả cùng shape (không lộ email đã có).
 */
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async subscribe(@Body() body: { email?: string; source?: string }) {
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase()
      .slice(0, 160);
    if (!EMAIL_RE.test(email))
      throw new BadRequestException('Email không hợp lệ');
    await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      create: {
        email,
        source: String(body?.source ?? '').trim().slice(0, 40) || null,
      },
      update: {},
    });
    return { ok: true };
  }
}
