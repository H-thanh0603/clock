import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ProductsService } from './products.service';

/**
 * Search hint khi rỗng: Meili 0 hit → Jev gợi ý 1 filter (allowlist cứng).
 * Jev tắt/chết → hint undefined, FE như cũ.
 */
const ROW = {
  slug: 'chronos-tourbillon',
  name: 'Chronos Tourbillon',
  reference: 'AC-CT-01',
  collection: 'tourbillon',
  priceUsd: 120000,
  priceVnd: BigInt(3024000000),
  shortDescription: 'x',
  badges: [],
  strapLabel: 'Da',
  cardImage: '/img.jpg',
  images: [],
  calibre: 'CAL',
  diameterMm: 41,
  caseMaterial: 'Rose Gold',
  complications: ['Tourbillon'],
  inBoutique: true,
  stock: 2,
  specs: [],
  narrative: '',
};

const OLD_ENV = { ...process.env };

function prismaStub(rows: unknown[]) {
  return {
    product: {
      findMany: () => Promise.resolve(rows),
      count: () => Promise.resolve(rows.length),
    },
  } as never;
}

// Meili enabled, search 0 hit.
const meiliEmpty = {
  enabled: true,
  searchSlugs: () => Promise.resolve([]),
} as never;

describe('ProductsService.list search hint', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllGlobals();
  });

  it('rỗng + Jev gợi ý tourbillon → hint movements', async () => {
    process.env.JEV_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            answers: {
              movements: { choice: 'tourbillon' },
              material: { choice: 'rose' },
              complications: { choice: null },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const svc = new ProductsService(prismaStub([]), meiliEmpty);
    const r = await svc.list({ q: 'toubilon dep' });
    expect(r.total).toBe(0);
    expect(r.hint).toEqual({
      kind: 'movements',
      value: 'tourbillon',
      label: 'Tourbillon Mystérieux',
    });
  });

  it('thiếu key → hint undefined', async () => {
    delete process.env.JEV_API_KEY;
    const svc = new ProductsService(prismaStub([]), meiliEmpty);
    const r = await svc.list({ q: 'xyz khong co' });
    expect(r.total).toBe(0);
    expect(r.hint).toBeUndefined();
  });

  it('có kết quả → không hint, không tốn call', async () => {
    process.env.JEV_API_KEY = 'k';
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchSpy);
    const svc = new ProductsService(prismaStub([ROW]), meiliEmpty);
    // Meili 0 hit vẫn rỗng — dùng meili có hit để test không gọi Jev.
    const meiliHit = {
      enabled: true,
      searchSlugs: () => Promise.resolve(['chronos-tourbillon']),
    } as never;
    const svc2 = new ProductsService(prismaStub([ROW]), meiliHit);
    const r = await svc2.list({ q: 'tourbillon' });
    expect(r.total).toBe(1);
    expect(r.hint).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
