import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { InquiriesController } from './inquiries.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotifyService } from '../notify/notify.service';

/**
 * Jev inquiry triage — mock fetch (không call thật).
 * - Jev tắt (thiếu key) → hành vi cũ: status NEW + ping Telegram.
 * - spam → status SPAM, không ping.
 * - vip → tag [VIP] đầu tin Telegram.
 */
function jevMock(answers: Record<string, unknown>) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ answers }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function makeCtl() {
  const created: { data: Record<string, unknown> }[] = [];
  const texts: string[] = [];
  const prisma = {
    inquiry: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        created.push({ data });
        return Promise.resolve({ id: 'inq-123456', ...data });
      },
    },
  } as unknown as PrismaService;
  const notify = {
    enqueueText: (t: string) => {
      texts.push(t);
      return Promise.resolve();
    },
    enqueueEmail: () => Promise.resolve(),
  } as unknown as NotifyService;
  return {
    ctl: new InquiriesController(prisma, notify),
    created,
    texts,
  };
}

const OLD_ENV = { ...process.env };

describe('InquiriesController Jev triage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllGlobals();
  });

  it('thiếu JEV_API_KEY → NEW + ping như cũ', async () => {
    delete process.env.JEV_API_KEY;
    const { ctl, created, texts } = makeCtl();
    const r = await ctl.create({
      type: 'SALON',
      name: 'Khach',
      phone: '0901',
    });
    expect(r.status).toBe('OK');
    expect(created[0].data.status).toBe('NEW');
    expect(texts).toHaveLength(1);
  });

  it('spam → SPAM, không ping Telegram', async () => {
    process.env.JEV_API_KEY = 'k';
    vi.stubGlobal('fetch', jevMock({
      is_spam: { noul: 0.95 },
      urgency: { choice: 'low' },
      lead_score: { choice: 'cold' },
    }));
    const { ctl, created, texts } = makeCtl();
    await ctl.create({
      type: 'SALON',
      name: 'Bot',
      phone: '000',
      message: 'buy crypto now',
    });
    expect(created[0].data.status).toBe('SPAM');
    expect(texts).toHaveLength(0);
  });

  it('vip bespoke → tag [VIP] + lead HOT', async () => {
    process.env.JEV_API_KEY = 'k';
    vi.stubGlobal('fetch', jevMock({
      is_spam: { noul: 0.01 },
      urgency: { choice: 'vip' },
      lead_score: { choice: 'hot' },
    }));
    const { ctl, created, texts } = makeCtl();
    await ctl.create({
      type: 'BESPOKE',
      name: 'Dai gia',
      phone: '0909',
      payload: { movement: 'tourbillon' },
    });
    expect(created[0].data.status).toBe('NEW');
    expect(texts[0]).toContain('[VIP]');
    expect(texts[0]).toContain('Lead: HOT');
  });

  it('Jev chết (500) → NEW + ping như cũ', async () => {
    process.env.JEV_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    const { ctl, created, texts } = makeCtl();
    await ctl.create({ type: 'SALON', name: 'K', phone: '01' });
    expect(created[0].data.status).toBe('NEW');
    expect(texts).toHaveLength(1);
  });
});
