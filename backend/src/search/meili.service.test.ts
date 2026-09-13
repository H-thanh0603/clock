import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MeiliService } from './meili.service';
import { ProductsService } from '../products/products.service';

/**
 * Meili integration — mock fetch (REST client thuần), không cần service
 * thật. Test cả fallback: Meili chết → Prisma contains cũ vẫn chạy.
 *
 * Mock fetch cần 2 nhóm route:
 * - /tasks/:uid → { status: 'succeeded' } (waitTask poll)
 * - /indexes/... → tùy test (search hits / document taskUid)
 */

const ROW = {
  slug: 'chronos-tourbillon',
  name: 'Chronos Tourbillon',
  reference: 'AC-CT-01',
  collection: 'tourbillon',
  priceUsd: 120000,
  priceVnd: BigInt(3024000000),
  shortDescription: 'Tourbillon flying one-minute',
  badges: [],
  strapLabel: 'Da cá sấu',
  cardImage: '/img.jpg',
  images: [],
  calibre: 'CAL-101',
  diameterMm: 41,
  caseMaterial: 'Rose Gold',
  complications: ['Tourbillon'],
  inBoutique: true,
  stock: 2,
  specs: [],
  narrative: '',
};

/** Mặc định: mọi call thành công, task luôn succeeded — search path dùng. */
function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/tasks/')) return taskResponse({ status: 'succeeded' });
    const body = handler(u, init);
    return new Response(JSON.stringify(body ?? {}), {
      status: body === null ? 500 : 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Response 409 index_already_exists — bootstrap lần 2 (đã có index). */
function indexExistsResponse() {
  return new Response(
    JSON.stringify({ code: 'index_already_exists' }),
    { status: 409, headers: { 'content-type': 'application/json' } },
  );
}

const taskResponse = (body: unknown) =>
  new Response(JSON.stringify(body ?? {}), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const prismaStub = {
  product: {
    findMany: vi.fn(async () => [ROW]),
    count: vi.fn(async () => 1),
  },
} as never;

describe('MeiliService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('disabled khi MEILI_HOST trống', () => {
    const svc = new MeiliService(prismaStub, '', '');
    expect(svc.enabled).toBe(false);
  });

  it('searchSlugs gọi REST /search và trả slug list', async () => {
    mockFetch((url) => {
      if (url.endsWith('/indexes/products/search'))
        return { hits: [{ slug: 'chronos-tourbillon' }, { slug: 'a' }] };
      return {};
    });
    const svc = new MeiliService(prismaStub, 'http://meili:7700', 'k');
    const slugs = await svc.searchSlugs('tourbillan', 10);
    expect(slugs).toEqual(['chronos-tourbillon', 'a']);
  });

  it('searchSlugs throw khi Meili chết (caller fallback)', async () => {
    mockFetch(() => null); // 500
    const svc = new MeiliService(prismaStub, 'http://meili:7700', 'k');
    await expect(svc.searchSlugs('x', 10)).rejects.toThrow(/Meili/);
  });

  it('upsertProduct không throw khi Meili chết', async () => {
    mockFetch(() => null);
    const svc = new MeiliService(prismaStub, 'http://meili:7700', 'k');
    await expect(svc.upsertProduct(ROW as never)).resolves.toBeUndefined();
  });

  it('bootstrap index documents + settings, idempotent', async () => {
    const fetchFn = mockFetch((url) => {
      if (url.endsWith('/indexes/products/documents')) return { taskUid: 1 };
      return {};
    });
    const svc = new MeiliService(prismaStub, 'http://meili:7700', 'k');
    await svc.bootstrap();
    await svc.bootstrap(); // lần 2 no-op (bootstrapped flag)
    const calls = fetchFn.mock.calls.map(([u]) => String(u));
    expect(calls.filter((u) => u.endsWith('/documents'))).toHaveLength(1);
  });

  it('bootstrap khi index đã tồn tại (409) → vẫn chạy, không throw', async () => {
    const fetchFn = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith('/indexes') && !u.includes('/search'))
        return indexExistsResponse();
      return taskResponse(u.includes('/tasks/') ? { status: 'succeeded' } : { taskUid: 2 });
    });
    vi.stubGlobal('fetch', fetchFn);
    const svc = new MeiliService(prismaStub, 'http://meili:7700', 'k');
    await expect(svc.bootstrap()).resolves.toBeUndefined();
    expect(svc['bootstrapped']).toBe(true);
  });

  it('searchSlugs includeHidden=true → KHÔNG gửi filter inBoutique', async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchFn = vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/search')) sentBody = JSON.parse(String(init?.body));
      return taskResponse(
        u.includes('/tasks/')
          ? { status: 'succeeded' }
          : u.endsWith('/search')
            ? { hits: [{ slug: 'an-roi' }] }
            : { taskUid: 3 },
      );
    });
    vi.stubGlobal('fetch', fetchFn);
    const svc = new MeiliService(prismaStub, 'http://meili:7700', 'k');
    const slugs = await svc.searchSlugs('vip', 10, true);
    expect(slugs).toEqual(['an-roi']);
    expect(sentBody['filter']).toBeUndefined();
  });

  it('searchSlugs mặc định → filter inBoutique = true (catalog public)', async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchFn = vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/search')) sentBody = JSON.parse(String(init?.body));
      return taskResponse(
        u.includes('/tasks/')
          ? { status: 'succeeded' }
          : u.endsWith('/search')
            ? { hits: [] }
            : { taskUid: 4 },
      );
    });
    vi.stubGlobal('fetch', fetchFn);
    const svc = new MeiliService(prismaStub, 'http://meili:7700', 'k');
    await svc.searchSlugs('vip', 10);
    expect(sentBody['filter']).toBe('inBoutique = true');
  });
});

