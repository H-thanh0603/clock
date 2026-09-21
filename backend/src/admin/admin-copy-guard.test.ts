import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AdminService } from './admin.service';

/**
 * Copy guardrail (chặn mềm): Jev thấy claim rủi ro → response kèm jevWarning,
 * vẫn tạo record. Jev tắt → không warning.
 */
const OLD_ENV = { ...process.env };

function makeSvc() {
  const prisma = {
    product: { findMany: () => Promise.resolve([]) },
    promotion: {
      create: ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'promo-1', ...data }),
      findMany: () => Promise.resolve([]),
    },
    campaign: {
      create: ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'c-1', ...data }),
    },
  } as never;
  return new AdminService(prisma, {} as never, { upsertProduct: async () => {} } as never, {} as never);
}

const PROMO = {
  name: 'Sale',
  listingSlugs: ['a'],
  discountPct: 10,
  startsAt: '2026-09-01',
  endsAt: '2026-09-30',
};

describe('AdminService Jev copy guardrail', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllGlobals();
  });

  it('thiếu key → tạo bình thường, không warning', async () => {
    delete process.env.JEV_API_KEY;
    const svc = makeSvc();
    const r = (await svc.createPromotion(PROMO, 'a1')) as Record<string, unknown>;
    expect(r.name).toBe('Sale');
    expect(r.jevWarning).toBeUndefined();
  });

  it('claim rủi ro → vẫn tạo + kèm jevWarning', async () => {
    process.env.JEV_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            answers: {
              is_risky_claim: { noul: 0.92 },
              clarity: { choice: 'misleading' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const svc = makeSvc();
    const r = (await svc.createCampaign(
      { name: 'X', copyText: 'Bảo hành trọn đời, giảm giá sốc 99%' },
      'a1',
    )) as Record<string, unknown>;
    expect(r.status).toBe('draft');
    expect(String(r.jevWarning)).toContain('Jev');
  });

  it('copy sạch → không warning', async () => {
    process.env.JEV_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            answers: {
              is_risky_claim: { noul: 0.05 },
              clarity: { choice: 'clear' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const svc = makeSvc();
    const r = (await svc.createCampaign(
      { name: 'X', copyText: 'Giảm 10% Chronos từ 1/9 đến 30/9' },
      'a1',
    )) as Record<string, unknown>;
    expect(r.jevWarning).toBeUndefined();
  });
});
