import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const OLD_ENV = { ...process.env };
import { AdminCampaignsService } from './admin-campaigns.service';

describe('AdminCampaignsService', () => {
  it('tạo campaign + update status hợp lệ', async () => {
    const prisma = {
      campaign: {
        create: ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'c-1', ...data }),
        update: ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'c-1', ...data }),
      },
    };
    const svc = new AdminCampaignsService(prisma as never);
    const c = await svc.createCampaign({ name: 'Launch', budgetUsd: 500 }, 'a1');
    expect(c.status).toBe('draft');
    const u = await svc.updateCampaign('c-1', { status: 'active' });
    expect(u.status).toBe('active');
    await expect(svc.updateCampaign('c-1', { status: 'bogus' })).rejects.toThrow(
      /Status campaign/,
    );
  });
});

describe('AdminCampaignsService Jev copy guardrail', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllGlobals();
  });

  function makeSvc() {
    const prisma = {
      campaign: {
        create: ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'c-1', ...data }),
      },
    } as never;
    return new AdminCampaignsService(prisma);
  }

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
