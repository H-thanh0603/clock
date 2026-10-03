import { describe, expect, it } from 'vitest';
import { NewsletterController } from './newsletter.controller';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * POST /newsletter — nurture email từ footer.
 * - Email chuẩn hoá (trim/lowercase) trước khi upsert → idempotent.
 * - Email rác → 400; upsert luôn cùng shape (không lộ email đã tồn tại).
 */
function makeCtl() {
  const upserts: {
    where: { email: string };
    create: { email: string; source: string | null };
    update: Record<string, never>;
  }[] = [];
  const prisma = {
    newsletterSubscriber: {
      upsert: (a: (typeof upserts)[number]) => {
        upserts.push(a);
        return Promise.resolve({});
      },
    },
  } as unknown as PrismaService;
  return { ctl: new NewsletterController(prisma), upserts };
}

describe('NewsletterController.subscribe', () => {
  it('email hợp lệ → upsert chuẩn hoá + source', async () => {
    const { ctl, upserts } = makeCtl();
    const r = await ctl.subscribe({ email: '  Vip@AUREL.vn ', source: 'footer' });
    expect(r).toEqual({ ok: true });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].where.email).toBe('vip@aurel.vn');
    expect(upserts[0].create.source).toBe('footer');
    expect(upserts[0].update).toEqual({}); // trùng email = no-op, không ghi đè source
  });

  it('email rác → BadRequest, không chạm DB', async () => {
    const { ctl, upserts } = makeCtl();
    await expect(ctl.subscribe({ email: 'khong-phai-email' })).rejects.toThrow(
      /Email không hợp lệ/,
    );
    await expect(ctl.subscribe({})).rejects.toThrow();
    expect(upserts).toHaveLength(0);
  });
});