describe('ProductsService — Meili relevance path + fallback', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  /** Mock đầy đủ: bootstrap path (tasks thành công) + search trả hits. */
  function mockSearch(hits: { slug: string }[] | null) {
    const fetchFn = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/tasks/')) return taskResponse({ status: 'succeeded' });
      if (u.endsWith('/search')) {
        if (hits === null) return new Response('{}', { status: 500 });
        return taskResponse({ hits });
      }
      // /indexes, /settings, /documents — taskUid để waitTask không poll.
      return taskResponse({ taskUid: 9 });
    });
    vi.stubGlobal('fetch', fetchFn);
    return fetchFn;
  }

  it('q có kết quả Meili → fetch theo thứ tự relevance (không orderBy)', async () => {
    const findMany = vi.fn(async (_args?: unknown) => [ROW]);
    mockSearch([{ slug: 'chronos-tourbillon' }]);
    const prisma = {
      product: { findMany, count: vi.fn(async () => 1) },
    } as never;
    const meili = new MeiliService(prisma, 'http://meili:7700', 'k');
    const svc = new ProductsService(prisma, meili);
    const res = await svc.list({ q: 'tourbillan' });
    expect(res.items[0]?.slug).toBe('chronos-tourbillon');
    // Call list (có orderBy để phân biệt với call bootstrap docs): fetch
    // theo slug set (relevance order), KHÔNG dùng orderBy.
    const listQuery = findMany.mock.calls
      .map(([a]) => a as Record<string, unknown>)
      .find((a) => a && 'orderBy' in a);
    expect(listQuery).toBeUndefined();
  });

  it('Meili chết → fallback Prisma contains (name/reference OR)', async () => {
    const findMany = vi.fn(async (_args?: unknown) => [ROW]);
    mockSearch(null); // search 500 → searchSlugs throw → fallback
    const prisma = {
      product: { findMany, count: vi.fn(async () => 1) },
    } as never;
    const meili = new MeiliService(prisma, 'http://meili:7700', 'k');
    const svc = new ProductsService(prisma, meili);
    const res = await svc.list({ q: 'tourbillon' });
    expect(res.items).toHaveLength(1);
    // Call list = call có orderBy (call bootstrap docs không có orderBy).
    const listQuery = findMany.mock.calls
      .map(([a]) => a as Record<string, unknown>)
      .find((a) => a && 'orderBy' in a);
    expect(JSON.stringify(listQuery?.where)).toContain('contains');
  });

  it('Meili trả rỗng → list rỗng, không quét DB', async () => {
    const findMany = vi.fn(async (_args?: unknown) => [ROW]);
    mockSearch([]);
    const prisma = {
      product: { findMany, count: vi.fn(async () => 1) },
    } as never;
    const meili = new MeiliService(prisma, 'http://meili:7700', 'k');
    const svc = new ProductsService(prisma, meili);
    const res = await svc.list({ q: 'zzz-khong-co' });
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe(0);
    // Chỉ touch DB khi bootstrap (findMany 1 lần cho docs), KHÔNG query
    // list — phân biệt qua orderBy: query list luôn có orderBy.
    const listQueries = findMany.mock.calls
      .map(([a]) => a as Record<string, unknown> | undefined)
      .filter((a): a is Record<string, unknown> => Boolean(a && 'orderBy' in a));
    expect(listQueries).toHaveLength(0);
  });

  it('MEILI_HOST trống → Prisma contains như cũ (behavior không đổi)', async () => {
    const findMany = vi.fn(async (_args?: unknown) => [ROW]);
    const prisma = {
      product: { findMany, count: vi.fn(async () => 1) },
    } as never;
    const meili = new MeiliService(prisma, '', ''); // disabled
    const svc = new ProductsService(prisma, meili);
    await svc.list({ q: 'tourbillon' });
    expect(JSON.stringify(findMany.mock.calls[0][0])).toContain('contains');
  });

  it('admin search (includeHidden) → Meili không lọc SP ẩn', async () => {
    const hiddenRow = { ...ROW, slug: 'vip-an', inBoutique: false };
    const findMany = vi.fn(async () => [ROW, hiddenRow]);
    let sentBody: Record<string, unknown> = {};
    const fetchFn = vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/tasks/')) return taskResponse({ status: 'succeeded' });
      if (u.endsWith('/search')) {
        sentBody = JSON.parse(String(init?.body));
        return taskResponse({ hits: [{ slug: 'vip-an' }] });
      }
      return taskResponse({ taskUid: 5 });
    });
    vi.stubGlobal('fetch', fetchFn);
    const prisma = {
      product: { findMany, count: vi.fn(async () => 2) },
    } as never;
    const meili = new MeiliService(prisma, 'http://meili:7700', 'k');
    const svc = new ProductsService(prisma, meili);
    // Backoffice: includeHidden qua opts (AdminService.listProducts gọi vậy).
    const res = await svc.list({ q: 'vip' }, { includeHidden: true });
    expect(sentBody['filter']).toBeUndefined();
    expect(res.items.map((i) => i.slug)).toContain('vip-an');
  });
});
